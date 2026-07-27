// The private AI conversation. Renderer-memory only — never persisted or shared.

import { EmptyState, ScrollArea, Text } from "@glaze/core/components";
import { cn } from "@glaze/core/utils";

import type { ConversationMessage } from "../../lib/folks-types";

export function Conversation({
  messages,
  thinking,
}: {
  messages: ConversationMessage[];
  thinking: boolean;
}) {
  if (messages.length === 0 && !thinking) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <EmptyState
          title="What's on your mind?"
          description="Talk it through here. Folks quietly looks for someone else discussing something similar — your messages stay private."
        />
      </div>
    );
  }

  return (
    <ScrollArea
      autoScrollToBottom
      autoScrollDeps={[messages, thinking]}
      className="flex-1 min-h-0"
      viewportClassName="px-6 py-4"
    >
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3">
        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
        {thinking ? (
          <div className="flex justify-start">
            <div className="rounded-card bg-well px-3 py-2">
              <Text variant="regular" color="tertiary">
                Thinking…
              </Text>
            </div>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function Bubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-card px-3 py-2", isUser ? "bg-control" : "bg-well")}>
        <Text variant="regular" className="whitespace-pre-wrap">
          {message.text}
        </Text>
      </div>
    </div>
  );
}
