/**
 * 경계 파일을 불러오는 동안 지도 위쪽 가운데에 뜨는 안내.
 * @returns 안내 배지
 */
export function MapLoadingBadge() {
  return (
    <div className="absolute top-3.5 left-1/2 z-[760] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs text-bg">
      경계 불러오는 중…
    </div>
  );
}
