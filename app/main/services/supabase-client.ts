/**
 * Supabase adapter — the single network boundary for Folks community features.
 *
 * The client is created lazily and only when the project is configured, so the
 * app runs fully local until credentials are supplied. The auth session (access
 * + refresh tokens) is persisted through a safeStorage-backed adapter, encrypted
 * at rest. Node 24 provides global fetch + WebSocket, which the realtime client
 * uses directly.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@glaze/core/backend";

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "../config/supabase.js";
import { deleteSecret, readSecret, writeSecret } from "./secrets.js";

// GoTrue supports an async storage adapter; tokens are encrypted via safeStorage.
const authStorage = {
  getItem: (key: string): Promise<string | null> => readSecret(`supabase:${key}`),
  setItem: (key: string, value: string): Promise<void> => writeSecret(`supabase:${key}`, value),
  removeItem: (key: string): Promise<void> => deleteSecret(`supabase:${key}`),
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: authStorage,
        storageKey: "folks-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    logger.info("supabase", "Supabase client initialized");
  }
  return client;
}

export function requireSupabase(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  return supabase;
}
