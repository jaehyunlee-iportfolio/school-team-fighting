import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse → pdfjs-dist 는 Node 환경에서 worker를 동적 import 하므로 Turbopack/webpack
  // 번들링을 피해 node_modules 에서 직접 로드하도록 외부 패키지로 둔다.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
