from pathlib import Path

import feedparser

from rag import google_news

FIXTURE = Path(__file__).parent / "fixtures" / "sample_google_news.xml"


def _entries():
    return feedparser.parse(FIXTURE.read_bytes()).entries


def test_source_host_and_name_parsed_from_entries():
    entries = _entries()
    assert entries, "fixture 에 item이 있어야 한다"
    hosts = [google_news.source_host(e) for e in entries]
    names = [google_news.source_name(e) for e in entries]
    assert any(hosts)
    assert any(names)


def test_is_excluded_matches_known_national_outlet():
    entries = _entries()
    chosun_like = next((e for e in entries if (google_news.source_name(e) or "") == "조선일보"), None)
    assert chosun_like is not None, "fixture 에 조선일보 기사가 있어야 한다(없으면 fixture 재수집 필요)"
    assert google_news.is_excluded(chosun_like, ["chosun.com"]) is True


def test_is_excluded_false_when_not_in_blocklist():
    entries = _entries()
    non_excluded = next((e for e in entries if (google_news.source_host(e) or "") not in ("chosun.com",)), None)
    assert non_excluded is not None
    assert google_news.is_excluded(non_excluded, ["chosun.com"]) is False


def test_is_excluded_handles_subdomain():
    entry = {"source": {"href": "https://mobile.busan.com/a", "title": "부산일보"}}
    assert google_news.is_excluded(entry, ["busan.com"]) is True
    assert google_news.source_host(entry) == "busan.com"
