import type { Metadata } from "next";
import { Caprasimo, Figtree } from "next/font/google";
import "./globals.css";

/** 제목용 글꼴. globals.css 의 --font-heading 이 이 변수를 쓴다. */
const caprasimo = Caprasimo({
  variable: "--font-caprasimo",
  weight: "400",
  subsets: ["latin"],
});

/** 본문용 글꼴. globals.css 의 --font-body 가 이 변수를 쓴다. */
const figtree = Figtree({
  variable: "--font-figtree",
  weight: ["400", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NewsMap",
  description: "지도에서 지역을 골라 그 지역 언론 기사를 모아 보는 서비스",
};

/**
 * 모든 페이지를 감싸는 최상위 레이아웃.
 * @param props.children 각 페이지 내용
 * @returns html/body 골격
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: 브라우저 확장 프로그램이 <html> 에 속성을 붙여도 경고를 내지 않게 한다 (이 태그 한 단계에만 적용)
    <html lang="ko" className={`${caprasimo.variable} ${figtree.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="h-full">{children}</body>
    </html>
  );
}
