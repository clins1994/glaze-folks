/**
 * Community realtime — backend-owned Supabase Realtime subscription.
 *
 * The backend subscribes to `presence` and `handshakes` changes for the ONE
 * community the user is currently watching and pushes a coarse, DATA-FREE event
 * to the renderer (`{ communityId }` only). The renderer reacts by re-fetching
 * through the RLS-scoped reads in `community.ts`. Because the pushed event
 * carries no row data, nothing sensitive can leak even if a change fires for a
 * row the user cannot read — the authoritative filtering is the RLS re-read.
 *
 * Lifecycle guarantees:
 *  - A community is not considered "watched" until the channel reports SUBSCRIBED.
 *  - CHANNEL_ERROR / TIMED_OUT / CLOSED clears the stored channel so the caller
 *    can retry, and rejects the pending watch (never silently swallowed).
 *  - A monotonic token guards against a stale watch/unwatch tearing down a newer
 *    channel (async ordering). Callers restart the subscription when the
 *    authenticated uid/session changes.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { ipcMain, logger } from "@glaze/core/backend";

import { requireSupabase } from "./supabase-client.js";

export const REALTIME_PRESENCE_CHANGED = "folks:realtime:presence";
export const REALTIME_HANDSHAKE_CHANGED = "folks:realtime:handshake";
export const REALTIME_SESSION_CHANGED = "folks:realtime:session";
export const REALTIME_MATCHES_CHANGED = "folks:realtime:matches";

let channel: RealtimeChannel | null = null;
let watchedCommunityId: string | null = null;
let token = 0; // bumped on every watch/unwatch so stale async work can detect supersession

// A shared-session subscription is tracked independently of the community
// channel (a user can be watching a community's presence AND have a chat open).
// Same lifecycle guarantees: SUBSCRIBED-gated, errors reject + clear, a monotonic
// token guards against a stale teardown removing a newer channel.
let sessionChannel: RealtimeChannel | null = null;
let watchedSessionId: string | null = null;
let sessionToken = 0;

// Discovery match records addressed to the authenticated user. Subscribed with a
// user_id=eq.<me> filter so the stream only ever carries the caller's own rows
// (RLS on discovery_matches enforces the same). Data-free push; renderer
// re-fetches via sync_discovery. Independent lifecycle + token guard.
let matchesChannel: RealtimeChannel | null = null;
let watchedMatchesUid: string | null = null;
let matchesToken = 0;

export async function unwatchCommunity(): Promise<void> {
  token += 1;
  const previous = channel;
  channel = null;
  watchedCommunityId = null;
  if (previous) {
    try {
      await requireSupabase().removeChannel(previous);
    } catch {
      // best-effort teardown
    }
  }
}

export async function watchCommunity(communityId: string): Promise<void> {
  if (watchedCommunityId === communityId && channel) return; // already live for this community

  const myToken = (token += 1);
  const previous = channel;
  channel = null;
  watchedCommunityId = null;
  if (previous) {
    try {
      await requireSupabase().removeChannel(previous);
    } catch {
      // best-effort teardown
    }
  }
  if (myToken !== token) return; // a newer watch/unwatch superseded us

  const supabase = requireSupabase();
  // Realtime must carry the authenticated session so RLS applies to the stream.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (myToken !== token) return;
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
  }

  const nextChannel = supabase
    .channel(`folks:community:${communityId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "presence", filter: `community_id=eq.${communityId}` },
      () => ipcMain.broadcast(REALTIME_PRESENCE_CHANGED, { communityId }),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "handshakes", filter: `community_id=eq.${communityId}` },
      () => ipcMain.broadcast(REALTIME_HANDSHAKE_CHANGED, { communityId }),
    );

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    nextChannel.subscribe((status, err) => {
      // A newer watch/unwatch superseded this attempt: discard its channel.
      if (myToken !== token) {
        void supabase.removeChannel(nextChannel);
        if (!settled) {
          settled = true;
          resolve();
        }
        return;
      }

      if (status === "SUBSCRIBED") {
        channel = nextChannel;
        watchedCommunityId = communityId;
        logger.info("realtime", `Subscribed to community ${communityId}`);
        if (!settled) {
          settled = true;
          resolve();
        }
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (channel === nextChannel) {
          channel = null;
          watchedCommunityId = null;
        }
        void supabase.removeChannel(nextChannel);
        const reason = `Realtime channel ${status}${err ? `: ${err.message}` : ""}`;
        logger.warn("realtime", reason);
        if (!settled) {
          settled = true;
          reject(new Error(reason));
        }
      }
    });
  });
}

// -------------------------------------------------------------------------
// Shared-session message stream
// -------------------------------------------------------------------------

export async function unwatchSession(): Promise<void> {
  sessionToken += 1;
  const previous = sessionChannel;
  sessionChannel = null;
  watchedSessionId = null;
  if (previous) {
    try {
      await requireSupabase().removeChannel(previous);
    } catch {
      // best-effort teardown
    }
  }
}

export async function watchSession(sessionId: string): Promise<void> {
  if (watchedSessionId === sessionId && sessionChannel) return; // already live for this session

  const myToken = (sessionToken += 1);
  const previous = sessionChannel;
  sessionChannel = null;
  watchedSessionId = null;
  if (previous) {
    try {
      await requireSupabase().removeChannel(previous);
    } catch {
      // best-effort teardown
    }
  }
  if (myToken !== sessionToken) return; // a newer watch/unwatch superseded us

  const supabase = requireSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (myToken !== sessionToken) return;
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
  }

  const nextChannel = supabase
    .channel(`folks:session:${sessionId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "session_messages", filter: `session_id=eq.${sessionId}` },
      () => ipcMain.broadcast(REALTIME_SESSION_CHANGED, { sessionId }),
    );

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    nextChannel.subscribe((status, err) => {
      if (myToken !== sessionToken) {
        void supabase.removeChannel(nextChannel);
        if (!settled) {
          settled = true;
          resolve();
        }
        return;
      }

      if (status === "SUBSCRIBED") {
        sessionChannel = nextChannel;
        watchedSessionId = sessionId;
        logger.info("realtime", `Subscribed to session ${sessionId}`);
        if (!settled) {
          settled = true;
          resolve();
        }
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (sessionChannel === nextChannel) {
          sessionChannel = null;
          watchedSessionId = null;
        }
        void supabase.removeChannel(nextChannel);
        const reason = `Realtime session channel ${status}${err ? `: ${err.message}` : ""}`;
        logger.warn("realtime", reason);
        if (!settled) {
          settled = true;
          reject(new Error(reason));
        }
      }
    });
  });
}

// -------------------------------------------------------------------------
// Discovery match stream (records addressed to the authenticated user)
// -------------------------------------------------------------------------

export async function unwatchMatches(): Promise<void> {
  matchesToken += 1;
  const previous = matchesChannel;
  matchesChannel = null;
  watchedMatchesUid = null;
  if (previous) {
    try {
      await requireSupabase().removeChannel(previous);
    } catch {
      // best-effort teardown
    }
  }
}

export async function watchMatches(uid: string): Promise<void> {
  if (watchedMatchesUid === uid && matchesChannel) return; // already live for this user

  const myToken = (matchesToken += 1);
  const previous = matchesChannel;
  matchesChannel = null;
  watchedMatchesUid = null;
  if (previous) {
    try {
      await requireSupabase().removeChannel(previous);
    } catch {
      // best-effort teardown
    }
  }
  if (myToken !== matchesToken) return; // a newer watch/unwatch superseded us

  const supabase = requireSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (myToken !== matchesToken) return;
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
  }

  const nextChannel = supabase
    .channel(`folks:matches:${uid}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "discovery_matches", filter: `user_id=eq.${uid}` },
      () => ipcMain.broadcast(REALTIME_MATCHES_CHANGED, { uid }),
    );

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    nextChannel.subscribe((status, err) => {
      if (myToken !== matchesToken) {
        void supabase.removeChannel(nextChannel);
        if (!settled) {
          settled = true;
          resolve();
        }
        return;
      }

      if (status === "SUBSCRIBED") {
        matchesChannel = nextChannel;
        watchedMatchesUid = uid;
        logger.info("realtime", `Subscribed to matches for ${uid}`);
        if (!settled) {
          settled = true;
          resolve();
        }
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (matchesChannel === nextChannel) {
          matchesChannel = null;
          watchedMatchesUid = null;
        }
        void supabase.removeChannel(nextChannel);
        const reason = `Realtime matches channel ${status}${err ? `: ${err.message}` : ""}`;
        logger.warn("realtime", reason);
        if (!settled) {
          settled = true;
          reject(new Error(reason));
        }
      }
    });
  });
}
