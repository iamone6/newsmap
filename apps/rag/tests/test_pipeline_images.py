from rag.llm_judge import ImageJudgment
from rag.page_parser import ParsedImage
from rag.pipeline import _build_images_to_save


def _no_wire_agency(_name: str | None) -> int | None:
    return None


def test_only_first_matching_image_is_marked_thumbnail():
    # jnilbo 처럼 본문에 썸네일과 같은 URL의 이미지가 중복으로 등장하는 경우,
    # is_thumbnail=True 는 최초 1건에만 붙어야 한다(부분 유니크 인덱스 위반 방지).
    thumbnail_url = "https://example.com/thumb.jpg"
    parsed_images = [
        ParsedImage(position=0, image_url=thumbnail_url, caption="첫번째"),
        ParsedImage(position=1, image_url=thumbnail_url, caption="두번째(중복)"),
    ]
    images_to_save = _build_images_to_save(parsed_images, [], thumbnail_url, _no_wire_agency)
    assert [img.is_thumbnail for img in images_to_save] == [True, False]


def test_thumbnail_not_in_body_images_is_appended_separately():
    thumbnail_url = "https://example.com/thumb.jpg"
    parsed_images = [ParsedImage(position=0, image_url="https://example.com/body.jpg", caption=None)]
    images_to_save = _build_images_to_save(parsed_images, [], thumbnail_url, _no_wire_agency)
    assert len(images_to_save) == 2
    assert sum(1 for img in images_to_save if img.is_thumbnail) == 1
    assert images_to_save[-1].image_url == thumbnail_url


def test_no_thumbnail_url_means_no_image_is_marked():
    parsed_images = [ParsedImage(position=0, image_url="https://example.com/body.jpg", caption=None)]
    images_to_save = _build_images_to_save(parsed_images, [], None, _no_wire_agency)
    assert all(not img.is_thumbnail for img in images_to_save)


def test_judgment_credit_is_matched_by_position():
    parsed_images = [ParsedImage(position=0, image_url="https://example.com/a.jpg", caption="연합뉴스 제공")]
    judgments = [ImageJudgment(index=0, credit_raw="연합뉴스 제공", wire_agency_name="연합뉴스")]
    images_to_save = _build_images_to_save(parsed_images, judgments, None, lambda name: 7 if name else None)
    assert images_to_save[0].credit_raw == "연합뉴스 제공"
    assert images_to_save[0].license_agency_id == 7
