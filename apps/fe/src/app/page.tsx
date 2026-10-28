import { NewsMapApp } from "@/features/app/NewsMapApp";

/**
 * 첫 화면("/"). 지도 앱 전체는 브라우저에서 동작하는 클라이언트 컴포넌트(NewsMapApp)다.
 * @returns NewsMap 화면
 */
export default function HomePage() {
  return <NewsMapApp />;
}
