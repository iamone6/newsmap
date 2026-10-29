import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 도커 이미지에서 node_modules 전체 없이 `node server.js` 만으로 돌리기 위해 필요한 파일만 .next/standalone 에 모은다
  output: "standalone",
  cacheComponents: true,
  // 기사 썸네일(언론사 이미지)을 next/image 로 줄여서 디스크에 캐시한다 (/_next/image).
  // 언론사·통신사 이미지 호스트가 수십 곳이고 계속 늘어나서 호스트를 하나하나 적지 않고 모두 허용한다.
  // 대신 크기·품질 종류를 줄여 아무 이미지나 여러 크기로 변환시키는 남용을 줄인다.
  // 내부망 주소는 기본값(dangerouslyAllowLocalIP: false)으로 막혀 있다.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      // 일부 언론사는 이미지를 http 로만 준다. 서버가 대신 받아 오므로 https 페이지에서도 섞인 콘텐츠 경고가 없다
      { protocol: "http", hostname: "**" },
    ],
    // 썸네일은 목록 폭의 40%(PC 약 145px, 모바일 약 140px)라 1x·2x 화면에 필요한 폭만 둔다
    imageSizes: [128, 256, 384],
    qualities: [75],
    // 기사 사진은 바뀌지 않으므로 30일 동안 캐시한다
    minimumCacheTTL: 30 * 24 * 60 * 60,
    // 원본 이미지는 10MB 까지만 받는다
    maximumResponseBody: 10_000_000,
    // 디스크 캐시 상한 1GB (넘으면 오래 안 쓴 것부터 지운다)
    maximumDiskCacheSize: 1_000_000_000,
  },
  partialPrefetching: true,
  turbopack: {
    // 상위 폴더(홈 디렉터리 등)에 있는 다른 package-lock.json 을 프로젝트 루트로 착각하지 않도록 고정한다
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
