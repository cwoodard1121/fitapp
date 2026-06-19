/**
 * Reads + normalizes the public Supabase env vars so common paste mistakes don't
 * brick the app: trims whitespace, strips accidental wrapping quotes/trailing
 * slashes, and prepends https:// when the scheme was omitted.
 *
 * NOTE: these MUST be named NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (the NEXT_PUBLIC_ prefix is required for the browser to see them) and must be
 * present AT BUILD TIME on Vercel — they are inlined into the bundle. After
 * setting them, redeploy WITHOUT the build cache.
 */
function clean(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^['"]|['"]$/g, "");
}

export function normalizeSupabaseUrl(raw: string | undefined): string {
  const v = clean(raw);
  if (!v) return "";
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return withScheme.replace(/\/+$/, "");
}

export function getSupabaseEnv(): { url: string; key: string } {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return { url, key };
}

/** Throws a clear, actionable error when the public env is missing/blank. */
export function requireSupabaseEnv(): { url: string; key: string } {
  const { url, key } = getSupabaseEnv();
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in your Vercel project (Production env), " +
        "then redeploy without the build cache.",
    );
  }
  return { url, key };
}
