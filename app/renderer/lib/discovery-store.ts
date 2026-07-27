// Renderer -> backend bridge for discovery: the private AI turn, topic sync,
// match actions, room heartbeat, and the match realtime subscription.
//
// The transcript is sent to the AI turn in memory for a single call and is never
// persisted or forwarded to Supabase — only the derived topics reach the relay
// (via syncDiscovery). Match realtime is a coarse, data-free push; the renderer
// re-reads through the RLS-scoped sync.

import type {
  AcceptResult,
  DerivedTopic,
  RoomInfo,
  SyncResult,
  TurnMessage,
  TurnResult,
} from "./folks-types";

const ipc = () => window.glazeAPI.glaze.ipc;

/** One private companion turn: reply + derived topics. No persistence. */
export async function runAiTurn(history: TurnMessage[]): Promise<TurnResult> {
  return await ipc().invoke<TurnResult>("folks:ai:turn", history);
}

/** Push ONLY the derived topics; get back active topics + live matches. */
export async function syncDiscovery(topics: DerivedTopic[]): Promise<SyncResult> {
  return await ipc().invoke<SyncResult>("folks:discovery:sync", topics);
}

export async function dismissMatch(matchId: string): Promise<void> {
  await ipc().invoke("folks:discovery:dismiss", matchId);
}

export async function acceptMatch(matchId: string): Promise<AcceptResult> {
  return await ipc().invoke<AcceptResult>("folks:discovery:accept", matchId);
}

export async function clearDiscovery(): Promise<void> {
  await ipc().invoke("folks:discovery:clear");
}

export async function getRoomInfo(sessionId: string): Promise<RoomInfo> {
  return await ipc().invoke<RoomInfo>("folks:discovery:room", sessionId);
}

export async function touchSession(sessionId: string): Promise<void> {
  await ipc().invoke("folks:discovery:touch", sessionId);
}

/** Leave the room — marks the caller departed so the counterpart is informed. */
export async function leaveSession(sessionId: string): Promise<void> {
  await ipc().invoke("folks:session:leave", sessionId);
}

// ── Match realtime subscription control + push ────────────────────────────────

export async function watchMatches(uid: string): Promise<void> {
  await ipc().invoke("folks:realtime:watchMatches", uid);
}

export async function unwatchMatches(): Promise<void> {
  await ipc().invoke("folks:realtime:unwatchMatches");
}

/** Subscribe to a coarse "your matches changed" push. Returns an unsubscribe fn. */
export function onMatchesChanged(callback: (uid: string) => void): () => void {
  return ipc().onNotification("folks:realtime:matches", (params) => {
    const uid = (params as { uid?: string })?.uid;
    if (uid) callback(uid);
  });
}
