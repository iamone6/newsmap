"""콘솔 출력 + 로그 파일 2종을 설정한다.

- `rag.log`: 매체(feed) 하나의 처리가 끝날 때마다 INFO 로 요약 1줄(총/성공/실패 건수)을
  남긴다. 일별 로테이션.
- `rag_error.log`: 기사 처리 중 발생한 예외를 어느 매체/기사인지와 함께 남긴다(기존
  `log.exception(...)` 호출을 그대로 재사용). 월별 로테이션.

둘 다 사람이 보는 콘솔 출력과는 분리된 파일이라, 로그 파일 쪽 로거는 콘솔로 전파하지
않거나(rag.log) 콘솔에도 그대로 보이게(rag_error.log, 기존 동작 유지) 각각 다르게 둔다.
"""

from __future__ import annotations

import logging
import logging.handlers
import re
from datetime import datetime
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
SUMMARY_LOGGER_NAME = "rag.summary"

# 일별 로그는 대략 한 달치, 월별 에러 로그는 1년치 보관 (루트 CLAUDE.md 의 DB 1년 보존과 맞춤).
SUMMARY_BACKUP_COUNT = 30
ERROR_BACKUP_COUNT = 12


class MonthlyRotatingFileHandler(logging.handlers.TimedRotatingFileHandler):
    """매월 1일 00:00 기준으로 로그 파일을 돌린다.

    stdlib `TimedRotatingFileHandler`는 when="midnight"/"D"/"W0"-"W6" 까지만 지원하고
    월 단위는 없다(달마다 날수가 달라 고정 interval로 표현이 안 됨). 로테이션 시점만
    "다음 달 1일 00:00"으로 바꿔 계산하고, 나머지(백업 정리, 재시작 시 재계산 등)는
    그대로 재사용한다.
    """

    def __init__(self, filename: str | Path, backup_count: int = ERROR_BACKUP_COUNT, encoding: str = "utf-8"):
        super().__init__(filename, when="midnight", interval=1, backupCount=backup_count, encoding=encoding)
        self.suffix = "%Y-%m"
        self.extMatch = re.compile(r"^\d{4}-\d{2}$")

    def computeRollover(self, currentTime: int) -> int:
        current = datetime.fromtimestamp(currentTime)
        if current.month == 12:
            next_month = current.replace(year=current.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            next_month = current.replace(month=current.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        return int(next_month.timestamp())


def configure_logging(*, verbose: bool, log_dir: Path = LOG_DIR) -> None:
    log_dir.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(logging.DEBUG if verbose else logging.INFO)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(threadName)s] %(name)s: %(message)s"))
    root.addHandler(console_handler)

    summary_handler = logging.handlers.TimedRotatingFileHandler(
        log_dir / "rag.log", when="midnight", interval=1, backupCount=SUMMARY_BACKUP_COUNT, encoding="utf-8"
    )
    summary_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s: %(message)s"))
    summary_logger = logging.getLogger(SUMMARY_LOGGER_NAME)
    summary_logger.setLevel(logging.INFO)
    summary_logger.addHandler(summary_handler)
    summary_logger.propagate = False  # 콘솔에는 cli.py 의 기존 출력으로 충분, 중복 표시 안 함.

    error_handler = MonthlyRotatingFileHandler(log_dir / "rag_error.log", backup_count=ERROR_BACKUP_COUNT)
    error_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(threadName)s] %(name)s: %(message)s"))
    error_handler.setLevel(logging.ERROR)
    logging.getLogger("rag").addHandler(error_handler)
