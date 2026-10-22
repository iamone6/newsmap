"""Recursive Character Splitter(문단 우선) + Qwen3 토크나이저 기준 오버랩 청킹."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache

from langchain_text_splitters import RecursiveCharacterTextSplitter
from transformers import AutoTokenizer

TOKENIZER_MODEL = "Qwen/Qwen3-Embedding-0.6B"


@lru_cache(maxsize=1)
def _tokenizer():
    return AutoTokenizer.from_pretrained(TOKENIZER_MODEL)


def count_tokens(text: str) -> int:
    return len(_tokenizer().tokenize(text))


def _splitter(chunk_max_tokens: int, overlap_ratio: float) -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        # 문단(\n\n) -> 줄바꿈(\n) 우선이지만, 줄바꿈이 없는 긴 문단도 토큰 예산을 지켜야
        # 하므로 공백 단위 분할을 마지막 fallback으로 둔다(문자 단위 "" 는 안 씀).
        separators=["\n\n", "\n", " "],
        chunk_size=chunk_max_tokens,
        chunk_overlap=int(chunk_max_tokens * overlap_ratio),
        length_function=count_tokens,
    )


@dataclass(frozen=True)
class Chunk:
    chunk_index: int
    content: str
    embed_text: str
    token_count: int


def chunk_article(
    *,
    body: str,
    title: str,
    region_label: str,
    published_at: datetime,
    chunk_max_tokens: int,
    chunk_overlap_ratio: float,
) -> list[Chunk]:
    pieces = _splitter(chunk_max_tokens, chunk_overlap_ratio).split_text(body)
    header = f"[지역: {region_label} | 날짜: {published_at:%Y-%m-%d} | 제목: {title}]"
    return [
        Chunk(
            chunk_index=index,
            content=content,
            embed_text=f"{header}\n{content}",
            token_count=count_tokens(content),
        )
        for index, content in enumerate(pieces)
    ]
