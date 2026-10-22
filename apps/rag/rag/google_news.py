"""google_news_search 타입 피드 전용: <source> 추출과 리다이렉트 링크 디코딩."""

from __future__ import annotations

from urllib.parse import urlparse

from googlenewsdecoder import gnewsdecoder


def source_host(entry: dict) -> str | None:
    """feedparser entry 의 <source url="..."> 호스트를 돌려준다. host 는 소문자, www./mobile. 접두사는 뗀다."""
    source = entry.get("source")
    if not source or not source.get("href"):
        return None
    host = urlparse(source["href"]).netloc.lower()
    for prefix in ("www.", "mobile.", "m."):
        if host.startswith(prefix):
            host = host[len(prefix) :]
    return host or None


def source_name(entry: dict) -> str | None:
    source = entry.get("source")
    return source.get("title") if source else None


def is_excluded(entry: dict, exclude_sources: list[str]) -> bool:
    host = source_host(entry)
    if not host:
        return False
    return any(host == domain or host.endswith("." + domain) for domain in exclude_sources)


def decode_real_url(google_link: str) -> str:
    """구글 뉴스 리다이렉트 링크(news.google.com/rss/articles/...)를 실제 기사 URL로 디코딩한다."""
    result = gnewsdecoder(google_link, interval=1)
    if not result.get("success"):
        raise RuntimeError(f"Google News 링크 디코딩 실패: {google_link} -> {result}")
    return result["decoded_url"]
