/**
 * Community / presence / handshake IPC.
 *
 * Thin boundary: validate every input, then delegate to the services. All
 * mutating operations route to tested SECURITY DEFINER RPCs; reads are
 * RLS-scoped. The renderer never sees Supabase directly.
 */

import { ipcMain, logger } from "@glaze/core/backend";

import {
  acceptInvitation,
  clearPresence,
  createCommunity,
  createInvitation,
  listCommunities,
  listHandshakes,
  listMembers,
  listPresence,
  listSessionMessages,
  listSessionParticipants,
  openSharedSession,
  postSessionMessage,
  respondHandshake,
  sendHandshake,
  setPresence,
  SESSION_MESSAGE_MAX,
  type HandshakeAction,
  type PresenceMode,
} from "../services/community.js";
import {
  unwatchCommunity,
  unwatchSession,
  watchCommunity,
  watchSession,
} from "../services/realtime.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRESENCE_MODES: readonly PresenceMode[] = ["selective", "open"];
const HANDSHAKE_ACTIONS: readonly HandshakeAction[] = ["accept", "nearby", "defer", "decline", "block"];

function assertUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function assertCommunityName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Community name is required");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    throw new Error("Community name must be between 1 and 80 characters");
  }
  return name;
}

function assertInviteCode(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 3 || value.length > 200) {
    throw new Error("Paste the full invitation code");
  }
  return value.trim();
}

function assertPresenceMode(value: unknown): PresenceMode {
  if (typeof value !== "string" || !PRESENCE_MODES.includes(value as PresenceMode)) {
    throw new Error("Presence mode must be selective or open");
  }
  return value as PresenceMode;
}

function assertHandshakeAction(value: unknown): HandshakeAction {
  if (typeof value !== "string" || !HANDSHAKE_ACTIONS.includes(value as HandshakeAction)) {
    throw new Error("Unknown handshake action");
  }
  return value as HandshakeAction;
}

function assertIntro(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("Invalid introduction");
  const intro = value.trim();
  if (intro.length === 0) return null;
  if (intro.length > 280) throw new Error("Introduction must be 280 characters or fewer");
  return intro;
}

function assertMessageContent(value: unknown): string {
  if (typeof value !== "string") throw new Error("Message is required");
  const content = value.trim();
  if (content.length < 1) throw new Error("Message is required");
  if (content.length > SESSION_MESSAGE_MAX) {
    throw new Error(`Message must be ${SESSION_MESSAGE_MAX} characters or fewer`);
  }
  return content;
}

function assertTtlHours(value: unknown): number {
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
    throw new Error("Invitation validity must be between 1 and 720 hours");
  }
  return Math.round(hours);
}

function assertMaxUses(value: unknown): number {
  const uses = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(uses) || uses < 1 || uses > 100) {
    throw new Error("Invitation uses must be between 1 and 100");
  }
  return Math.round(uses);
}

export function registerCommunityHandlers(): void {
  ipcMain.handle("folks:community:list", async () => await listCommunities());

  ipcMain.handle("folks:community:create", async (_event, name: unknown) => {
    const communityId = await createCommunity(assertCommunityName(name));
    return { communityId };
  });

  ipcMain.handle(
    "folks:community:createInvitation",
    async (_event, communityId: unknown, ttlHours: unknown, maxUses: unknown) => {
      const code = await createInvitation(
        assertUuid(communityId, "community"),
        assertTtlHours(ttlHours ?? 168),
        assertMaxUses(maxUses ?? 1),
      );
      return { code };
    },
  );

  ipcMain.handle("folks:community:acceptInvitation", async (_event, code: unknown) => {
    return await acceptInvitation(assertInviteCode(code));
  });

  ipcMain.handle("folks:community:members", async (_event, communityId: unknown) => {
    return await listMembers(assertUuid(communityId, "community"));
  });

  ipcMain.handle("folks:presence:list", async (_event, communityId: unknown) => {
    return await listPresence(assertUuid(communityId, "community"));
  });

  ipcMain.handle("folks:presence:set", async (_event, communityId: unknown, mode: unknown) => {
    await setPresence(assertUuid(communityId, "community"), assertPresenceMode(mode));
  });

  ipcMain.handle("folks:presence:clear", async (_event, communityId: unknown) => {
    await clearPresence(assertUuid(communityId, "community"));
  });

  ipcMain.handle("folks:handshake:list", async (_event, communityId: unknown) => {
    return await listHandshakes(assertUuid(communityId, "community"));
  });

  ipcMain.handle(
    "folks:handshake:send",
    async (_event, communityId: unknown, recipientId: unknown, intro: unknown) => {
      const handshakeId = await sendHandshake(
        assertUuid(communityId, "community"),
        assertUuid(recipientId, "recipient"),
        assertIntro(intro),
      );
      return { handshakeId };
    },
  );

  ipcMain.handle("folks:handshake:respond", async (_event, handshakeId: unknown, action: unknown) => {
    const state = await respondHandshake(assertUuid(handshakeId, "handshake"), assertHandshakeAction(action));
    return { state };
  });

  ipcMain.handle("folks:realtime:watch", async (_event, communityId: unknown) => {
    await watchCommunity(assertUuid(communityId, "community"));
  });

  ipcMain.handle("folks:realtime:unwatch", async () => {
    await unwatchCommunity();
  });

  // ── Shared text sessions (P0: human-only) ─────────────────────────────────

  ipcMain.handle("folks:session:open", async (_event, handshakeId: unknown) => {
    const sessionId = await openSharedSession(assertUuid(handshakeId, "handshake"));
    return { sessionId };
  });

  ipcMain.handle("folks:session:participants", async (_event, sessionId: unknown) => {
    return await listSessionParticipants(assertUuid(sessionId, "session"));
  });

  ipcMain.handle("folks:session:messages", async (_event, sessionId: unknown) => {
    return await listSessionMessages(assertUuid(sessionId, "session"));
  });

  ipcMain.handle("folks:session:post", async (_event, sessionId: unknown, content: unknown) => {
    const messageId = await postSessionMessage(
      assertUuid(sessionId, "session"),
      assertMessageContent(content),
    );
    return { messageId };
  });

  ipcMain.handle("folks:realtime:watchSession", async (_event, sessionId: unknown) => {
    await watchSession(assertUuid(sessionId, "session"));
  });

  ipcMain.handle("folks:realtime:unwatchSession", async () => {
    await unwatchSession();
  });

  logger.info("handlers", "✓ Folks community handlers registered");
}
