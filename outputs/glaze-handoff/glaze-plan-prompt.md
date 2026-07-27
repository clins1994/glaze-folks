# Folks: Glaze Handoff Prompts

## Recommended Use

1. Open a new Glaze app in **Plan mode**.
2. Attach `folks-prd.md`.
3. Attach these visual references:
   - `visual-prototype/screenshots/a-desktop.png`
   - `visual-prototype/screenshots/a-connected-resource-complete.png`
   - `visual-prototype/screenshots/b-desktop.png`
   - `visual-prototype/screenshots/c-desktop.png`
4. Paste the Plan-mode prompt below.
5. Do not enter Build mode until Glaze has answered every feasibility gate with a concrete implementation or fallback.
6. When the plan is satisfactory, paste the Build-mode authorization prompt in the same Glaze conversation.

This is the closest responsible path to a one-shot build. A literal one-shot prompt would force Glaze to invent answers about identity, real-time networking, background behavior, and routing to a private Mac. Resolving those unknowns first should cost fewer credits than repairing an unsafe architecture later.

## Plan-Mode Prompt

```text
Act as the lead product architect and senior macOS engineer for a Glaze Awards submission. Stay in Plan mode. Do not write application code yet.

The attached file, folks-prd.md, is the product source of truth. The attached screenshots are interaction references from a throwaway browser prototype, not code to port literally.

Working product:
Folks
Tagline: Find your people. Share your power.

Outcome:
Create one polished, local-first Glaze Mac app that helps people think privately with AI, notice real people moving in a semantically similar direction without exposing anyone's conversation, mutually consent to connect, and safely request an owner-controlled AI resource from a trusted community.

The competition version must prove one memorable vertical slice:

1. Two independently installed copies represent two real users.
2. User A talks privately with a streaming Glaze AI companion called North.
3. User A chooses Selective mode and explicitly shares only this signal: "safe community AI."
4. User B becomes visible as an abstract nearby presence. Neither user sees the other's transcript, prompt, private summary, or inferred topic label.
5. One user sends a short handshake; both users must accept before a shared session opens.
6. They exchange real text messages and can switch the session among Human only, Quiet notes, and AI on demand.
7. In a trusted community, User B requests one task from User A's Hermes Agent.
8. User A's structured policy allows, denies, caps, or requests approval. The Hermes credential and local endpoint never leave User A's Mac.
9. A successful request adds a transparent estimated usage entry to a contribution ledger. There is no payment, pooled credit, or settlement.
10. The flow includes understandable private, offline, AI-denied, credit-exhausted, resource-unavailable, blocked, and disconnected states.

Visual decision:
Use Living Orbit, screenshot A, as the main experience: a full-window, unframed world with the user's AI at the center and nearby people as functional planetary presences. Borrow Mission Control's clear resource and policy inspector for operational details. Borrow Quiet Field's restraint for private conversation and onboarding. Do not create three separate products or a conventional card dashboard.

Competition priorities:
- Design and aesthetics: distinctive but legible native Mac experience.
- Utility: real two-user connection and one real owner-controlled resource request.
- Creativity: presence without disclosure, mutual AI-assisted conversation, and community resource sovereignty.
- Branding and presentation: Folks should be recognizable in the first viewport and tell a coherent 60-second story.
- Community traction: make invitation and a small trusted group usable, but do not build a public social network.
- Originality and execution are the tie-breakers. Prefer one fully working loop over broad unfinished features.

Non-negotiable safety and privacy invariants:
- Private is the default.
- Never transmit a private transcript, prompt, memory, or raw provider credential for matching.
- Selective mode transmits only a user-approved signal.
- Open-mode semantic presence may use a short-lived privacy-minimized representation only if you can explain precisely how it is derived, transmitted, retained, and deleted.
- No conversation starts without mutual consent.
- Human-only chat must function without Glaze AI permission or credits.
- Each user spends only their own Glaze AI credits; never imply credits are shared or pooled.
- Hermes credentials remain in the owner's macOS Keychain.
- Never expose a home-server port automatically.
- A member submits a bounded request, not arbitrary shell access.
- Owner policy is represented as deterministic structured rules. AI may help translate natural language into a draft rule, but enforcement cannot depend on an unconstrained model judgment.
- Preview people must be visibly labeled as Preview and never represented as live users.
- Include block, report, leave, revoke, and delete-local-data controls.
- Respect reduced motion and keyboard navigation.

P0 scope:
- Identity and invitation sufficient for at least two real users.
- Private Glaze AI streaming text chat.
- Text input; microphone speech-to-text only if reliable with a clear denied-permission fallback.
- Private, Selective, and Open modes.
- Real-time presence, handshake, and shared text session.
- Human only, Quiet notes, and AI on demand session modes.
- One community.
- One Hermes OpenAI-compatible resource owned by one member.
- One permitted and one denied resource request.
- Contribution and usage ledger without money movement.
- Local data and Keychain secret handling.
- Preview world for Store screenshots and judge exploration.

Keep out of P0:
- Stripe or any financial settlement.
- Generated world themes.
- Glaze image-generation workflows.
- Direct Slack, Linear, GitHub, or generic OAuth ingestion.
- Matching based on connected workspaces, projects, repositories, issues, or discussions.
- Live spoken translation.
- Video or avatars.
- Telegram, Discord, or other platform bridges.
- Automatic Hermes installation or tunnel setup.
- Distributed inference.
- Autonomous purchases, account creation, deployment, browser control, government interactions, or other high-impact actions.
- Public communities, production-scale moderation, and hundreds of simultaneous users.

Do not assume Glaze provides undocumented infrastructure. Explicitly verify or design around:
- app access to Glaze account identity;
- multi-user authentication;
- a hosted real-time database or relay;
- background connections and native notifications;
- safe cross-device routing to a local service;
- speech-to-text and speech output available to a Glaze app.

Prefer Glaze-native capabilities where documented:
- Glaze AI streaming text;
- per-app AI permission and per-user credit handling;
- local app storage;
- macOS Keychain for secrets;
- microphone permission;
- external APIs, OAuth, deep links, and custom URL schemes.

Architectural extension requirement:
Preserve one internal capability contract for two future provider families:
1. Glaze-native capabilities, including text generation, image generation, and user-authorized Slack, Linear, GitHub, or custom OAuth sources.
2. Community-owned capabilities, including Hermes Agents, local models, home-server workflows, and member-funded provider agents.

The shared contract must identify provenance, authorizing user or owner, purpose, input and output data classes, permission and approval rules, cost source, availability, side-effect level, retention, and ledger behavior. Do not implement the P2 integrations in the competition build, but avoid an architecture that would require rewriting the personal companion, resource router, consent policy, or ledger to add them later.

For future connected sources, require individual opt-in, minimal read scopes, user approval before publishing a derived Selective signal, deletion of derived signals on revocation, and no disclosure of raw Slack messages, Linear issues, GitHub content, or other private source material through presence matching.

External service rule:
If identity, presence, chat, or job relay requires an external service, propose the smallest possible "community relay." It may hold account identifiers, public profile fields, approved signals or ephemeral matching representations, presence TTLs, handshake state, encrypted-in-transit shared messages, community membership, bounded resource jobs, and minimal audit metadata. It must not receive private companion transcripts, personal AI memory, provider keys, or Hermes credentials.

Hermes request model:
- The contributor's running app maintains an outbound connection or another secure Glaze-compatible transport.
- It receives a bounded job from the relay.
- It evaluates the owner's local structured policy.
- It calls the owner's Keychain-protected local Hermes OpenAI-compatible endpoint, normally POST /v1/chat/completions.
- It returns only the permitted result and ledger metadata.
- If reliable routing while the app is closed is not feasible, make "Owner must be online with Folks open" an explicit honest P0 constraint.

Fallback ladder:
1. Implement the complete real two-user flow.
2. If privacy-safe Open-mode semantic matching is not feasible, ship Private and Selective as real and label Open "Preview"; do not weaken privacy.
3. If background resource routing is not feasible, require the contributor app to be open and online.
4. If native voice is unreliable, ship text only.
5. If the full Hermes call is blocked, retain the real two-user loop and provide a clearly labeled local fixture only for the resource result. Never portray a fixture as a real agent call.
6. Do not replace the real two-user requirement with simulated people.

Return one decisive implementation plan in exactly this structure:

1. Feasibility verdict
   - Overall: feasible, feasible with constraints, or blocked.
   - Name every hard constraint.

2. Capability matrix
   - For identity, real-time presence, shared chat, notifications, Glaze AI, speech, Keychain, local Hermes calls, and cross-device job relay, state:
     documented Glaze capability, external dependency, or unavailable;
     exact proposed implementation;
     data leaving the Mac;
     fallback.

3. System architecture
   - Glaze app modules.
   - Minimal relay modules, if required.
   - Trust boundaries and secret locations.
   - Transport and authentication.
   - Mermaid sequence for the handshake.
   - Mermaid sequence for a permitted Hermes request.

4. Privacy proof
   - Data inventory by Private, Selective, and Open mode.
   - Retention and deletion.
   - Explain why another user or the relay cannot reconstruct a private conversation.

5. Data model and state machines
   - User, signal, presence, handshake, shared session, community, resource, policy, request, and ledger.
   - Handshake and resource-request transitions, including timeouts and revocation.

6. Screen and interaction map
   - Living Orbit main world.
   - Private companion.
   - Presence inspector and handshake.
   - Shared session.
   - Community resource and policy inspector.
   - Contribution ledger.
   - Settings, privacy, permissions, and degraded states.

7. Phased build
   - Phase 0: technical spikes for the riskiest assumptions.
   - Phase 1: native shell, world, local state, and private companion.
   - Phase 2: real identity, presence, handshake, and shared text.
   - Phase 3: community, Hermes routing, policy, and ledger.
   - Phase 4: polish, accessibility, Store assets, and demo mode.
   - For each phase include acceptance checks and a rollback or fallback.

8. Test plan
   - Unit tests for deterministic policy and state transitions.
   - Two-Mac end-to-end tests.
   - Network leakage inspection in Private mode.
   - AI permission and credit exhaustion.
   - Secret handling.
   - Reduced motion and keyboard navigation.

9. Competition delivery
   - Exact 60-second demo sequence.
   - Store screenshot order in 16:9.
   - Store disclosure text.
   - Final submission checklist.

10. Build authorization prompt
   - End with a compact prompt that can be pasted into Build mode to implement this approved plan without reopening settled requirements.

Be direct. Do not offer broad speculative alternatives unless a documented limitation forces a decision. Flag any requirement that cannot honestly work in the contest version. Do not write code in this response.
```

## Build-Mode Authorization Prompt

Use this only after reading and approving Glaze's plan. Keep it in the same Glaze conversation so the approved architecture remains in context.

```text
Switch to Build mode and implement the approved Folks plan end to end.

Treat folks-prd.md, the approved plan, and the attached visual references as the source of truth. Do not broaden the scope or re-open settled visual decisions. Use Living Orbit as the primary experience, Mission Control's inspector pattern for resources and policies, and Quiet Field's restrained tone for private states.

Work through the approved phases in order. At the end of each phase:
- run its acceptance checks;
- repair failures before moving forward;
- preserve the privacy and secret-handling invariants;
- keep all degraded states honest;
- do not substitute Preview data for the required real two-user path.

Choose conservative defaults without asking aesthetic questions. Pause only when I must supply a credential, create an external account, approve a macOS permission, or resolve a contradiction that would weaken privacy or misrepresent functionality. When pausing, ask for exactly one action and explain why it is required.

Before declaring completion, run the complete readiness gate:
- two real users complete Selective signal, presence, handshake, and shared text;
- Human only works without Glaze AI;
- Private mode shows no network leakage of conversation content;
- one permitted and one denied Hermes request behave correctly;
- the Hermes secret remains only in the owner's Keychain;
- AI denial, exhausted credits, denied microphone, offline relay, unavailable owner, revocation, blocking, and deletion all have functional states;
- reduced motion and keyboard navigation work;
- Preview users are unmistakably labeled;
- Store screenshots are 16:9 and tell the 60-second story;
- the published build has no unresolved Glaze errors.

At completion, report:
1. what is genuinely working;
2. what is a Preview or fixture;
3. any external service and data it stores;
4. every permission and credential users must provide;
5. remaining submission risks;
6. the final 60-second demo script.
```

## Credit-Saving Rule

Do not ask Glaze to generate branding variants, generated worlds, payment systems, platform bridges, or live translation during the competition build. The visual prototype has already settled the direction. Spend the first credits on the capability matrix and the two-Mac technical spikes.
