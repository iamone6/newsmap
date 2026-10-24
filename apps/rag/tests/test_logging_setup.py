from __future__ import annotations

import logging
from datetime import datetime

import pytest

from rag import logging_setup


def test_monthly_handler_rolls_to_first_of_next_month(tmp_path):
    handler = logging_setup.MonthlyRotatingFileHandler(tmp_path / "rag_error.log")
    try:
        mid_october = int(datetime(2026, 10, 15, 13, 0, 0).timestamp())
        rollover = datetime.fromtimestamp(handler.computeRollover(mid_october))
        assert rollover == datetime(2026, 11, 1, 0, 0, 0)
    finally:
        handler.close()


def test_monthly_handler_wraps_december_into_next_january(tmp_path):
    handler = logging_setup.MonthlyRotatingFileHandler(tmp_path / "rag_error.log")
    try:
        december = int(datetime(2026, 12, 20, 9, 0, 0).timestamp())
        rollover = datetime.fromtimestamp(handler.computeRollover(december))
        assert rollover == datetime(2027, 1, 1, 0, 0, 0)
    finally:
        handler.close()


@pytest.fixture
def _clean_rag_loggers():
    """configure_logging() 이 추가한 핸들러를 테스트 뒤에 정리해 다른 테스트에 영향 없게 한다."""
    root = logging.getLogger()
    summary_logger = logging.getLogger(logging_setup.SUMMARY_LOGGER_NAME)
    rag_logger = logging.getLogger("rag")
    before = (list(root.handlers), list(summary_logger.handlers), list(rag_logger.handlers))
    yield
    for logger, handlers in zip((root, summary_logger, rag_logger), before):
        for h in list(logger.handlers):
            if h not in handlers:
                logger.removeHandler(h)
                h.close()


def test_configure_logging_writes_summary_and_error_to_separate_files(tmp_path, _clean_rag_loggers):
    logging_setup.configure_logging(verbose=False, log_dir=tmp_path)

    logging.getLogger(logging_setup.SUMMARY_LOGGER_NAME).info("feed_key=test 처리 완료 - 총=1 성공=1 실패=0 중복=0")
    logging.getLogger("rag.pipeline").error("기사 처리 실패: feed_key=test rss_link=https://example.com/1")

    for handler in logging.getLogger().handlers + logging.getLogger("rag").handlers:
        handler.flush()
    for handler in logging.getLogger(logging_setup.SUMMARY_LOGGER_NAME).handlers:
        handler.flush()

    summary_content = (tmp_path / "rag.log").read_text(encoding="utf-8")
    error_content = (tmp_path / "rag_error.log").read_text(encoding="utf-8")

    assert "feed_key=test 처리 완료" in summary_content
    assert "기사 처리 실패" not in summary_content  # 요약 로그에는 에러가 안 섞인다.
    assert "기사 처리 실패: feed_key=test rss_link=https://example.com/1" in error_content
