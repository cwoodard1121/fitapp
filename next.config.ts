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
  // Keep visited/prefetched pages in the client router cache so flipping
  // between tabs is instant. Every mutating server action calls
  // revalidatePath, which purges this cache, so edits never show stale data.
  experimental: {
    staleTimes: { dynamic: 30, static: 300 },
  },
  // NOTE: deliberately NOT using experimental.viewTransition — it requires
  // swapping react/react-dom to their unstable "experimental" channel
  // (needsExperimentalReact() in Next's own source), which is too much risk
  // for a personal daily-use app. Page-transition crossfades are instead
  // wired by hand with the standard, stable View Transitions API — see
  // components/app/route-progress.tsx.
};

export default nextConfig;
