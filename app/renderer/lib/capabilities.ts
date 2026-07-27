// Capability contract (renderer view).
//
// The extension boundary that lets future providers (community Hermes, voice,
// image, local models) slot in without rewriting the companion UI. In P0 the
// only capability is North's private text, backed by the user's own Glaze AI.

export type CapabilityKind = "text";

export type CapabilityOrigin = "glaze-native" | "community-hermes";

export interface CompanionCapability {
  id: string;
  label: string;
  kind: CapabilityKind;
  origin: CapabilityOrigin;
  /** One-line, user-facing description of where this runs and what it sees. */
  description: string;
}

export const NORTH_CAPABILITY: CompanionCapability = {
  id: "north",
  label: "North",
  kind: "text",
  origin: "glaze-native",
  description:
    "Your private companion. The transcript is saved only on this Mac and never shared with a Folks community; messages you send are processed by Glaze AI using your own credits.",
};

/** Registered companion capabilities, in priority order. */
export const COMPANION_CAPABILITIES: CompanionCapability[] = [NORTH_CAPABILITY];
