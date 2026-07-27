// React Query hooks for the community relay + realtime cache invalidation.
//
// Every user-scoped query key is namespaced by the authenticated uid, so there
// is no frame in which one user reads another's cached communities, members,
// presence, or handshakes — a different uid means a different cache entry.
// Nothing here runs until ensureIdentity() has resolved a non-null uid.
//
// Reads are RLS-scoped in the backend. Realtime pushes a coarse, data-free
// event; here we invalidate the matching query so the scoped read runs again —
// the source of truth is always the RLS-filtered fetch, never the push.

import * as React from "react";
import { toast } from "@glaze/core/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CommunityMember,
  CommunitySummary,
  FolksIdentity,
  HandshakeEntry,
  PresenceEntry,
  PrivacyMode,
  RelayStatus,
  SessionMessage,
  SessionParticipant,
} from "./folks-types";
import {
  clearPresence,
  ensureIdentity,
  getRelayStatus,
  listCommunities,
  listHandshakes,
  listMembers,
  listPresence,
  listSessionMessages,
  listSessionParticipants,
  onHandshakeChanged,
  onPresenceChanged,
  onSessionChanged,
  setPresence,
  unwatchCommunity,
  unwatchSession,
  watchCommunity,
  watchSession,
} from "./community-store";

export const communityKeys = {
  relay: ["relay-status"] as const,
  identity: ["identity"] as const,
  communities: (uid: string) => ["communities", uid] as const,
  members: (uid: string, communityId: string) => ["members", uid, communityId] as const,
  presence: (uid: string, communityId: string) => ["presence", uid, communityId] as const,
  handshakes: (uid: string, communityId: string) => ["handshakes", uid, communityId] as const,
  session: (uid: string, handshakeId: string) => ["session", uid, handshakeId] as const,
  sessionParticipants: (uid: string, sessionId: string) =>
    ["session-participants", uid, sessionId] as const,
  sessionMessages: (uid: string, sessionId: string) => ["session-messages", uid, sessionId] as const,
};

/** Query-key prefixes that are scoped to a single user id (index 1 = uid). */
export const USER_SCOPED_PREFIXES = [
  "communities",
  "members",
  "presence",
  "handshakes",
  "session",
  "session-participants",
  "session-messages",
] as const;

export function useRelayStatus() {
  return useQuery<RelayStatus>({
    queryKey: communityKeys.relay,
    queryFn: getRelayStatus,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Ensures an anonymous identity exists (idempotent) once the relay is configured. */
export function useIdentity(configured: boolean) {
  return useQuery<FolksIdentity>({
    queryKey: communityKeys.identity,
    queryFn: ensureIdentity,
    enabled: configured,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useCommunities(uid: string | null) {
  return useQuery<CommunitySummary[]>({
    queryKey: communityKeys.communities(uid ?? "anon"),
    queryFn: listCommunities,
    enabled: Boolean(uid),
    refetchOnWindowFocus: false,
  });
}

export function useMembers(uid: string | null, communityId: string | null) {
  return useQuery<CommunityMember[]>({
    queryKey: communityKeys.members(uid ?? "anon", communityId ?? "none"),
    queryFn: () => listMembers(communityId as string),
    enabled: Boolean(uid && communityId),
    refetchOnWindowFocus: false,
  });
}

export function usePresence(uid: string | null, communityId: string | null) {
  return useQuery<PresenceEntry[]>({
    queryKey: communityKeys.presence(uid ?? "anon", communityId ?? "none"),
    queryFn: () => listPresence(communityId as string),
    enabled: Boolean(uid && communityId),
    refetchOnWindowFocus: false,
  });
}

export function useHandshakes(uid: string | null, communityId: string | null) {
  return useQuery<HandshakeEntry[]>({
    queryKey: communityKeys.handshakes(uid ?? "anon", communityId ?? "none"),
    queryFn: () => listHandshakes(communityId as string),
    enabled: Boolean(uid && communityId),
    refetchOnWindowFocus: false,
  });
}

/**
 * Subscribe the backend to realtime changes for the active community and keep
 * the presence/handshake caches fresh. Watches on mount and whenever the uid or
 * community changes (so it restarts on session change); retries a failed watch a
 * few times and surfaces persistent failure instead of swallowing it.
 */
export function useRealtimeSync(uid: string | null, communityId: string | null): void {
  const queryClient = useQueryClient();
  // Bumped by the failure toast's "Retry" action to actually re-run the effect
  // and restart the subscription — a real retry, not a misleading instruction.
  const [retryNonce, setRetryNonce] = React.useState(0);

  React.useEffect(() => {
    if (!uid || !communityId) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const startWatch = async (attempt: number) => {
      try {
        await watchCommunity(communityId);
        if (cancelled) return;
        // Now that the channel is live, re-fetch to catch anything missed while
        // subscribing.
        void queryClient.invalidateQueries({ queryKey: communityKeys.presence(uid, communityId) });
        void queryClient.invalidateQueries({ queryKey: communityKeys.handshakes(uid, communityId) });
      } catch {
        if (cancelled) return;
        if (attempt < 3) {
          retryTimer = setTimeout(() => void startWatch(attempt + 1), 1500 * (attempt + 1));
        } else {
          toast.error("Live updates are offline", {
            description: "Changes may be delayed until you retry.",
            action: { label: "Retry", onClick: () => setRetryNonce((n) => n + 1) },
          });
        }
      }
    };

    const offPresence = onPresenceChanged((cid) => {
      if (cid === communityId) {
        void queryClient.invalidateQueries({ queryKey: communityKeys.presence(uid, cid) });
      }
    });
    const offHandshake = onHandshakeChanged((cid) => {
      if (cid === communityId) {
        void queryClient.invalidateQueries({ queryKey: communityKeys.handshakes(uid, cid) });
        void queryClient.invalidateQueries({ queryKey: communityKeys.members(uid, cid) });
      }
    });

    void startWatch(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      offPresence();
      offHandshake();
      void unwatchCommunity().catch(() => {});
    };
  }, [uid, communityId, queryClient, retryNonce]);
}

/**
 * Subscribe the backend to the shared-session message stream and keep the
 * message cache fresh. Mirrors useRealtimeSync: SUBSCRIBED-gated in the backend,
 * retries a failed watch a few times, then surfaces an explicit, working Retry
 * action instead of failing silently.
 */
export function useSessionRealtimeSync(uid: string | null, sessionId: string | null): void {
  const queryClient = useQueryClient();
  const [retryNonce, setRetryNonce] = React.useState(0);

  React.useEffect(() => {
    if (!uid || !sessionId) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const startWatch = async (attempt: number) => {
      try {
        await watchSession(sessionId);
        if (cancelled) return;
        void queryClient.invalidateQueries({ queryKey: communityKeys.sessionMessages(uid, sessionId) });
      } catch {
        if (cancelled) return;
        if (attempt < 3) {
          retryTimer = setTimeout(() => void startWatch(attempt + 1), 1500 * (attempt + 1));
        } else {
          toast.error("Live messages are offline", {
            description: "New messages may be delayed until you retry.",
            action: { label: "Retry", onClick: () => setRetryNonce((n) => n + 1) },
          });
        }
      }
    };

    const offSession = onSessionChanged((sid) => {
      if (sid === sessionId) {
        void queryClient.invalidateQueries({ queryKey: communityKeys.sessionMessages(uid, sid) });
      }
    });

    void startWatch(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      offSession();
      void unwatchSession().catch(() => {});
    };
  }, [uid, sessionId, queryClient, retryNonce]);
}

export function useSessionParticipants(uid: string | null, sessionId: string | null) {
  return useQuery<SessionParticipant[]>({
    queryKey: communityKeys.sessionParticipants(uid ?? "anon", sessionId ?? "none"),
    queryFn: () => listSessionParticipants(sessionId as string),
    enabled: Boolean(uid && sessionId),
    refetchOnWindowFocus: false,
  });
}

export function useSessionMessages(uid: string | null, sessionId: string | null) {
  return useQuery<SessionMessage[]>({
    queryKey: communityKeys.sessionMessages(uid ?? "anon", sessionId ?? "none"),
    queryFn: () => listSessionMessages(sessionId as string),
    enabled: Boolean(uid && sessionId),
    refetchOnWindowFocus: false,
  });
}

/**
 * Publish the user's presence in the active community while they're in a
 * shareable mode, refreshing before the server TTL expires. Clears presence
 * when they go Private, leave the community, or lose their identity.
 */
export function usePresencePublisher(
  communityId: string | null,
  privacyMode: PrivacyMode,
  uid: string | null,
): void {
  React.useEffect(() => {
    if (!uid || !communityId) return;

    if (privacyMode === "private") {
      void clearPresence(communityId).catch(() => {});
      return;
    }

    const mode = privacyMode; // "selective" | "open"
    const publish = () => void setPresence(communityId, mode).catch(() => {});
    publish();
    const timer = setInterval(publish, 10 * 60 * 1000);

    return () => {
      clearInterval(timer);
      void clearPresence(communityId).catch(() => {});
    };
  }, [communityId, privacyMode, uid]);
}
