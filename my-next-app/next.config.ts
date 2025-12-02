// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // ← ESLintエラーはビルドで落とさない
  },
  typescript: {
    ignoreBuildErrors: true,  // ← 型エラーもビルドで落とさない
  },
};

export default nextConfig;