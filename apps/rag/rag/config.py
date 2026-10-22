"""환경변수(.env)와 피드 설정(feeds.yaml)을 읽어 파이프라인 전역에서 쓰는 설정 객체로 만든다."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import load_dotenv

PACKAGE_ROOT = Path(__file__).resolve().parent.parent  # apps/rag
FEEDS_PATH = PACKAGE_ROOT / "feeds.yaml"


@dataclass(frozen=True)
class Settings:
    db_host: str
    db_port: int
    db_database: str
    db_username: str
    db_password: str
    deepinfra_api_key: str
    deepinfra_base_url: str
    embedding_model: str
    embedding_dimensions: int
    llm_model: str
    chunk_max_tokens: int
    chunk_overlap_ratio: float


def load_settings() -> Settings:
    """.env (호스트에서 직접 실행할 때) 또는 이미 설정된 환경변수를 읽는다.

    docker compose 의 env_file/environment 로 이미 채워진 경우 load_dotenv 는
    기존 값을 덮어쓰지 않는다(override=False 가 기본값).
    """
    load_dotenv(PACKAGE_ROOT / ".env")

    def _require(name: str) -> str:
        value = os.environ.get(name, "").strip()
        if not value:
            raise RuntimeError(f"환경변수 {name} 이 비어 있다. apps/rag/.env 를 확인해라.")
        return value

    return Settings(
        db_host=_require("DB_HOST"),
        db_port=int(_require("DB_PORT")),
        db_database=_require("DB_DATABASE"),
        db_username=_require("DB_USERNAME"),
        db_password=_require("DB_PASSWORD"),
        deepinfra_api_key=_require("DEEPINFRA_API_KEY"),
        deepinfra_base_url=_require("DEEPINFRA_BASE_URL"),
        embedding_model=_require("EMBEDDING_MODEL"),
        embedding_dimensions=int(_require("EMBEDDING_DIMENSIONS")),
        llm_model=_require("LLM_MODEL"),
        chunk_max_tokens=int(_require("CHUNK_MAX_TOKENS")),
        chunk_overlap_ratio=float(_require("CHUNK_OVERLAP_RATIO")),
    )


@dataclass(frozen=True)
class FeedConfig:
    feed_key: str
    type: str  # "direct" | "google_news_search"
    rss_url: str
    publisher_name: str | None = None
    note: str | None = None


@dataclass(frozen=True)
class FeedsFile:
    feeds: dict[str, FeedConfig]
    exclude_sources: list[str]


def load_feeds(path: Path = FEEDS_PATH) -> FeedsFile:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    feeds = {
        entry["feed_key"]: FeedConfig(
            feed_key=entry["feed_key"],
            type=entry["type"],
            rss_url=entry["rss_url"],
            publisher_name=entry.get("publisher_name"),
            note=entry.get("note"),
        )
        for entry in raw["feeds"]
    }
    return FeedsFile(feeds=feeds, exclude_sources=list(raw.get("exclude_sources", [])))


def get_feed(feed_key: str, path: Path = FEEDS_PATH) -> FeedConfig:
    feeds_file = load_feeds(path)
    try:
        return feeds_file.feeds[feed_key]
    except KeyError:
        raise RuntimeError(f"feeds.yaml 에 feed_key={feed_key!r} 가 없다.") from None
