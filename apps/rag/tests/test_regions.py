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
