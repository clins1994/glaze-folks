// Inline match notification. Before connecting it carries NO identity — just the
// shared topic. Connect / Not now while pending; once both accept, Open room.

import { Button, Callout, Status } from "@glaze/core/components";

import type { DiscoveryMatch } from "../../lib/folks-types";

interface MatchNoticeProps {
  match: DiscoveryMatch;
  connecting: boolean;
  onConnect: (match: DiscoveryMatch) => void;
  onDismiss: (match: DiscoveryMatch) => void;
  onOpenRoom: (match: DiscoveryMatch) => void;
}

export function MatchNotice({ match, connecting, onConnect, onDismiss, onOpenRoom }: MatchNoticeProps) {
  if (match.mutual && match.sessionId) {
    return (
      <Callout
        color="green"
        actions={
          <Button size="small" variant="accent" onClick={() => onOpenRoom(match)}>
            Open room
          </Button>
        }
      >
        You're connected on {match.label}.
      </Callout>
    );
  }

  if (match.accepted) {
    return (
      <Callout color="secondary">
        <Callout.Text>
          <span className="inline-flex items-center gap-2">
            <Status variant="loading">Waiting</Status>
            Waiting for them to accept — {match.label}.
          </span>
        </Callout.Text>
      </Callout>
    );
  }

  return (
    <Callout color="blue">
      <Callout.Text>Someone else is discussing {match.label}.</Callout.Text>
      <Callout.Actions>
        <Button size="small" variant="transparent" onClick={() => onDismiss(match)} disabled={connecting}>
          Not now
        </Button>
        <Button size="small" variant="accent" onClick={() => onConnect(match)} disabled={connecting}>
          Connect
        </Button>
      </Callout.Actions>
    </Callout>
  );
}
