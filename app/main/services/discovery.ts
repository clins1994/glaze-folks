/**
 * Discovery — global, private topic matching (P0).
 *
 * Only AI-derived topic labels/keys reach Supabase (never the transcript). All
 * writes go through tested SECURITY DEFINER RPCs; the recipient-specific match
 * records are RLS-scoped so a user can only ever read their OWN matches — never
 * enumerate other people's signals or matches. The room after a mutual accept
 * reuses the existing shared_sessions / session_messages infrastructure.
 */

import { requireSupabase } from "./supabase-client.js";
import type { DerivedTopic } from "./discovery-ai.js";

/** A topic currently active for the caller (as stored, after refresh). */
export interface ActiveTopic {
  key: string;
  label: string;
  generic: boolean;
}

/** A recipient-specific match the caller can act on. No counterpart identity. */
export interface DiscoveryMatch {
  id: string;
  /** Representative shared topic label to display ("Japanese grammar"). */
  label: string;
  score: number;
  /** Whether the caller has already tapped Connect on this match. */
  accepted: boolean;
  /** Set once BOTH sides accepted — the temporary room. */
  sessionId: string | null;
  mutual: boolean;
}

export interface SyncResult {
  topics: ActiveTopic[];
  matches: DiscoveryMatch[];
}

export interface AcceptResult {
  mutual: boolean;
  sessionId: string | null;
}

/** Room activity clock (for the renderer's remaining-inactivity countdown). */
export interface RoomInfo {
  lastActivityAt: string;
  /** Inactivity deadline = lastActivityAt + 10 minutes. */
  expiresAt: string;
}

const INACTIVITY_MS = 10 * 60 * 1000;

function parseTopics(value: unknown): ActiveTopic[] {
  if (!Array.isArray(value)) return [];
  return value.map((t) => {
    const row = t as { key?: string; label?: string; generic?: boolean };
    return { key: row.key ?? "", label: row.label ?? "", generic: Boolean(row.generic) };
  });
}

function parseMatches(value: unknown): DiscoveryMatch[] {
  if (!Array.isArray(value)) return [];
  return value.map((m) => {
    const row = m as {
      id?: string;
      label?: string;
      score?: number;
      accepted?: boolean;
      sessionId?: string | null;
      mutual?: boolean;
    };
    return {
      id: row.id ?? "",
      label: row.label ?? "",
      score: row.score ?? 0,
      accepted: Boolean(row.accepted),
      sessionId: row.sessionId ?? null,
      mutual: Boolean(row.mutual),
    };
  });
}

/**
 * Push the turn's derived topics to Supabase and get back the caller's current
 * active topics + live matches. Flattens each topic's canonical keys into the
 * `{key,label,confidence}` rows the RPC upserts.
 */
export async function syncTopics(topics: DerivedTopic[]): Promise<SyncResult> {
  const supabase = requireSupabase();
  const rows = topics.flatMap((topic) =>
    topic.keys.map((key) => ({
      key,
      label: topic.label,
      confidence: topic.confidence,
    })),
  );
  const { data, error } = await supabase.rpc("sync_discovery", { p_topics: rows });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { topics?: unknown; matches?: unknown };
  return { topics: parseTopics(result.topics), matches: parseMatches(result.matches) };
}

export async function dismissMatch(matchId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("dismiss_match", { p_match: matchId });
  if (error) throw new Error(error.message);
}

export async function acceptMatch(matchId: string): Promise<AcceptResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("accept_match", { p_match: matchId });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { mutual?: boolean; sessionId?: string | null };
  return { mutual: Boolean(result.mutual), sessionId: result.sessionId ?? null };
}

/** Best-effort: clear the caller's discovery footprint (topics) on exit. */
export async function clearDiscovery(): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("clear_discovery");
  if (error) throw new Error(error.message);
}

/** Leave the room — marks the caller departed so the counterpart sees it. */
export async function leaveSession(sessionId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("leave_session", { p_session: sessionId });
  if (error) throw new Error(error.message);
}

/** Heartbeat while the room view is open — keeps the room alive while active. */
export async function touchSession(sessionId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("touch_session", { p_session: sessionId });
  if (error) throw new Error(error.message);
}

/** Read the room's inactivity clock (RLS: participants only). */
export async function getRoomInfo(sessionId: string): Promise<RoomInfo> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("shared_sessions")
    .select("last_activity_at")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error(`Could not load the room: ${error.message}`);
  const last = (data as { last_activity_at: string }).last_activity_at;
  return { lastActivityAt: last, expiresAt: new Date(new Date(last).getTime() + INACTIVITY_MS).toISOString() };
}
