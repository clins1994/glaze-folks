// Folks — the single, minimal surface. A private AI conversation that quietly
// derives topics; when someone else is discussing something similar, an inline
// match appears. Both accept → a temporary room opens in this same window.
//
// The transcript lives in renderer memory only (never persisted, never sent to
// Supabase). Only AI-derived topic labels are synced, and only when configured.

import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Callout, toast } from "@glaze/core/components";
import { useGlazeAI } from "@glaze/core/hooks";
import { Github } from "lucide-react";

import type { ConversationMessage, DiscoveryMatch, TurnResult } from "../../lib/folks-types";
import { useIdentity, useRelayStatus } from "../../lib/use-community";
import { discoveryKeys, useDiscovery, useDiscoveryRealtime } from "../../lib/use-discovery";
import { acceptMatch, dismissMatch, runAiTurn, syncDiscovery } from "../../lib/discovery-store";
import { Conversation } from "./conversation";
import { Composer } from "./composer";
import { TopicQueue } from "./topic-queue";

const REPO_URL = "https://github.com/clins1994/glaze-folks";

const BLOCKED_MESSAGE: Record<string, string> = {
  "needs-consent": "Folks needs your OK to use AI. Try again when you're ready.",
  "signed-out": "Sign in to Glaze to talk here.",
  "needs-subscription": "This needs an upgraded Glaze plan. Try again to see options.",
  "insufficient-credits": "You're out of Glaze AI credits for now.",
  "daily-limit-reached": "You've reached today's AI limit. It refreshes tomorrow.",
  "host-unavailable": "Glaze couldn't be reached. Try again.",
  disabled: "AI is currently unavailable for this account.",
  timeout: "That took too long to answer. Try again.",
  error: "Something went wrong. Try again.",
};

export function DiscoveryScreen() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const configured = useRelayStatus().data?.configured ?? false;
  const identity = useIdentity(configured);
  const uid = identity.data?.userId ?? null;

  useDiscoveryRealtime(uid);
  const discovery = useDiscovery(uid);
  const matches = discovery.data?.matches ?? [];

  const [messages, setMessages] = React.useState<ConversationMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [connectingId, setConnectingId] = React.useState<string | null>(null);
  const { enableInHost } = useGlazeAI();

  const generate = React.useCallback(
    async (history: ConversationMessage[]) => {
      setThinking(true);
      setBlocked(null);
      const turnHistory = history.map((m) => ({
        role: (m.role === "ai" ? "assistant" : "user") as "assistant" | "user",
        content: m.text,
      }));
      let result: TurnResult | null = null;
      try {
        result = await runAiTurn(turnHistory);
      } catch {
        result = null;
      } finally {
        // ALWAYS clear the thinking state — the composer must never stay disabled,
        // no matter how the turn settled (resolved, rejected, or timed out).
        setThinking(false);
      }
      if (!result) {
        // Unexpected failure crossing IPC — surface a working Try again.
        setBlocked("error");
        return;
      }
      if (!result.ok) {
        setBlocked(result.blocked);
        // The backend already attempts one automatic token/consent recovery; if it
        // still came back host/consent-blocked, drive the host consent affordance
        // so the user's next Try again (or send) succeeds.
        if (result.blocked === "host-unavailable" || result.blocked === "needs-consent") {
          try {
            await enableInHost();
          } catch {
            // consent flow will surface its own UI
          }
        }
        return;
      }
      setMessages((prev) => [...prev, { id: `ai-${Date.now()}`, role: "ai", text: result.reply }]);
      // Only the derived topic labels leave this Mac — and only when configured.
      if (uid && result.topics.length > 0) {
        try {
          const sync = await syncDiscovery(result.topics);
          queryClient.setQueryData(discoveryKeys.discovery(uid), sync);
        } catch {
          // Matching may be offline; the conversation still works.
        }
      }
    },
    [enableInHost, queryClient, uid],
  );

  const send = () => {
    const text = draft.trim();
    if (!text || thinking) return;
    const userMessage: ConversationMessage = { id: `u-${Date.now()}`, role: "user", text };
    const next = [...messages, userMessage];
    setMessages(next);
    setDraft("");
    void generate(next);
  };

  const handleConnect = async (match: DiscoveryMatch) => {
    setConnectingId(match.id);
    try {
      const result = await acceptMatch(match.id);
      if (result.mutual && result.sessionId) {
        navigate({ to: "/room/$sessionId", params: { sessionId: result.sessionId }, search: { topic: match.label } });
      } else if (uid) {
        void queryClient.invalidateQueries({ queryKey: discoveryKeys.discovery(uid) });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't connect. Try again.");
    } finally {
      setConnectingId(null);
    }
  };

  const handleDismiss = async (match: DiscoveryMatch) => {
    try {
      await dismissMatch(match.id);
      if (uid) void queryClient.invalidateQueries({ queryKey: discoveryKeys.discovery(uid) });
    } catch {
      // best-effort
    }
  };

  const openRoom = (match: DiscoveryMatch) => {
    if (match.sessionId) {
      navigate({ to: "/room/$sessionId", params: { sessionId: match.sessionId }, search: { topic: match.label } });
    }
  };

  return (
    <div className="flex h-full w-full flex-col text-primary">
      <header className="drag-region flex h-14 shrink-0 items-center justify-end pl-[92px] pr-3">
        <div className="no-drag flex items-center rounded-pill border border-field bg-control-subtle p-1">
          <Button
            iconOnly
            variant="transparent"
            size="small"
            radius="full"
            aria-label="View source on GitHub"
            onClick={() => void window.glazeAPI.shell.openExternal(REPO_URL)}
          >
            <Github />
          </Button>
        </div>
      </header>

      <Conversation messages={messages} thinking={thinking} />

      <div className="shrink-0 px-6 py-3">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3">
          {blocked ? (
            <Callout
              color="orange"
              actions={
                <Button size="small" variant="filled" onClick={() => void generate(messages)}>
                  Try again
                </Button>
              }
            >
              {BLOCKED_MESSAGE[blocked] ?? "AI is unavailable right now."}
            </Callout>
          ) : null}

          {matches.length > 0 ? (
            <div className="flex flex-col divide-y divide-separator overflow-hidden rounded-card border border-field bg-control-subtle">
              <TopicQueue
                matches={matches}
                connectingId={connectingId}
                onConnect={(m) => void handleConnect(m)}
                onDismiss={(m) => void handleDismiss(m)}
                onOpenRoom={openRoom}
                bare
              />
              <Composer value={draft} onChange={setDraft} onSend={send} disabled={thinking} bare />
            </div>
          ) : (
            <Composer value={draft} onChange={setDraft} onSend={send} disabled={thinking} />
          )}
        </div>
      </div>
    </div>
  );
}
