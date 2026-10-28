import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 도커 이미지에서 node_modules 전체 없이 `node server.js` 만으로 돌리기 위해 필요한 파일만 .next/standalone 에 모은다
  output: "standalone",
  cacheComponents: true,
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
