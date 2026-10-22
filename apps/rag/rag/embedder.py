"""DeepInfra(OpenAI 호환 API)로 Qwen3-Embedding-0.6B 임베딩을 호출한다.

문서용 임베딩은 instruction 없이, 질의용 임베딩에는 Qwen3 의 query instruction 을 붙인다
(README/decisions.md 결정). `langchain_community.embeddings.DeepInfraEmbeddings`는
embed_instruction/query_instruction 을 자동으로 붙여주지만, 그 패키지 자체가 "sunset"
상태라 직접 `langchain_openai.OpenAIEmbeddings` 위에 같은 동작을 얇게 구현한다.
"""

from __future__ import annotations

from langchain_openai import OpenAIEmbeddings

# Qwen3-Embedding 공식 권장 질의용 instruction.
QUERY_INSTRUCTION = "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: "


def _client(*, base_url: str, api_key: str, model: str) -> OpenAIEmbeddings:
    return OpenAIEmbeddings(
        base_url=base_url,
        api_key=api_key,
        model=model,
        # tiktoken 기반 길이 사전검사는 Qwen 토크나이저를 모르므로 끈다(직접 확인함).
        check_embedding_ctx_length=False,
    )


def embed_documents(
    texts: list[str], *, base_url: str, api_key: str, model: str, expected_dimensions: int
) -> list[list[float]]:
    vectors = _client(base_url=base_url, api_key=api_key, model=model).embed_documents(texts)
    _check_dimensions(vectors, expected_dimensions)
    return vectors


def embed_query(
    text: str, *, base_url: str, api_key: str, model: str, expected_dimensions: int
) -> list[float]:
    vector = _client(base_url=base_url, api_key=api_key, model=model).embed_query(
        QUERY_INSTRUCTION + text
    )
    _check_dimensions([vector], expected_dimensions)
    return vector


def _check_dimensions(vectors: list[list[float]], expected: int) -> None:
    for vector in vectors:
        if len(vector) != expected:
            raise ValueError(f"임베딩 차원이 {expected} 가 아니라 {len(vector)} 다.")
