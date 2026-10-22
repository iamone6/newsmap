from pathlib import Path

from rag import page_parser

FIXTURE = Path(__file__).parent / "fixtures" / "sample_article.html"


def test_parse_real_article_fixture():
    html_text = FIXTURE.read_text(encoding="utf-8")
    article = page_parser.parse(
        html_text,
        fetched_url="https://www.joongboo.com/news/articleView.html?idxno=363740244",
        publisher_name="중부일보",
    )

    assert "법원 전산망 한때 장애" in article.title
    assert article.canonical_url == "https://www.joongboo.com/news/articleView.html?idxno=363740244"
    assert article.thumbnail_url and article.thumbnail_url.startswith("https://cdn.joongboo.com/")
    assert "이성관 기자" in article.body
    # 바이라인 뒤의 구글 팔로우 유도/기자 프로필 카드는 잘려나가야 한다.
    assert "구글에서" not in article.body
    assert "@joongboo.com" not in article.body  # 이메일 제거 확인
    assert len(article.images) == 1
    assert article.images[0].caption == "법원. 연합뉴스TV 자료사진"


def test_site_chrome_icon_is_filtered():
    assert page_parser._is_site_chrome_image("https://www.joongboo.com/image/icon_google.png") is True
    assert page_parser._is_site_chrome_image("https://cdn.joongboo.com/news/photo/202610/1.jpg") is False


def test_parse_raises_on_empty_html():
    import pytest

    with pytest.raises(ValueError):
        page_parser.parse("<html><body></body></html>", fetched_url="https://example.com/x")
