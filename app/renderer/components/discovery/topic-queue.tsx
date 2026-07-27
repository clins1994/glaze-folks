// Queue of shared topics other folks are currently discussing, styled like a
// disclosure queue: collapsed to a count, expandable to one row per topic.
// Matches are grouped by their shared label — a topic several other people are
// discussing shows several matches in one row. Picking a row picks a random
// match from that group; once accepted, its topic rises to the top of the list
// while the other side decides.

import * as React from "react";
import {
  Button,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
  Status,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@glaze/core/components";
import { Handshake, Trash2, UserPlus } from "lucide-react";

import type { DiscoveryMatch } from "../../lib/folks-types";

interface TopicGroup {
  label: string;
  matches: DiscoveryMatch[];
  pending: DiscoveryMatch | null;
  mutual: DiscoveryMatch | null;
}

function groupMatches(matches: DiscoveryMatch[]): TopicGroup[] {
  const byLabel = new Map<string, DiscoveryMatch[]>();
  for (const match of matches) {
    const list = byLabel.get(match.label) ?? [];
    list.push(match);
    byLabel.set(match.label, list);
  }
  const groups = Array.from(byLabel.entries()).map(([label, list]) => ({
    label,
    matches: list,
    pending: list.find((m) => m.accepted && !m.mutual) ?? null,
    mutual: list.find((m) => m.mutual) ?? null,
  }));
  // A topic with an accepted or mutual match rises to the top of the queue.
  groups.sort((a, b) => Number(Boolean(b.pending || b.mutual)) - Number(Boolean(a.pending || a.mutual)));
  return groups;
}

interface TopicQueueProps {
  matches: DiscoveryMatch[];
  connectingId: string | null;
  onConnect: (match: DiscoveryMatch) => void;
  onDismiss: (match: DiscoveryMatch) => void;
  onOpenRoom: (match: DiscoveryMatch) => void;
  /** Omit the outer border/rounding/background when composed inside another bordered group. */
  bare?: boolean;
}

export function TopicQueue({ matches, connectingId, onConnect, onDismiss, onOpenRoom, bare }: TopicQueueProps) {
  const groups = React.useMemo(() => groupMatches(matches), [matches]);
  const hasActive = groups.some((g) => g.pending || g.mutual);
  const wasActive = React.useRef(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (hasActive && !wasActive.current) setOpen(true);
    wasActive.current = hasActive;
  }, [hasActive]);

  if (groups.length === 0) return null;

  return (
    <CollapsibleRoot
      open={open}
      onOpenChange={setOpen}
      className={bare ? undefined : "rounded-card border border-field bg-control-subtle"}
    >
      <CollapsibleTrigger variant="row" className="w-full gap-2 px-3 py-2.5">
        <CollapsibleChevron />
        <Text variant="regular" color="secondary">
          {groups.length} topic{groups.length === 1 ? "" : "s"} also being discussed by other folks
        </Text>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col divide-y divide-separator border-t border-separator">
          {groups.map((group) => (
            <TopicRow
              key={group.label}
              group={group}
              connecting={group.matches.some((m) => m.id === connectingId)}
              onConnect={onConnect}
              onDismiss={onDismiss}
              onOpenRoom={onOpenRoom}
            />
          ))}
        </div>
      </CollapsibleContent>
    </CollapsibleRoot>
  );
}

interface TopicRowProps {
  group: TopicGroup;
  connecting: boolean;
  onConnect: (match: DiscoveryMatch) => void;
  onDismiss: (match: DiscoveryMatch) => void;
  onOpenRoom: (match: DiscoveryMatch) => void;
}

function TopicRow({ group, connecting, onConnect, onDismiss, onOpenRoom }: TopicRowProps) {
  const { label, matches, pending, mutual } = group;

  const handleActivate = () => {
    if (mutual) {
      onOpenRoom(mutual);
      return;
    }
    if (pending || connecting) return;
    const chosen = matches[Math.floor(Math.random() * matches.length)];
    onConnect(chosen);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleActivate();
        }
      }}
      className="group flex cursor-pointer items-center gap-2 py-2.5 pl-3 pr-2 hover:bg-control"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <Text variant="regular" className="truncate">
          {label}
        </Text>
        {matches.length > 1 ? (
          <Text variant="small" color="tertiary">
            {matches.length} people discussing this
          </Text>
        ) : null}
      </div>

      {mutual ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              iconOnly
              size="small"
              variant="accent"
              aria-label="Connect"
              onClick={(event) => {
                event.stopPropagation();
                onOpenRoom(mutual);
              }}
            >
              <Handshake />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Connect</TooltipContent>
        </Tooltip>
      ) : pending ? (
        <Status variant="loading">Waiting</Status>
      ) : (
        <div className="-my-[5px] flex items-center gap-1 opacity-0 group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                iconOnly
                variant="transparent"
                size="small"
                aria-label="Invite to connect"
                disabled={connecting}
                onClick={(event) => {
                  event.stopPropagation();
                  handleActivate();
                }}
              >
                <UserPlus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Invite to connect</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                iconOnly
                variant="transparent"
                size="small"
                aria-label="Not interested in this topic"
                disabled={connecting}
                onClick={(event) => {
                  event.stopPropagation();
                  matches.forEach((match) => onDismiss(match));
                }}
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Not interested</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
