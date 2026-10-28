from rag import regions


def test_match_full_emd_level(db_conn):
    m = regions.match_region(db_conn, sido_name="경기도", sigungu_name="수원시 영통구", emd_name="매탄1동")
    assert m.sido_code is not None
    assert m.sigungu_code is not None
    assert m.emd_code is not None


def test_match_sido_only(db_conn):
    m = regions.match_region(db_conn, sido_name="경기도", sigungu_name=None, emd_name=None)
    assert m.sido_code is not None
    assert m.sigungu_code is None
    assert m.emd_code is None


def test_match_unknown_region_returns_all_none(db_conn):
    m = regions.match_region(db_conn, sido_name="존재하지않는시도", sigungu_name=None, emd_name=None)
    assert m == regions.RegionMatch(None, None, None)


def test_match_no_region_returns_all_none(db_conn):
    m = regions.match_region(db_conn, sido_name=None, sigungu_name=None, emd_name=None)
    assert m == regions.RegionMatch(None, None, None)


def test_expand_region_codes_includes_general_gu_level(db_conn):
    m = regions.match_region(db_conn, sido_name="경기도", sigungu_name="수원시 영통구", emd_name="매탄1동")
    codes = regions.expand_region_codes(
        db_conn, [c for c in (m.emd_code, m.sigungu_code, m.sido_code) if c]
    )
    # 읍면동 -> 일반구(영통구) -> 시(수원시) -> 시도(경기도) 4단계가 전부 펼쳐져야 한다.
    assert len(codes) == 4
    assert m.sido_code in codes
    assert m.sigungu_code in codes
    assert m.emd_code in codes


def test_sido_alias_normalizes_old_names():
    # region_aliases.yaml: 광주·전남 옛 이름은 통합특별시로 바뀐다. 별칭에 없는 이름은 그대로.
    assert regions.normalize_sido_name("광주광역시") == "전남광주통합특별시"
    assert regions.normalize_sido_name("전라남도") == "전남광주통합특별시"
    assert regions.normalize_sido_name("경기도") == "경기도"


def _is_current(db_conn, code):
    with db_conn.cursor() as cur:
        cur.execute("SELECT valid_to IS NULL FROM regions WHERE code = %s", (code,))
        row = cur.fetchone()
    return bool(row and row[0])


def test_match_old_gwangju_name_to_merged_sido(db_conn):
    m = regions.match_region(db_conn, sido_name="광주광역시", sigungu_name="서구", emd_name=None)
    assert m.sido_code == "1200000000"
    assert m.sigungu_code is not None and m.sigungu_code.startswith("12")


def test_match_old_jeonnam_sido_only(db_conn):
    m = regions.match_region(db_conn, sido_name="전라남도", sigungu_name=None, emd_name=None)
    assert m == regions.RegionMatch("1200000000", None, None)


def test_match_split_sigungu_falls_back_to_unique_emd(db_conn):
    # 인천 중구는 제물포구/영종구로 나뉘어 현행 시군구에 없다. 연안동은 인천에서 하나뿐이라 읍면동으로 매칭된다.
    m = regions.match_region(db_conn, sido_name="인천광역시", sigungu_name="중구", emd_name="연안동")
    assert m.emd_code is not None
    assert m.sigungu_code is not None and m.sigungu_code.startswith("28125")


def test_match_only_returns_current_codes(db_conn):
    for name in ("광주광역시", "전라남도", "서울특별시"):
        m = regions.match_region(db_conn, sido_name=name, sigungu_name=None, emd_name=None)
        assert m.sido_code is not None
        assert _is_current(db_conn, m.sido_code)


def test_match_split_numbered_emd_falls_back_to_common_sigungu(db_conn):
    # 인천 중구 운서동은 영종구 운서1동·운서2동으로 나뉘었다. 읍면동은 정할 수 없지만 시군구(영종구)는 같다.
    m = regions.match_region(db_conn, sido_name="인천광역시", sigungu_name="중구", emd_name="운서동")
    assert m.emd_code is None
    assert m.sigungu_code is not None and m.sigungu_code.startswith("28155")


def test_match_renamed_sido_alias(db_conn):
    m = regions.match_region(db_conn, sido_name="전라북도", sigungu_name=None, emd_name=None)
    assert m == regions.RegionMatch("5200000000", None, None)
