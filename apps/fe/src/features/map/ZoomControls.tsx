import { Button } from "@/components/ui/Button";

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** "전국" 버튼: 선택을 풀고 전국 보기로 */
  onReset: () => void;
}

/**
 * 지도 아래쪽 가운데의 확대·축소·전국 버튼. (모바일에서는 숨긴다)
 * @param props 버튼별 동작
 * @returns 버튼 묶음
 */
export function ZoomControls({ onZoomIn, onZoomOut, onReset }: ZoomControlsProps) {
  return (
    <div className="absolute bottom-14 left-1/2 z-[700] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-bg/92 px-1.5 py-1 shadow-sm max-md:hidden">
      <Button iconOnly aria-label="확대" onClick={onZoomIn}>
        ＋
      </Button>
      <Button iconOnly aria-label="축소" onClick={onZoomOut}>
        －
      </Button>
      <Button variant="ghost" onClick={onReset}>
        전국
      </Button>
    </div>
  );
}
