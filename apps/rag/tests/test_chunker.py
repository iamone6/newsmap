from datetime import datetime, timezone

from rag import chunker


def test_short_text_is_single_chunk():
    body = "짧은 문단입니다.\n\n두 번째 문단입니다."
    chunks = chunker.chunk_article(
        body=body,
        title="제목",
        region_label="경기도",
        published_at=datetime(2026, 10, 22, tzinfo=timezone.utc),
        chunk_max_tokens=500,
        chunk_overlap_ratio=0.1,
    )
    assert len(chunks) == 1
    assert chunks[0].chunk_index == 0
    assert chunks[0].content == body
    assert chunks[0].embed_text.startswith("[지역: 경기도 | 날짜: 2026-10-22 | 제목: 제목]\n")
    assert chunks[0].token_count == chunker.count_tokens(body)


def test_long_text_splits_with_overlap_and_respects_token_budget():
    paragraph = "가나다라마바사아자차카타파하. " * 40  # 문단 하나가 토큰 예산을 넘기게 만든다
    body = "\n\n".join([paragraph] * 5)
    chunk_max_tokens = 100
    chunks = chunker.chunk_article(
        body=body,
        title="제목",
        region_label="전국",
        published_at=datetime(2026, 10, 22, tzinfo=timezone.utc),
        chunk_max_tokens=chunk_max_tokens,
        chunk_overlap_ratio=0.1,
    )
    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk.token_count <= chunk_max_tokens
    # chunk_index 가 0부터 순서대로 매겨진다.
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))
