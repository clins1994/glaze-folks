// The temporary one-to-one human room, opened after a mutual match. Same window.
// Shows the shared topic, remaining inactivity time, and a Leave action. No AI
// takes part here. Contact details are voluntary. Nothing is retained after the
// room fades.

import * as React from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Callout, ScrollArea, Text, toast } from "@glaze/core/components";
import { cn } from "@glaze/core/utils";
import { Clock, LogOut } from "lucide-react";

import type { SessionMessage } from "../../lib/folks-types";
import {
  communityKeys,
  useIdentity,
  useRelayStatus,
  useSessionMessages,
  useSessionParticipants,
  useSessionRealtimeSync,
} from "../../lib/use-community";
import { useRoomHeartbeat, useRoomInfo } from "../../lib/use-discovery";
import { postSessionMessage } from "../../lib/community-store";
import { leaveSession } from "../../lib/discovery-store";
import { Composer } from "./composer";

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function RoomView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sessionId } = useParams({ from: "/room/$sessionId" });
  const { topic: topicParam } = useSearch({ from: "/room/$sessionId" });
  const topic = topicParam || "your shared topic";

  const configured = useRelayStatus().data?.configured ?? false;
  const identity = useIdentity(configured);
  const uid = identity.data?.userId ?? null;

  const participants = useSessionParticipants(uid, sessionId);
  const messagesQuery = useSessionMessages(uid, sessionId);
  useSessionRealtimeSync(uid, sessionId);
  const roomInfo = useRoomInfo(uid, sessionId);
  useRoomHeartbeat(sessionId);

  const [draft, setDraft] = React.useState("");
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const messages = messagesQuery.data ?? [];
  const counterpart = (participants.data ?? []).find((p) => !p.isSelf);
  const counterpartDeparted = counterpart?.status === "departed";
  const expiresAt = roomInfo.data ? new Date(roomInfo.data.expiresAt).getTime() : null;
  const remainingMs = expiresAt ? expiresAt - now : null;
  const expired = remainingMs !== null && remainingMs <= 0;
  const canSend = !expired && !counterpartDeparted;

  const post = useMutation({
    mutationFn: (content: string) => postSessionMessage(sessionId, content),
    onSuccess: () => {
      if (uid && sessionId) {
        void queryClient.invalidateQueries({ queryKey: communityKeys.sessionMessages(uid, sessionId) });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't send."),
  });

  const send = () => {
    const text = draft.trim();
    if (!text || !canSend || post.isPending) return;
    setDraft("");
    post.mutate(text);
  };

  const leave = async () => {
    if (sessionId) {
      try {
        await leaveSession(sessionId);
      } catch {
        // best-effort — navigate home regardless
      }
    }
    navigate({ to: "/" });
  };

  return (
    <div className="flex h-full w-full flex-col text-primary">
      <header className="drag-region flex h-14 shrink-0 items-center justify-between pl-[92px] pr-3">
        <div className="flex min-w-0 flex-col">
          <Text variant="small" color="tertiary">
            Talking about
          </Text>
          <Text variant="strong" className="truncate">
            {topic}
          </Text>
        </div>
        <div className="no-drag flex items-center gap-3">
          {remainingMs !== null && !expired ? (
            <span className="flex items-center gap-1.5 text-tertiary">
              <Clock className="size-4 shrink-0" />
              <Text variant="small" color="tertiary" className="tabular-nums">
                Fades in {formatRemaining(remainingMs)}
              </Text>
            </span>
          ) : null}
          <Button size="small" variant="filled" onClick={() => void leave()}>
            <LogOut />
            Leave
          </Button>
        </div>
      </header>

      <ScrollArea
        autoScrollToBottom
        autoScrollDeps={[messages]}
        className="flex-1 min-h-0"
        viewportClassName="px-6 py-4"
      >
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3">
          <Callout color="secondary">
            This is a private, temporary room — no AI takes part. Sharing contact details is voluntary;
            anything you send can be copied or saved by the other person. Nothing is kept once the room
            fades.
          </Callout>
          {messages.map((message) => (
            <RoomBubble key={message.id} message={message} />
          ))}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-separator px-6 py-3">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2">
          {expired ? (
            <Text variant="small" color="tertiary" align="center">
              This room has faded after a quiet stretch. Start a new conversation to find someone else.
            </Text>
          ) : counterpartDeparted ? (
            <Text variant="small" color="tertiary" align="center">
              The other person has left — you can't send new messages here.
            </Text>
          ) : (
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={send}
              disabled={post.isPending}
              placeholder="Message… (you can share contact details if you want)"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RoomBubble({ message }: { message: SessionMessage }) {
  const isSelf = message.isSelf;
  return (
    <div className={cn("flex", isSelf ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-card px-3 py-2", isSelf ? "bg-control" : "bg-well")}>
        {message.deleted ? (
          <Text variant="regular" color="tertiary" className="italic">
            Message removed
          </Text>
        ) : (
          <Text variant="regular" className="whitespace-pre-wrap">
            {message.content}
          </Text>
        )}
      </div>
    </div>
  );
}
