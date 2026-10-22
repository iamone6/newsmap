"""psycopg3 로 DB에 접근한다. 기사 저장은 한 트랜잭션으로 끝낸다."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

import psycopg
from pgvector import HalfVector
from pgvector.psycopg import register_vector


def connect(*, host: str, port: int, dbname: str, user: str, password: str) -> psycopg.Connection:
    conn = psycopg.connect(host=host, port=port, dbname=dbname, user=user, password=password)
    # autocommit 이 아니면 조회성 쿼리(find_seen_article_id 등)가 암묵적 트랜잭션을 열어두고,
    # 그 뒤의 `with conn.transaction():` 들이 최상위가 아니라 SAVEPOINT(중첩)로 취급돼
    # 실제 COMMIT 없이 conn.close() 에서 전부 롤백되는 문제가 있었다(직접 겪은 버그).
    # 매 `with conn.transaction():` 블록이 그 자체로 독립 트랜잭션이 되도록 autocommit 을 켠다.
    conn.autocommit = True
    register_vector(conn)  # article_chunks.embedding (halfvec) 어댑터 등록
    return conn


def find_seen_article_id(conn: psycopg.Connection, *, feed_key: str, rss_link: str) -> int | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT article_id FROM seen_rss_links WHERE feed_key = %s AND rss_link = %s",
            (feed_key, rss_link),
        )
        row = cur.fetchone()
        return row[0] if row else None


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
