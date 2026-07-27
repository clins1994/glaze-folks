// Renderer → backend bridge for the community relay (identity, community,
// presence, handshake) and realtime change notifications.
//
// The renderer never touches Supabase directly — every call routes through the
// folks:* IPC handlers, which validate inputs and call the tested SECURITY
// DEFINER RPCs / RLS-scoped reads. Realtime is a coarse, data-free push
// ({ communityId } only); the renderer reacts by re-fetching the scoped lists.

import type {
  AcceptInvitationResult,
  CommunityMember,
  CommunitySummary,
  FolksIdentity,
  HandshakeAction,
  HandshakeEntry,
  HandshakeState,
  PresenceEntry,
  PresenceMode,
  RelayStatus,
  SessionMessage,
  SessionParticipant,
} from "./folks-types";

const ipc = () => window.glazeAPI.glaze.ipc;

// ── Identity ────────────────────────────────────────────────────────────────

export async function getRelayStatus(): Promise<RelayStatus> {
  return await ipc().invoke<RelayStatus>("folks:relay:status");
}

export async function ensureIdentity(): Promise<FolksIdentity> {
  return await ipc().invoke<FolksIdentity>("folks:identity:ensure");
}

export async function protectIdentity(email: string): Promise<void> {
  await ipc().invoke("folks:identity:protect", email);
}

export async function confirmProtect(email: string, token: string): Promise<FolksIdentity> {
  return await ipc().invoke<FolksIdentity>("folks:identity:confirmProtect", email, token);
}

export async function requestSignIn(email: string): Promise<void> {
  await ipc().invoke("folks:identity:requestSignIn", email);
}

export async function confirmSignIn(email: string, token: string): Promise<FolksIdentity> {
  return await ipc().invoke<FolksIdentity>("folks:identity:confirmSignIn", email, token);
}

export async function signOut(activeCommunityId: string | null): Promise<void> {
  // Pass the active community so the backend can clear presence + stop realtime
  // (ordered) while the old session is still valid, before dropping it.
  await ipc().invoke("folks:identity:signOut", activeCommunityId);
}

export async function setDisplayName(name: string): Promise<void> {
  await ipc().invoke("folks:identity:setDisplayName", name);
}

// ── Community bootstrap ───────────────────────────────────────────────────────

export async function listCommunities(): Promise<CommunitySummary[]> {
  return await ipc().invoke<CommunitySummary[]>("folks:community:list");
}

export async function createCommunity(name: string): Promise<string> {
  const { communityId } = await ipc().invoke<{ communityId: string }>("folks:community:create", name);
  return communityId;
}

export async function createInvitation(
  communityId: string,
  ttlHours: number,
  maxUses: number,
): Promise<string> {
  const { code } = await ipc().invoke<{ code: string }>(
    "folks:community:createInvitation",
    communityId,
    ttlHours,
    maxUses,
  );
  return code;
}

export async function acceptInvitation(code: string): Promise<AcceptInvitationResult> {
  return await ipc().invoke<AcceptInvitationResult>("folks:community:acceptInvitation", code);
}

export async function listMembers(communityId: string): Promise<CommunityMember[]> {
  return await ipc().invoke<CommunityMember[]>("folks:community:members", communityId);
}

// ── Presence ─────────────────────────────────────────────────────────────────

export async function listPresence(communityId: string): Promise<PresenceEntry[]> {
  return await ipc().invoke<PresenceEntry[]>("folks:presence:list", communityId);
}

export async function setPresence(communityId: string, mode: PresenceMode): Promise<void> {
  await ipc().invoke("folks:presence:set", communityId, mode);
}

export async function clearPresence(communityId: string): Promise<void> {
  await ipc().invoke("folks:presence:clear", communityId);
}

// ── Handshake ────────────────────────────────────────────────────────────────

export async function listHandshakes(communityId: string): Promise<HandshakeEntry[]> {
  return await ipc().invoke<HandshakeEntry[]>("folks:handshake:list", communityId);
}

export async function sendHandshake(
  communityId: string,
  recipientId: string,
  intro: string | null,
): Promise<string> {
  const { handshakeId } = await ipc().invoke<{ handshakeId: string }>(
    "folks:handshake:send",
    communityId,
    recipientId,
    intro,
  );
  return handshakeId;
}

export async function respondHandshake(
  handshakeId: string,
  action: HandshakeAction,
): Promise<HandshakeState> {
  const { state } = await ipc().invoke<{ state: HandshakeState }>(
    "folks:handshake:respond",
    handshakeId,
    action,
  );
  return state;
}

// ── Shared text sessions ──────────────────────────────────────────────────────

export async function openSession(handshakeId: string): Promise<string> {
  const { sessionId } = await ipc().invoke<{ sessionId: string }>("folks:session:open", handshakeId);
  return sessionId;
}

export async function listSessionParticipants(sessionId: string): Promise<SessionParticipant[]> {
  return await ipc().invoke<SessionParticipant[]>("folks:session:participants", sessionId);
}

export async function listSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  return await ipc().invoke<SessionMessage[]>("folks:session:messages", sessionId);
}

export async function postSessionMessage(sessionId: string, content: string): Promise<string> {
  const { messageId } = await ipc().invoke<{ messageId: string }>(
    "folks:session:post",
    sessionId,
    content,
  );
  return messageId;
}

// ── Realtime subscription control + push events ───────────────────────────────

export async function watchCommunity(communityId: string): Promise<void> {
  await ipc().invoke("folks:realtime:watch", communityId);
}

export async function unwatchCommunity(): Promise<void> {
  await ipc().invoke("folks:realtime:unwatch");
}

export async function watchSession(sessionId: string): Promise<void> {
  await ipc().invoke("folks:realtime:watchSession", sessionId);
}

export async function unwatchSession(): Promise<void> {
  await ipc().invoke("folks:realtime:unwatchSession");
}

/** Subscribe to a coarse "presence changed" push. Returns an unsubscribe fn. */
export function onPresenceChanged(callback: (communityId: string) => void): () => void {
  return ipc().onNotification("folks:realtime:presence", (params) => {
    const communityId = (params as { communityId?: string })?.communityId;
    if (communityId) callback(communityId);
  });
}

export function onHandshakeChanged(callback: (communityId: string) => void): () => void {
  return ipc().onNotification("folks:realtime:handshake", (params) => {
    const communityId = (params as { communityId?: string })?.communityId;
    if (communityId) callback(communityId);
  });
}

/** Subscribe to a coarse "session changed" push. Returns an unsubscribe fn. */
export function onSessionChanged(callback: (sessionId: string) => void): () => void {
  return ipc().onNotification("folks:realtime:session", (params) => {
    const sessionId = (params as { sessionId?: string })?.sessionId;
    if (sessionId) callback(sessionId);
  });
}
