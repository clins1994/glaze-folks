// React Query hooks for discovery: active topics + live matches, the match
// realtime subscription, and the room's inactivity clock / heartbeat.
//
// Everything is keyed by the authenticated uid. Reads are RLS-scoped in the
// backend (a user only ever sees their OWN matches). Realtime pushes a coarse,
// data-free event; we re-read through syncDiscovery, never trusting the push.

import * as React from "react";
import { toast } from "@glaze/core/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { RoomInfo, SyncResult } from "./folks-types";
import {
  getRoomInfo,
  onMatchesChanged,
  syncDiscovery,
  touchSession,
  unwatchMatches,
  watchMatches,
} from "./discovery-store";

export const discoveryKeys = {
  discovery: (uid: string) => ["discovery", uid] as const,
  room: (uid: string, sessionId: string) => ["room", uid, sessionId] as const,
};

/**
 * Current active topics + live matches. Calling syncDiscovery([]) with no new
 * topics is a pure refresh (it never adds topics) — used on mount, on realtime
 * pushes, and after reconnection to pull active unexpired matches.
 */
export function useDiscovery(uid: string | null) {
  return useQuery<SyncResult>({
    queryKey: discoveryKeys.discovery(uid ?? "anon"),
    queryFn: () => syncDiscovery([]),
    enabled: Boolean(uid),
    refetchOnWindowFocus: false,
  });
}

/**
 * Subscribe the backend to the caller's match records and keep the discovery
 * cache fresh. Mirrors useRealtimeSync: SUBSCRIBED-gated in the backend, retries
 * a failed watch, then surfaces a working Retry action instead of failing quietly.
 */
export function useDiscoveryRealtime(uid: string | null): void {
  const queryClient = useQueryClient();
  const [retryNonce, setRetryNonce] = React.useState(0);

  React.useEffect(() => {
    if (!uid) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const startWatch = async (attempt: number) => {
      try {
        await watchMatches(uid);
        if (cancelled) return;
        void queryClient.invalidateQueries({ queryKey: discoveryKeys.discovery(uid) });
      } catch {
        if (cancelled) return;
        if (attempt < 3) {
          retryTimer = setTimeout(() => void startWatch(attempt + 1), 1500 * (attempt + 1));
        } else {
          toast.error("Matching updates are offline", {
            description: "New matches may be delayed until you retry.",
            action: { label: "Retry", onClick: () => setRetryNonce((n) => n + 1) },
          });
        }
      }
    };

    const offMatches = onMatchesChanged((changedUid) => {
      if (changedUid === uid) {
        void queryClient.invalidateQueries({ queryKey: discoveryKeys.discovery(uid) });
      }
    });

    void startWatch(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      offMatches();
      void unwatchMatches().catch(() => {});
    };
  }, [uid, queryClient, retryNonce]);
}

/** The room's inactivity clock (refetched as messages/heartbeats update it). */
export function useRoomInfo(uid: string | null, sessionId: string | null) {
  return useQuery<RoomInfo>({
    queryKey: discoveryKeys.room(uid ?? "anon", sessionId ?? "none"),
    queryFn: () => getRoomInfo(sessionId as string),
    enabled: Boolean(uid && sessionId),
    refetchOnWindowFocus: false,
    // Keep lastActivityAt reasonably fresh even without a realtime nudge.
    refetchInterval: 30_000,
  });
}

/**
 * Keep the room alive ONLY while a participant is genuinely present — i.e. the
 * Folks window is focused AND the user has interacted (pointer/keyboard) recently.
 * Mounting the room view alone never heartbeats, so leaving Folks open and idle
 * lets the room expire. Sending a message is separate activity: it refreshes the
 * room clock server-side via post_session_message.
 */
export function useRoomHeartbeat(sessionId: string | null): void {
  React.useEffect(() => {
    if (!sessionId) return;

    // A heartbeat only counts if the user did something in the last 90s. We start
    // with NO recorded interaction, so a freshly-mounted-but-idle room does not
    // beat until the person actually acts.
    const INTERACTION_WINDOW_MS = 90_000;
    let lastInteraction = 0;
    const noteInteraction = () => {
      lastInteraction = Date.now();
    };
    const interactionEvents = ["pointerdown", "keydown"] as const;
    interactionEvents.forEach((event) =>
      document.addEventListener(event, noteInteraction, { passive: true }),
    );

    const beat = () => {
      if (!document.hasFocus()) return;
      if (lastInteraction === 0 || Date.now() - lastInteraction > INTERACTION_WINDOW_MS) return;
      void touchSession(sessionId).catch(() => {});
    };
    const timer = setInterval(beat, 30_000);

    return () => {
      clearInterval(timer);
      interactionEvents.forEach((event) => document.removeEventListener(event, noteInteraction));
    };
  }, [sessionId]);
}
