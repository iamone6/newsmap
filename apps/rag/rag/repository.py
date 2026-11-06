"""psycopg3 로 DB에 접근한다. 기사 저장은 한 트랜잭션으로 끝낸다."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

import psycopg
from pgvector import HalfVector
from pgvector.psycopg import register_vector


def connect(*, host: str, port: int, dbname: str, user: str, password: str) -> psycopg.Connection:
    conn = psycopg.connect(host=host, port=port, dbname=dbname, user=user, password=password)
    # autocommit 이 아니면 조회성 쿼리(find_seen_link 등)가 암묵적 트랜잭션을 열어두고,
    # 그 뒤의 `with conn.transaction():` 들이 최상위가 아니라 SAVEPOINT(중첩)로 취급돼
    # 실제 COMMIT 없이 conn.close() 에서 전부 롤백되는 문제가 있었다(직접 겪은 버그).
    # 매 `with conn.transaction():` 블록이 그 자체로 독립 트랜잭션이 되도록 autocommit 을 켠다.
    conn.autocommit = True
    register_vector(conn)  # article_chunks.embedding (halfvec) 어댑터 등록
    return conn


SKIP_NO_REGION = "no region"
"""seen_rss_links.skip_reason: LLM 이 기사가 특정 지역과 무관하다고 판단해 건너뜀"""
SKIP_NOT_MATCH_REGION = "not match region"
"""seen_rss_links.skip_reason: 지역명은 있었지만 시도·시군구·읍면동 코드 매칭이 모두 실패해 건너뜀"""


@dataclass(frozen=True)
class SeenLink:
    """이미 검사한 RSS 링크 한 건과, 연결된 기사의 RSS 갱신 시각 비교에 필요한 값"""

    article_id: int | None
    """연결된 기사 ID. 지역이 없어 건너뛴 링크는 None"""
    article_feed_key: str | None
    """연결된 기사를 처음 저장한 피드. canonical_url 중복으로 다른 피드의 기사에 연결된 링크면 이 링크의 feed_key 와 다르다"""
    rss_updated_at: datetime | None
    """연결된 기사의 articles.rss_updated_at"""


def find_seen_link(conn: psycopg.Connection, *, feed_key: str, rss_link: str) -> SeenLink | None:
    """이미 검사한 RSS 링크인지 확인하고, 그렇다면 연결된 기사 정보를 돌려준다.

    저장한 기사, canonical_url 중복으로 기존 기사에 연결한 링크, 지역이 없어 건너뛴 링크(article_id NULL)
    모두 "이미 본 것"이다. 건너뛴 링크도 다시 열면 LLM 을 또 부르게 되므로 행이 있으면 본 것으로 친다.

    Args:
        conn: DB 커넥션.
        feed_key: 피드 식별자.
        rss_link: RSS 항목 링크.

    Returns:
        seen_rss_links 에 행이 있으면 SeenLink, 없으면 None.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.article_id, a.feed_key, a.rss_updated_at
            FROM seen_rss_links s
            LEFT JOIN articles a ON a.id = s.article_id
            WHERE s.feed_key = %s AND s.rss_link = %s
            """,
            (feed_key, rss_link),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return SeenLink(article_id=row[0], article_feed_key=row[1], rss_updated_at=row[2])


def update_rss_updated_at(conn: psycopg.Connection, *, article_id: int, rss_updated_at: datetime) -> None:
    """이미 저장한 기사의 RSS 갱신 시각만 바꾼다. 기사를 다시 파싱하지는 않는다(decisions 문서 5장).

    Args:
        conn: DB 커넥션 (autocommit).
        article_id: 기사 ID.
        rss_updated_at: RSS 항목의 새 updated 시각.
    """
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE articles SET rss_updated_at = %s, updated_at = now() WHERE id = %s",
            (rss_updated_at, article_id),
        )


def find_article_id_by_canonical_url(conn: psycopg.Connection, canonical_url: str) -> int | None:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM articles WHERE canonical_url = %s", (canonical_url,))
        row = cur.fetchone()
        return row[0] if row else None


def mark_seen(conn: psycopg.Connection, *, feed_key: str, rss_link: str, article_id: int) -> None:
    """canonical_url 중복으로 새 기사를 안 만들 때, seen_rss_links 만 기록한다. 자체 트랜잭션으로 즉시 커밋."""
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO seen_rss_links (feed_key, rss_link, article_id) VALUES (%s, %s, %s)"
                " ON CONFLICT DO NOTHING",
                (feed_key, rss_link, article_id),
            )


def mark_skipped(conn: psycopg.Connection, *, feed_key: str, rss_link: str, skip_reason: str) -> None:
    """지역이 없어 저장하지 않은 기사의 링크를 seen_rss_links 에 기록한다. 자체 트랜잭션으로 즉시 커밋.

    기사 행이 없으므로 article_id 는 NULL 이고, 사유는 skip_reason 에 남긴다(스키마 CHECK 제약).

    Args:
        conn: DB 커넥션.
        feed_key: 피드 식별자.
        rss_link: RSS 항목 링크.
        skip_reason: SKIP_NO_REGION 또는 SKIP_NOT_MATCH_REGION.
    """
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO seen_rss_links (feed_key, rss_link, skip_reason) VALUES (%s, %s, %s)"
                " ON CONFLICT DO NOTHING",
                (feed_key, rss_link, skip_reason),
            )


@dataclass(frozen=True)
class RegionToSave:
    sido_code: str | None
    sigungu_code: str | None
    emd_code: str | None
    sido_name: str | None
    sigungu_name: str | None
    emd_name: str | None


@dataclass(frozen=True)
class ImageToSave:
    position: int
    image_url: str
    caption: str | None
    credit_raw: str | None
    license_agency_id: int | None
    is_thumbnail: bool


@dataclass(frozen=True)
class ChunkToSave:
    chunk_index: int
    content: str
    embed_text: str
    token_count: int
    embedding: list[float]


@dataclass(frozen=True)
class ArticleToSave:
    feed_key: str
    publisher_name: str
    rss_link: str
    canonical_url: str
    title: str
    subtitle: str | None
    body: str
    reporters: list[str]
    wire_agency_id: int | None
    wire_source_raw: str | None
    published_at: datetime
    published_at_source: str
    rss_created_at: datetime | None
    rss_updated_at: datetime | None
    region: RegionToSave | None
    section_id: int | None
    images: list[ImageToSave] = field(default_factory=list)
    chunks: list[ChunkToSave] = field(default_factory=list)
    region_codes: list[str] = field(default_factory=list)


def save_article(conn: psycopg.Connection, article: ArticleToSave) -> int:
    """기사 + 하위 테이블 + seen_rss_links 를 한 트랜잭션으로 저장하고 article id 를 돌려준다."""
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO articles (
                    feed_key, publisher_name, rss_link, canonical_url, title, subtitle, body,
                    reporters, wire_agency_id, wire_source_raw,
                    published_at, published_at_source, rss_created_at, rss_updated_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id
                """,
                (
                    article.feed_key,
                    article.publisher_name,
                    article.rss_link,
                    article.canonical_url,
                    article.title,
                    article.subtitle,
                    article.body,
                    article.reporters,
                    article.wire_agency_id,
                    article.wire_source_raw,
                    article.published_at,
                    article.published_at_source,
                    article.rss_created_at,
                    article.rss_updated_at,
                ),
            )
            article_id = cur.fetchone()[0]

            if article.region is not None:
                cur.execute(
                    """
                    INSERT INTO article_regions (
                        article_id, sido_code, sigungu_code, emd_code,
                        sido_name, sigungu_name, emd_name, is_primary
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,true)
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        article_id,
                        article.region.sido_code,
                        article.region.sigungu_code,
                        article.region.emd_code,
                        article.region.sido_name,
                        article.region.sigungu_name,
                        article.region.emd_name,
                    ),
                )

            if article.section_id is not None:
                cur.execute(
                    "INSERT INTO article_sections (article_id, section_id, is_primary)"
                    " VALUES (%s, %s, true) ON CONFLICT DO NOTHING",
                    (article_id, article.section_id),
                )

            for image in article.images:
                cur.execute(
                    """
                    INSERT INTO article_images (
                        article_id, position, image_url, caption, credit_raw,
                        license_agency_id, is_thumbnail
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (article_id, position) DO NOTHING
                    """,
                    (
                        article_id,
                        image.position,
                        image.image_url,
                        image.caption,
                        image.credit_raw,
                        image.license_agency_id,
                        image.is_thumbnail,
                    ),
                )

            is_wire = article.wire_agency_id is not None
            section_ids = [article.section_id] if article.section_id is not None else []
            for chunk in article.chunks:
                cur.execute(
                    """
                    INSERT INTO article_chunks (
                        article_id, chunk_index, content, embed_text, token_count,
                        embedding, region_codes, section_ids, published_at, is_wire
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (article_id, chunk_index) DO NOTHING
                    """,
                    (
                        article_id,
                        chunk.chunk_index,
                        chunk.content,
                        chunk.embed_text,
                        chunk.token_count,
                        HalfVector(chunk.embedding),
                        article.region_codes,
                        section_ids,
                        article.published_at,
                        is_wire,
                    ),
                )

            cur.execute(
                "INSERT INTO seen_rss_links (feed_key, rss_link, article_id) VALUES (%s,%s,%s)"
                " ON CONFLICT DO NOTHING",
                (article.feed_key, article.rss_link, article_id),
            )

    return article_id
