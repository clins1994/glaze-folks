// Shared Folks domain types (renderer).

/** Privacy mode governs what, if anything, the world publishes about you. */
export type PrivacyMode = "private" | "selective" | "open";

/**
 * A single turn in a North conversation. The transcript is stored only on this
 * Mac and is never sent to Supabase/a community; messages sent to North are
 * processed by Glaze AI.
 */
export interface ChatMessage {
  id: string;
  role: "user" | "north";
  text: string;
  createdAt: number;
}

/** Durable, device-local view preferences. */
export interface Worldview {
  privacyMode: PrivacyMode;
  /** Show illustrative “Preview” presences in the orbit (never real people). */
  previewWorld: boolean;
  /** The one signal a Selective user would share — stored locally in P0. */
  selectiveSignal: string;
  /** The community the world currently reflects (device-local selection). */
  activeCommunityId: string | null;
}

export const DEFAULT_WORLDVIEW: Worldview = {
  privacyMode: "private",
  previewWorld: false,
  selectiveSignal: "",
  activeCommunityId: null,
};

// ── Community relay domain (mirrors main/services/community.ts) ──────────────

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

/** Whether the community relay (Supabase) is configured at all. */
export interface RelayStatus {
  configured: boolean;
}

/** Anonymous-first identity as reported by the backend. */
export interface FolksIdentity {
  configured: boolean;
  userId: string | null;
  isAnonymous: boolean;
  email: string | null;
  /** Protected = email-linked identity that survives reinstall and can own. */
  protectedIdentity: boolean;
}

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
  content: string | null;
  deleted: boolean;
  createdAt: string;
  isSelf: boolean;
}

/** Max characters accepted for a single session message (mirrors schema.sql). */
export const SESSION_MESSAGE_MAX = 4000;

// ── Discovery (P0 topic matching + ephemeral rooms) ──────────────────────────

/** One conversation turn — held in renderer memory ONLY, never persisted. */
export interface ConversationMessage {
  id: string;
  role: "user" | "ai";
  text: string;
}

/** Bounded history entry sent to the private AI turn (no persistence). */
export interface TurnMessage {
  role: "user" | "assistant";
  content: string;
}

/** One AI-derived topic: display label + canonical English keys + confidence. */
export interface DerivedTopic {
  label: string;
  keys: string[];
  confidence: number;
}

/** A topic currently active for this user (after the server refresh). */
export interface ActiveTopic {
  key: string;
  label: string;
  generic: boolean;
}

/** A recipient-specific match. Carries NO counterpart identity before connect. */
export interface DiscoveryMatch {
  id: string;
  /** Representative shared topic label ("Japanese grammar"). */
  label: string;
  score: number;
  accepted: boolean;
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

/** Room inactivity clock for the remaining-time countdown. */
export interface RoomInfo {
  lastActivityAt: string;
  expiresAt: string;
}

/** Result of one private companion turn (reply + topics), or a blocked AI state. */
export type TurnResult =
  | { ok: true; reply: string; topics: DerivedTopic[] }
  | { ok: false; blocked: string };
