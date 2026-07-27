// Shared composer for the conversation and the room. Enter to send; supports
// macOS Dictation (any focused text field — press fn twice).

import { useRef } from "react";
import { Button, Textarea } from "@glaze/core/components";
import { ArrowUp } from "lucide-react";

import { SESSION_MESSAGE_MAX } from "../../lib/folks-types";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function Composer({ value, onChange, onSend, disabled, placeholder, maxLength }: ComposerProps) {
  const composingRef = useRef(false);
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="flex items-center gap-1 rounded-pill border border-field bg-control-subtle px-2 py-1.5">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onCompositionStart={() => (composingRef.current = true)}
        onCompositionEnd={() => (composingRef.current = false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !composingRef.current) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        disabled={disabled}
        maxLength={maxLength ?? SESSION_MESSAGE_MAX}
        placeholder={placeholder ?? "What's on your mind?"}
        className="min-h-0 flex-1 resize-none border-0 bg-transparent px-2 py-1"
      />
      <Button
        iconOnly
        variant="accent"
        onClick={onSend}
        disabled={!canSend}
        aria-label="Send"
      >
        <ArrowUp />
      </Button>
    </div>
  );
}
