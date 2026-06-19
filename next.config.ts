import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this project so Next doesn't pick up an unrelated
  // parent lockfile (harmless locally; deterministic for Vercel tracing).
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // Type-checking (next build) still runs and catches real bugs; ESLint is a
  // stylistic gate we don't want blocking deploys of this personal app.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
