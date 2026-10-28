import type { ButtonHTMLAttributes } from "react";

/** 버튼 모양 종류 (원본 디자인 시스템의 .btn-primary / .btn-secondary / .btn-ghost) */
type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 모양. 기본은 secondary(테두리만 있는 버튼) */
  variant?: ButtonVariant;
  /** true 면 아이콘만 들어가는 동그란 정사각 버튼 */
  iconOnly?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-bg hover:bg-accent-600 active:bg-accent-700",
  secondary: "border-divider hover:bg-ink/7 active:bg-ink/14",
  ghost: "px-1 text-accent hover:bg-accent/10 active:bg-accent/18",
};

/**
 * 디자인 시스템 버튼.
 * @param props 일반 button 속성 + variant, iconOnly
 * @returns button 요소
 */
export function Button({ variant = "secondary", iconOnly = false, className = "", type = "button", ...rest }: ButtonProps) {
  const sizeClasses = iconOnly ? "size-9 p-0" : "px-4 py-2";
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-transparent font-heading text-sm leading-tight text-ink disabled:cursor-not-allowed disabled:opacity-45 ${sizeClasses} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
