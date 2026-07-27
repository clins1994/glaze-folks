// Current topic status — the specific subjects Folks is quietly matching on.
// Generic topics never match, so they're not shown here.

import { Badge, Text } from "@glaze/core/components";

import type { ActiveTopic } from "../../lib/folks-types";

export function TopicStatus({ topics }: { topics: ActiveTopic[] }) {
  // De-duplicate by label; only specific (non-generic) topics are matchable.
  const labels = Array.from(
    new Set(topics.filter((t) => !t.generic).map((t) => t.label.trim()).filter(Boolean)),
  ).slice(0, 4);

  return (
    <div className="flex min-h-6 flex-wrap items-center gap-2">
      <Text variant="small" color="tertiary" className="shrink-0">
        {labels.length > 0 ? "Matching on" : "Listening for a topic…"}
      </Text>
      {labels.map((label) => (
        <Badge key={label} color="blue">
          {label}
        </Badge>
      ))}
    </div>
  );
}
