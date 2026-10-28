import type { InputHTMLAttributes } from "react";

/**
 * 디자인 시스템 입력창 (원본 .input).
 * @param props 일반 input 속성
 * @returns input 요소
 */
export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-9 w-full rounded-full border border-divider bg-surface px-3.5 py-1.5 text-sm text-ink caret-accent hover:border-ink/45 focus-visible:border-accent focus-visible:outline-offset-0 ${className}`}
      {...rest}
    />
  );
}
