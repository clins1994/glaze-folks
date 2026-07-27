/**
 * Baked-in Supabase project configuration.
 *
 * Fill these once the Supabase project is provisioned. The anon key is a
 * PUBLISHABLE key — Row-Level Security plus the SECURITY DEFINER functions in
 * `main/db/schema.sql` are the real protection, never this key. Both values can
 * also be supplied via environment variables (FOLKS_SUPABASE_URL /
 * FOLKS_SUPABASE_ANON_KEY) without editing source. Until both are present the
 * app runs fully in local-only mode (Private world + North).
 */

export const SUPABASE_URL: string =
  process.env.FOLKS_SUPABASE_URL ?? "https://chegtveumckupwwkusou.supabase.co";
export const SUPABASE_ANON_KEY: string =
  process.env.FOLKS_SUPABASE_ANON_KEY ?? "sb_publishable_l6kWJ5-iPjB2xhHDz94dXQ_ARHMZq1x";

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}
