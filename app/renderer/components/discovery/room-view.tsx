// The temporary one-to-one human room, opened after a mutual match. Same window.
// Shows the shared topic, remaining inactivity time, and a Leave action. No AI
// takes part here. Contact details are voluntary. Nothing is retained after the
// room fades.

import * as React from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, ScrollArea, Text, toast } from "@glaze/core/components";
import { cn } from "@glaze/core/utils";
import { Clock, LogOut } from "lucide-react";

import folksIcon from "../../assets/app-icon.png";
import type { SessionMessage } from "../../lib/folks-types";
import {
  communityKeys,
  useIdentity,
  useRelayStatus,
  useSessionMessages,
  useSessionParticipants,
  useSessionRealtimeSync,
} from "../../lib/use-community";
import { discoveryKeys, useRoomHeartbeat, useRoomInfo } from "../../lib/use-discovery";
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

  // Any message activity (ours or the counterpart's, via realtime) pushes the
  // server's inactivity clock out — refresh our cached room info alongside it so
  // the countdown can't read stale and falsely show "faded" before the next poll.
  React.useEffect(() => {
    if (!uid || !sessionId) return;
    void queryClient.invalidateQueries({ queryKey: discoveryKeys.room(uid, sessionId) });
  }, [messagesQuery.dataUpdatedAt, uid, sessionId, queryClient]);

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
      <header className="drag-region relative flex h-14 shrink-0 items-center justify-end pl-[92px] pr-3">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-[100px]">
          <div className="flex h-[34px] min-w-0 items-center rounded-pill border border-field bg-control-subtle px-3.5">
            <Text variant="strong" className="truncate">
              {topic}
            </Text>
          </div>
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
          <Button size="small" variant="muted" className="h-[34px] border-field px-3.5" onClick={() => void leave()}>
            <LogOut />
            Leave
          </Button>
        </div>
      </header>

      {messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <EmptyState
            media={<img src={folksIcon} alt="" className="size-12 rounded-xl" draggable={false} />}
            title={topic}
            description="This is a private, temporary room — no AI takes part. Sharing contact details is voluntary; anything you send can be copied or saved by the other person. Nothing is kept once the room fades. Sending messages keeps the room alive by resetting the fade timer."
          />
        </div>
      ) : (
        <ScrollArea
          autoScrollToBottom
          autoScrollDeps={[messages]}
          className="flex-1 min-h-0"
          viewportClassName="px-6 py-4"
        >
          <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3">
            {messages.map((message) => (
              <RoomBubble key={message.id} message={message} />
            ))}
          </div>
        </ScrollArea>
      )}

      <div className="shrink-0 px-6 py-3">
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
