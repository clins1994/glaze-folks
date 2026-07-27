// Roadmap — static, local product content. No backend, no dates, no
// percentages, no fabricated claims. Just an honest picture of what's here now,
// what's next, and what's planned. Keep this list truthful to the app's state.

import type { ComponentProps } from "react";
import { Badge, FieldSet, Separator, Text } from "@glaze/core/components";

interface RoadmapGroup {
  key: string;
  label: string;
  badgeColor: ComponentProps<typeof Badge>["color"];
  blurb: string;
  items: string[];
}

const ROADMAP: RoadmapGroup[] = [
  {
    key: "available",
    label: "Available",
    badgeColor: "green",
    blurb: "In the app today.",
    items: [
      "Private AI conversation",
      "English topic matching",
      "Ephemeral one-to-one rooms",
      "Anonymous-first identity",
      "Realtime match notifications while Folks is open",
      "Security foundation",
    ],
  },
  {
    key: "next",
    label: "High priority",
    badgeColor: "blue",
    blurb: "What we're building next.",
    items: [
      "Multilingual semantic matching",
      "Japanese, Spanish, German, Portuguese, Russian, and more languages",
    ],
  },
  {
    key: "planned",
    label: "Planned",
    badgeColor: "secondary",
    blurb: "On the horizon, not yet started.",
    items: [
      "Multilingual embeddings via pgvector + a server-side embedding provider",
      "Optional live translation",
      "Native background notifications",
      "Broader community / resource-sharing vision, once the core experience works",
    ],
  },
];

export function RoadmapSection() {
  return (
    <FieldSet>
      <div className="flex flex-col gap-1">
        <Text variant="strong">Roadmap</Text>
        <Text variant="small" color="tertiary">
          Where Folks is today and where it's heading.
        </Text>
      </div>

      <div className="flex flex-col gap-5">
        {ROADMAP.map((group, index) => (
          <div key={group.key} className="flex flex-col gap-3">
            {index > 0 ? <Separator /> : null}
            <div className="flex items-center gap-2">
              <Badge color={group.badgeColor}>{group.label}</Badge>
              <Text variant="small" color="tertiary">
                {group.blurb}
              </Text>
            </div>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-[var(--color-text-tertiary)]" />
                  <Text variant="regular" color="secondary">
                    {item}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </FieldSet>
  );
}
