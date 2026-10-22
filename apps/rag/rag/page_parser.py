"""기사 페이지에서 제목/부제목/본문/canonical/썸네일/이미지+캡션을 추출한다.

사이트별 커스텀 파서를 두지 않고 범용 추출기(trafilatura)를 1차로 쓰고,
canonical/썸네일은 메타태그를 BeautifulSoup으로 직접 보강한다.

알려진 한계(새로 정한 처리): 한국 언론사 CMS는 본문 뒤에 "OOO 기자" 바이라인 다음
구글 팔로우 유도 이미지·기자 프로필 사진 같은 광고성 블록이 같은 본문 컨테이너에
붙어 나오는 경우가 많다. 이게 범용 추출에 그대로 섞여 들어오므로, 바이라인("OOO 기자")
마지막 등장 위치 이후의 텍스트/이미지는 잘라낸다. 부제목은 범용 추출로 신뢰성 있게
구분할 방법이 없어 항상 None 으로 둔다(사이트가 명확한 부제목 메타를 제공하면 나중에 보강).
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass

import requests
import trafilatura
from bs4 import BeautifulSoup

USER_AGENT = "Mozilla/5.0 (compatible; newsmap-rag/0.1; +https://github.com/iamone6/newsmap)"
REQUEST_TIMEOUT = 15

_BYLINE_RE = re.compile(r"^[가-힣]{2,4}\s*기자\s*$", re.MULTILINE)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_MD_IMAGE_RE = re.compile(r"!\[(?P<caption>.*?)\]\((?P<url>.*?)\)")


@dataclass(frozen=True)
class ParsedImage:
    position: int
    image_url: str
    caption: str | None


@dataclass(frozen=True)
class ParsedArticle:
    title: str
    subtitle: str | None
    body: str
    canonical_url: str
    thumbnail_url: str | None
    images: list[ParsedImage]


def fetch(url: str) -> tuple[str, str]:
    """페이지 HTML과 (리다이렉트 반영) 최종 URL을 돌려준다."""
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.text, response.url


def _clean_text(text: str) -> str:
    text = html.unescape(text)
    text = _EMAIL_RE.sub("", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _truncate_at_byline(text: str) -> str:
    """본문 실제 끝을 알리는 첫 "OOO 기자" 단독 줄 뒤를 잘라낸다.

    그 뒤에 나오는 구글 팔로우 유도·기자 프로필 카드 같은 반복 블록을 제거하기 위함.
    """
    match = _BYLINE_RE.search(text)
    if not match:
        return text
    return text[: match.end()]


def _strip_title_suffix(title: str, publisher_name: str | None) -> str:
    if publisher_name and title.endswith(f" - {publisher_name}"):
        return title[: -len(f" - {publisher_name}")].strip()
    return title


def parse(html_text: str, *, fetched_url: str, publisher_name: str | None = None) -> ParsedArticle:
    soup = BeautifulSoup(html_text, "lxml")

    canonical_tag = soup.find("link", rel="canonical")
    canonical_url = canonical_tag.get("href") if canonical_tag else None
    canonical_url = canonical_url or fetched_url

    og_image_tag = soup.find("meta", property="og:image")
    thumbnail_url = og_image_tag.get("content") if og_image_tag else None

    extracted_json = trafilatura.extract(
        html_text,
        output_format="json",
        with_metadata=True,
        include_images=True,
        url=fetched_url,
    )
    if not extracted_json:
        raise ValueError(f"trafilatura 가 본문을 추출하지 못했다: {fetched_url}")

    import json

    data = json.loads(extracted_json)
    raw_title = data.get("title") or ""
    title = _strip_title_suffix(raw_title, publisher_name)
    thumbnail_url = thumbnail_url or data.get("image")

    raw_text = _truncate_at_byline(data.get("text") or "")

    images: list[ParsedImage] = []
    for position, match in enumerate(_MD_IMAGE_RE.finditer(raw_text)):
        caption = match.group("caption").strip() or None
        images.append(ParsedImage(position=position, image_url=match.group("url"), caption=caption))

    body_without_images = _MD_IMAGE_RE.sub("", raw_text)
    body = _clean_text(body_without_images)

    if not title or not body:
        raise ValueError(f"제목 또는 본문이 비어 있다: {fetched_url}")

    return ParsedArticle(
        title=title,
        subtitle=None,
        body=body,
        canonical_url=canonical_url,
        thumbnail_url=thumbnail_url,
        images=images,
    )
