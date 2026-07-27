/**
 * Discovery IPC — private AI turn + global topic matching + room heartbeat.
 *
 * Thin boundary: validate inputs, delegate to services. The AI turn runs in the
 * main process and returns { reply, topics }; ONLY the derived topics are then
 * pushed to Supabase via folks:discovery:sync. The transcript never leaves this
 * process and is never persisted. The room after a mutual accept reuses the
 * existing folks:session:* handlers for messages/participants.
 */

import { ipcMain, logger } from "@glaze/core/backend";

import { runTurn, type DerivedTopic, type TurnMessage } from "../services/discovery-ai.js";
import {
  acceptMatch,
  clearDiscovery,
  dismissMatch,
  getRoomInfo,
  leaveSession,
  syncTopics,
  touchSession,
} from "../services/discovery.js";
import { unwatchMatches, watchMatches } from "../services/realtime.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_CHARS = 8000;
const MAX_HISTORY = 40;
const MAX_TOPICS = 3;

function assertUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function assertHistory(value: unknown): TurnMessage[] {
  if (!Array.isArray(value)) throw new Error("Conversation history is required");
  const history: TurnMessage[] = [];
  for (const item of value.slice(-MAX_HISTORY)) {
    const row = item as { role?: unknown; content?: unknown };
    const role = row.role === "assistant" ? "assistant" : "user";
    if (typeof row.content !== "string") continue;
    const content = row.content.slice(0, MAX_MESSAGE_CHARS);
    if (content.trim().length === 0) continue;
    history.push({ role, content });
  }
  if (history.length === 0) throw new Error("Say something first");
  return history;
}

/** Trust the AI's own bounds but sanitize shape/length before it hits the RPC. */
function assertTopics(value: unknown): DerivedTopic[] {
  if (!Array.isArray(value)) return [];
  const topics: DerivedTopic[] = [];
  for (const item of value.slice(0, MAX_TOPICS)) {
    const row = item as { label?: unknown; keys?: unknown; confidence?: unknown };
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 80) : "";
    const keys = Array.isArray(row.keys)
      ? row.keys
          .filter((k): k is string => typeof k === "string")
          .map((k) => k.trim().toLowerCase().slice(0, 80))
          .filter((k) => k.length > 0)
          .slice(0, 3)
      : [];
    const confidenceRaw = typeof row.confidence === "number" ? row.confidence : 0;
    const confidence = Math.max(0, Math.min(1, confidenceRaw));
    if (label.length > 0 && keys.length > 0) topics.push({ label, keys, confidence });
  }
  return topics;
}

export function registerDiscoveryHandlers(): void {
  // One private companion turn: reply + derived topics. No Supabase, no persist.
  ipcMain.handle("folks:ai:turn", async (_event, history: unknown) => {
    return await runTurn(assertHistory(history));
  });

  // Push ONLY the derived topics; get back active topics + live matches.
  ipcMain.handle("folks:discovery:sync", async (_event, topics: unknown) => {
    return await syncTopics(assertTopics(topics));
  });

  ipcMain.handle("folks:discovery:dismiss", async (_event, matchId: unknown) => {
    await dismissMatch(assertUuid(matchId, "match"));
  });

  ipcMain.handle("folks:discovery:accept", async (_event, matchId: unknown) => {
    return await acceptMatch(assertUuid(matchId, "match"));
  });

  ipcMain.handle("folks:discovery:clear", async () => {
    await clearDiscovery();
  });

  ipcMain.handle("folks:discovery:room", async (_event, sessionId: unknown) => {
    return await getRoomInfo(assertUuid(sessionId, "session"));
  });

  ipcMain.handle("folks:discovery:touch", async (_event, sessionId: unknown) => {
    await touchSession(assertUuid(sessionId, "session"));
  });

  ipcMain.handle("folks:session:leave", async (_event, sessionId: unknown) => {
    await leaveSession(assertUuid(sessionId, "session"));
  });

  ipcMain.handle("folks:realtime:watchMatches", async (_event, uid: unknown) => {
    await watchMatches(assertUuid(uid, "user"));
  });

  ipcMain.handle("folks:realtime:unwatchMatches", async () => {
    await unwatchMatches();
  });

  logger.info("handlers", "✓ Folks discovery handlers registered");
}
