/**
 * Identity — anonymous-first Supabase Auth.
 *
 * First launch (when configured) signs in anonymously, giving a stable
 * `auth.uid()` that keys every row. "Protect your identity" links an email via
 * an emailed 6-digit code, converting the anonymous user to a permanent one
 * WITHOUT changing `auth.uid()` — so memberships, connections, and history carry
 * over. Sessions persist locally (encrypted). No second auth system.
 */

import type { User } from "@supabase/supabase-js";
import { logger } from "@glaze/core/backend";

import { isSupabaseConfigured } from "../config/supabase.js";
import { getSupabase, requireSupabase } from "./supabase-client.js";
import { clearPresence } from "./community.js";
import { clearDiscovery } from "./discovery.js";
import { unwatchCommunity, unwatchMatches, unwatchSession } from "./realtime.js";

export interface FolksIdentity {
  /** Whether a Supabase project is configured at all. */
  configured: boolean;
  userId: string | null;
  isAnonymous: boolean;
  email: string | null;
  /** Protected = permanent (email-linked) identity that survives reinstall. */
  protectedIdentity: boolean;
}

const UNCONFIGURED: FolksIdentity = {
  configured: false,
  userId: null,
  isAnonymous: true,
  email: null,
  protectedIdentity: false,
};

let ensureIdentityFlight: Promise<FolksIdentity> | null = null;

function toIdentity(user: User | null): FolksIdentity {
  if (!user) {
    return { configured: true, userId: null, isAnonymous: true, email: null, protectedIdentity: false };
  }
  const email = user.email ?? null;
  const isAnonymous = (user as { is_anonymous?: boolean }).is_anonymous ?? false;
  return {
    configured: true,
    userId: user.id,
    isAnonymous,
    email,
    protectedIdentity: !isAnonymous && Boolean(email),
  };
}

async function ensureConfiguredIdentity(): Promise<FolksIdentity> {
  const supabase = requireSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return toIdentity(session.user);

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    logger.error("identity", "Anonymous sign-in failed", error);
    throw error;
  }
  return toIdentity(data.user);
}

/** Ensure a stable identity exists — anonymous sign-in on first launch. */
export async function ensureIdentity(): Promise<FolksIdentity> {
  if (!isSupabaseConfigured()) return UNCONFIGURED;
  if (ensureIdentityFlight) return await ensureIdentityFlight;

  ensureIdentityFlight = ensureConfiguredIdentity();
  try {
    return await ensureIdentityFlight;
  } finally {
    ensureIdentityFlight = null;
  }
}

/** Read the current identity without creating one. */
export async function getIdentity(): Promise<FolksIdentity> {
  if (!isSupabaseConfigured()) return UNCONFIGURED;
  const supabase = requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return toIdentity(user);
}

/** Begin protecting the identity: links an email and emails a 6-digit code. */
export async function requestIdentityProtection(email: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw error;
}

/** Complete protection by verifying the emailed code; preserves `auth.uid()`. */
export async function confirmIdentityProtection(email: string, token: string): Promise<FolksIdentity> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email_change" });
  if (error) throw error;
  return toIdentity(data.user);
}

/**
 * Recovery / new-device sign-in for an already-PROTECTED identity: emails a
 * 6-digit code to an existing account (never creates a new user). This is how a
 * protected user regains their same `auth.uid()` (and all memberships/history)
 * after reinstall or on a second Mac.
 */
export async function requestSignInCode(email: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) throw error;
}

export async function confirmSignIn(email: string, token: string): Promise<FolksIdentity> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  return toIdentity(data.user);
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Ordered sign-out. While the OLD session is still valid, best-effort clear the
 * caller's presence in the active community and stop BOTH realtime channels (the
 * community stream and any open shared-session stream) — all need the live auth
 * token, so they must happen BEFORE the session is dropped. Stopping the session
 * channel here means no old-session subscription or sessionId notification can
 * survive into the next identity. The channels' own token guards remain intact.
 * Only then do we sign out (which lets a fresh identity be created/recovered).
 */
export async function signOutClean(communityId: string | null): Promise<void> {
  if (communityId) {
    try {
      await clearPresence(communityId);
    } catch {
      // best-effort — the row expires at TTL even if this fails
    }
  }
  // Clear the caller's discovery topics while the old token is still valid, so no
  // active-topic signal survives into the next identity (TTL is the fallback).
  try {
    await clearDiscovery();
  } catch {
    // best-effort
  }
  try {
    await unwatchCommunity();
  } catch {
    // best-effort
  }
  try {
    await unwatchSession();
  } catch {
    // best-effort
  }
  // Stop the discovery-match stream too, so no old-identity match push leaks in.
  try {
    await unwatchMatches();
  } catch {
    // best-effort
  }
  await signOut();
}

/** Set the caller's community-visible display name (via SECURITY DEFINER RPC). */
export async function setDisplayName(name: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("set_display_name", { p_name: name });
  if (error) throw new Error(error.message);
}
