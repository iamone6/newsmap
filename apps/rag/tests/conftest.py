from __future__ import annotations

import pytest

from rag import config, repository


@pytest.fixture(scope="session")
def db_conn():
    """로컬 DB가 떠 있으면 커넥션을 주고, 안 떠 있으면 그 DB 의존 테스트들을 스킵한다."""
    try:
        settings = config.load_settings()
        conn = repository.connect(
            host=settings.db_host,
            port=settings.db_port,
            dbname=settings.db_database,
            user=settings.db_username,
            password=settings.db_password,
        )
    except Exception as exc:  # noqa: BLE001 - DB 연결 실패는 스킵 사유로 취급
        pytest.skip(f"로컬 DB에 연결할 수 없어 스킵: {exc}")
        return
    yield conn
    conn.close()
