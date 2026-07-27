/**
 * Community, presence, and handshake operations.
 *
 * Every security-sensitive WRITE goes through a tested `SECURITY DEFINER`
 * Postgres RPC (see `main/db/schema.sql`) — the client never issues direct DML
 * against guarded tables. READS use RLS-scoped `select`s: the policies in the
 * schema restrict every row to what `auth.uid()` is allowed to see, so a query
 * can never return a community/member/presence/handshake the caller isn't party
 * to. All of this runs in the backend; the renderer only ever sees the shaped
 * results below over IPC and never touches Supabase or the anon key directly.
 */

import { requireSupabase } from "./supabase-client.js";

export type CommunityRole = "owner" | "member";
export type PresenceMode = "selective" | "open";
export type HandshakeState =
  | "outgoing"
  | "connected"
  | "nearby"
  | "deferred"
  | "declined"
  | "blocked"
  | "expired";
export type HandshakeAction = "accept" | "nearby" | "defer" | "decline" | "block";

export interface CommunitySummary {
  id: string;
  name: string;
  role: CommunityRole;
  joinedAt: string;
}

export interface CommunityMember {
  userId: string;
  role: CommunityRole;
  displayName: string | null;
  isSelf: boolean;
}

export interface PresenceEntry {
  userId: string;
  mode: PresenceMode;
  displayName: string | null;
  expiresAt: string;
  isSelf: boolean;
}

export interface HandshakeEntry {
  id: string;
  state: HandshakeState;
  intro: string | null;
  direction: "incoming" | "outgoing";
  counterpartId: string;
  counterpartName: string | null;
  updatedAt: string;
}

export interface AcceptInvitationResult {
  status: "joined" | "already_member" | "invalid" | "rate_limited";
  communityId?: string;
}

export type SessionParticipantStatus = "active" | "departed";

export interface SessionParticipant {
  userId: string;
  displayName: string | null;
  status: SessionParticipantStatus;
  isSelf: boolean;
}

export interface SessionMessage {
  id: string;
  senderId: string | null;
  senderName: string | null;
  /** Null when the sender deleted their data (row de-identified + content cleared). */
  content: string | null;
  deleted: boolean;
  createdAt: string;
  isSelf: boolean;
}

/** Max characters accepted for a single session message (mirrors the CHECK in schema.sql). */
export const SESSION_MESSAGE_MAX = 4000;

async function currentUserId(): Promise<string> {
  const supabase = requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You need an identity before using community features");
  return user.id;
}

/** Resolve display names for a set of user ids (RLS: only shared-community users). */
async function displayNames(userIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return map;
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("users").select("id, display_name").in("id", unique);
  if (error) throw new Error(`Could not load member names: ${error.message}`);
  for (const row of data ?? []) {
    map.set(row.id as string, (row.display_name as string | null) ?? null);
  }
  return map;
}

// -------------------------------------------------------------------------
// Community bootstrap (writes via SECURITY DEFINER RPCs)
// -------------------------------------------------------------------------

export async function createCommunity(name: string): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("create_community", { p_name: name });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function createInvitation(
  communityId: string,
  ttlHours: number,
  maxUses: number,
): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_community: communityId,
    p_ttl: `${ttlHours} hours`,
    p_max_uses: maxUses,
  });
  if (error) throw new Error(error.message);
  // One-time plaintext `<id>.<secret>` — the secret is never stored server-side.
  return data as string;
}

export async function acceptInvitation(code: string): Promise<AcceptInvitationResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("accept_invitation", { p_code: code });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { status?: string; community_id?: string };
  const status = (result.status ?? "invalid") as AcceptInvitationResult["status"];
  return { status, communityId: result.community_id };
}

// -------------------------------------------------------------------------
// Reads (RLS-scoped selects)
// -------------------------------------------------------------------------

export async function listCommunities(): Promise<CommunitySummary[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, joined_at, communities(id, name)")
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (error) throw new Error(`Could not load your communities: ${error.message}`);
  const rows = (data ?? []) as unknown as Array<{
    role: CommunityRole;
    joined_at: string;
    communities: { id: string; name: string } | null;
  }>;
  return rows
    .filter((row) => row.communities)
    .map((row) => ({
      id: row.communities!.id,
      name: row.communities!.name,
      role: row.role,
      joinedAt: row.joined_at,
    }));
}

export async function listMembers(communityId: string): Promise<CommunityMember[]> {
  const supabase = requireSupabase();
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role")
    .eq("community_id", communityId)
    .eq("status", "active");
  if (error) throw new Error(`Could not load members: ${error.message}`);
  const rows = (data ?? []) as Array<{ user_id: string; role: CommunityRole }>;
  const names = await displayNames(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    userId: r.user_id,
    role: r.role,
    displayName: names.get(r.user_id) ?? null,
    isSelf: r.user_id === uid,
  }));
}

export async function listPresence(communityId: string): Promise<PresenceEntry[]> {
  const supabase = requireSupabase();
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("presence")
    .select("user_id, mode, expires_at")
    .eq("community_id", communityId)
    .gt("expires_at", new Date().toISOString()); // authoritative read excludes expired rows (no pg_cron dependency)
  if (error) throw new Error(`Could not load presence: ${error.message}`);
  const rows = (data ?? []) as Array<{ user_id: string; mode: PresenceMode; expires_at: string }>;
  const names = await displayNames(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    userId: r.user_id,
    mode: r.mode,
    displayName: names.get(r.user_id) ?? null,
    expiresAt: r.expires_at,
    isSelf: r.user_id === uid,
  }));
}

export async function listHandshakes(communityId: string): Promise<HandshakeEntry[]> {
  const supabase = requireSupabase();
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("handshakes")
    .select("id, initiator_id, recipient_id, state, intro, updated_at")
    .eq("community_id", communityId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not load handshakes: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string;
    initiator_id: string;
    recipient_id: string;
    state: HandshakeState;
    intro: string | null;
    updated_at: string;
  }>;
  const counterpartIds = rows.map((r) => (r.initiator_id === uid ? r.recipient_id : r.initiator_id));
  const names = await displayNames(counterpartIds);
  return rows.map((r) => {
    const outgoing = r.initiator_id === uid;
    const counterpartId = outgoing ? r.recipient_id : r.initiator_id;
    return {
      id: r.id,
      state: r.state,
      intro: r.intro,
      direction: outgoing ? "outgoing" : "incoming",
      counterpartId,
      counterpartName: names.get(counterpartId) ?? null,
      updatedAt: r.updated_at,
    };
  });
}

// -------------------------------------------------------------------------
// Presence + handshake (writes via SECURITY DEFINER RPCs)
// -------------------------------------------------------------------------

export async function setPresence(communityId: string, mode: PresenceMode): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("set_presence", { p_community: communityId, p_mode: mode });
  if (error) throw new Error(error.message);
}

export async function clearPresence(communityId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("clear_presence", { p_community: communityId });
  if (error) throw new Error(error.message);
}

export async function sendHandshake(
  communityId: string,
  recipientId: string,
  intro: string | null,
): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("send_handshake", {
    p_community: communityId,
    p_recipient: recipientId,
    p_intro: intro,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function respondHandshake(
  handshakeId: string,
  action: HandshakeAction,
): Promise<HandshakeState> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("respond_handshake", {
    p_handshake: handshakeId,
    p_action: action,
  });
  if (error) throw new Error(error.message);
  const state = data as HandshakeState;
  // The RPC returns 'expired' (already committed) when the offer lapsed before
  // the response — surface it as a user-facing error now that the DB is settled.
  if (state === "expired") {
    throw new Error("This handshake has expired");
  }
  return state;
}

// -------------------------------------------------------------------------
// Shared text sessions (P0: human-only)
//
// A session is the private text conversation behind a CONNECTED handshake.
// create_shared_session is idempotent (returns the existing session for the
// handshake), so "Open Chat" can call it unconditionally. Writes go through the
// tested SECURITY DEFINER RPC (active-participant + length enforced); reads are
// RLS-scoped to the two participants. No AI is part of this conversation.
// -------------------------------------------------------------------------

/** Open (or resolve) the shared session for a connected handshake. Idempotent. */
export async function openSharedSession(handshakeId: string): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("create_shared_session", { p_handshake: handshakeId });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listSessionParticipants(sessionId: string): Promise<SessionParticipant[]> {
  const supabase = requireSupabase();
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("session_participants")
    .select("user_id, status")
    .eq("session_id", sessionId);
  if (error) throw new Error(`Could not load participants: ${error.message}`);
  const rows = (data ?? []) as Array<{ user_id: string; status: SessionParticipantStatus }>;
  const names = await displayNames(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    userId: r.user_id,
    displayName: names.get(r.user_id) ?? null,
    status: r.status,
    isSelf: r.user_id === uid,
  }));
}

export async function listSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  const supabase = requireSupabase();
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("session_messages")
    .select("id, sender_id, content, deleted, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load messages: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string;
    sender_id: string | null;
    content: string | null;
    deleted: boolean;
    created_at: string;
  }>;
  const senderIds = rows.map((r) => r.sender_id).filter((v): v is string => Boolean(v));
  const names = await displayNames(senderIds);
  return rows.map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    senderName: r.sender_id ? names.get(r.sender_id) ?? null : null,
    content: r.content,
    deleted: r.deleted,
    createdAt: r.created_at,
    isSelf: r.sender_id === uid,
  }));
}

export async function postSessionMessage(sessionId: string, content: string): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("post_session_message", {
    p_session: sessionId,
    p_content: content,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
