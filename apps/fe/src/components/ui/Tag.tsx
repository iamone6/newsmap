import type { ReactNode } from "react";

/** 태그 색 종류 (원본 .tag-accent / .tag-accent-2 / .tag-neutral) */
type TagTone = "accent" | "accent2" | "neutral";

const TONE_CLASSES: Record<TagTone, string> = {
  accent: "bg-accent-100 text-accent-800",
  accent2: "bg-accent-2-100 text-accent-2-800",
  neutral: "bg-neutral-100 text-neutral-800",
};

/**
 * 작은 알약 모양 라벨.
 * @param props.tone 색 종류 (기본 neutral)
 * @param props.children 표시할 내용
 * @returns span 요소
 */
export function Tag({ tone = "neutral", children }: { tone?: TagTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] tracking-wide ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
