ℹ️ the Glaze app is a bit stripped down version of this PRD because I did not have time to add/test all the features

# Folks

Competition product requirements document for the Glaze Awards

Status: Ready for Glaze Plan mode
Product name: Folks
Working tagline: Find your people. Share your power.
Prepared: 24 July 2026

## Executive Summary

Folks is a local-first macOS app that turns private AI use into a path toward meaningful human connection and trusted resource sharing.

People begin in a private text or voice conversation with a personal AI. The app never publishes their conversation. When the user chooses Selective or Open presence, the app derives only enough semantic information to represent that someone else is exploring related ideas. Other people appear as nearby bodies in a living, universe-like field. They can move closer as interests converge without seeing one another's prompts, transcripts, or private AI memories.

Either person can send a lightweight handshake. Both sides may connect now, stay nearby for later, politely defer, or decline. A connected session can be human-only, AI-assisted on demand, quietly summarized, translated, or joined by both users' personal AIs according to owner-controlled policies.

Trusted communities can also contribute AI resources. The first supported resource is an owner-controlled Hermes Agent exposed through its OpenAI-compatible API. Another member may request help from that resource only under the owner's visible policy. The credential must remain on the owner's Mac. The owner can limit, approve, pause, or revoke access. The app records who contributed the resource, who requested it, whether it incurred an estimated cost, and what useful result returned. It does not settle real payments in the competition build.

The product's central claim is:

> AI should not isolate people inside individual subscriptions. It should help them find one another, form trust, and safely share the capabilities their community already possesses.

## Competition Intent

The submitted app should demonstrate one memorable end-to-end story:

1. A user begins a private AI conversation.
2. The user chooses a discoverability mode.
3. Another real user's presence moves closer because the two users are exploring related ideas.
4. Neither user sees the other's private conversation.
5. One user sends a handshake and the other accepts.
6. They enter a shared session and choose how AI may participate.
7. One user invokes an AI resource contributed by the other.
8. The request is evaluated against the owner's policy, completed, and recorded in a transparent contribution ledger.

The design should make this sequence understandable in under one minute without explanatory onboarding text covering the interface.

## Problem Statement

AI capability is abundant but unevenly accessible. Within families, friend groups, and communities, some people have home servers, local models, provider subscriptions, agent systems, or the technical skill to configure them. Other people have no practical route to those resources beyond buying another individual subscription or learning to operate infrastructure themselves.

Existing options create several barriers:

- Major AI products organize access around individual or enterprise subscriptions.
- Provider lock-in makes a person's knowledge, workflows, and spending difficult to share.
- Local AI requires hardware, setup time, maintenance, and technical fluency.
- Sharing a provider key or unrestricted home-server access creates unacceptable security risks.
- A compromised participant can threaten an entire trusted network.
- Group-chat agents make AI available in a channel, but they do not provide a coherent model for ownership, permissions, contributions, revocation, or fair use.
- People often use AI alone even when others are independently exploring the same subject.
- Social feeds expose content and reward performance rather than helping people notice quiet, relevant human presence.

The deeper problem is that communities possess more collective AI capability than their members can safely use together.

## Product Principles

### Connection, not replacement

AI should lead people toward relevant humans and shared action. It should not imitate friendship, pressure users to remain engaged, or make human participation secondary.

### Private by default

A personal AI conversation is private unless the user makes a specific, reversible sharing choice. Open presence does not mean an open transcript.

### Presence before disclosure

Users can perceive that another person is exploring related ideas without learning what that person said. Disclosure increases only through mutual consent.

### Owner sovereignty

Only an AI or resource owner can grant another person access. The owner can choose broad access, a narrow natural-language policy, per-request approval, or no access. Every grant is revocable.

### Natural-language policy, structured enforcement

Users may describe privacy and resource rules conversationally, but the app must convert them into a visible, deterministic policy that can be reviewed and edited.

### Local-first, network only when necessary

Private conversations, personal profile details, local AI credentials, preferences, and world appearance stay on the Mac where possible. The network receives only the minimum information required for identity, presence, matching, handshakes, shared sessions, and routed resource requests.

### Graceful absence

The product must remain useful when AI permission is denied, Glaze credits are unavailable, the microphone is denied, another user goes offline, or a contributed resource is unreachable.

### One stable world model, many visual interpretations

Self, people, communities, agents, resources, proximity, trust, and connection states are stable entities. The cosmic world is the polished default renderer. Generated personal "worldviews" may reinterpret those entities later without changing their meaning.

## Target Users

### Primary: Curious community member

A person who already uses AI or wants to learn, but does not want to operate infrastructure. They want a private place to think, a natural way to meet relevant people, and safe access to community capabilities.

### Primary: Community contributor

A technically capable person with a Mac, home server, Hermes Agent, local model, provider account, or useful automated workflow. They want to help people they trust without exposing credentials, private files, or unlimited spending.

### Secondary: Community steward

A person who creates or moderates a community, defines membership and policies, handles reports, and helps members decide which shared capabilities to develop.

### Secondary: Complete beginner

A person with little AI fluency. They need adaptive onboarding that explains choices in ordinary language without requiring them to understand models, tokens, endpoints, or infrastructure.

## Product Promise

Folks helps people think privately with AI, discover relevant human presence without exposing their conversations, and safely use AI resources contributed by people they trust.

## The Magic Moment

While a user is privately discussing an idea with their AI, a distant human presence quietly moves closer. The app indicates only that there is meaningful overlap. The user sends a handshake, receives consent, enters a shared conversation, and later sees a useful task completed by an AI resource contributed by that new community.

The emotional sequence is:

Isolation -> presence -> recognition -> consent -> conversation -> trust -> shared capability.

## Submitted Vertical Slice

### P0: Required for the competition submission

- Real user identity suitable for at least two independently installed copies of the app.
- A private personal AI conversation using Glaze AI streaming text.
- Text input at all times.
- Optional microphone input when macOS permission is granted and Glaze can implement reliable speech-to-text.
- Three discoverability modes: Private, Selective, and Open.
- Ephemeral semantic presence in Open mode without sharing transcript text.
- Explicit user-authored signals in Selective mode.
- A living universe view containing self and nearby real users.
- A mutual handshake with Connect now, Stay nearby, Not now, and Decline outcomes.
- A real shared text session between two users.
- Session AI modes: Human only, Quiet notes, and On demand.
- Clear indicators for recording, AI participation, translation, and retention.
- One trusted community containing at least two real users.
- One owner-controlled Hermes Agent resource connection.
- One routed request from a member to that resource.
- An owner policy that can allow, deny, cap, or require approval.
- A contribution and usage ledger with understandable estimated cost and no real settlement.
- Local storage for private app data and macOS Keychain storage for secrets.
- Offline, denied-permission, exhausted-credit, unavailable-resource, and disconnected-user states.
- Block, report, leave-session, revoke-access, and delete-local-data controls.

### P1: Add only after the P0 loop works

- Streaming speech output using a native macOS voice.
- Paired-companion sessions with two humans and two owner-controlled AIs.
- AI-generated shared-session notes.
- Text translation between participants' preferred languages.
- Community creation, invitations, and multiple memberships.
- External platform bridge through Hermes messaging integrations.
- Resource availability schedules and personal capacity reserves.
- Community contribution board with compute, money, uptime, and useful work shown separately.
- Profile introductions and AI-assisted handshake messages.

### P2: Designed extension, not a submission dependency

- Live spoken translation.
- Generated and shareable worldviews.
- Direct opt-in Slack, Linear, and GitHub source connectors.
- User-approved signals derived from connected work and discussion sources.
- Glaze image generation for personalized worldviews and visual workflow artifacts.
- Public community directory.
- Cross-community topic discovery.
- Automatic Hermes installation and secure-tunnel setup.
- Multiple resource types and intelligent routing among them.
- Community policy deliberation and voting.
- Real payment settlement through Stripe or another provider.
- Community cards or agent-controlled purchasing.
- Autonomous browser, phone, email, government, or deployment workflows.
- Distributed inference across multiple contributed computers.
- Video calls and generated avatars.
- Mobile and non-Mac clients.

## Discoverability Modes

### Private

- No presence record is published.
- No semantic representation leaves the device for matching.
- The user cannot be discovered through their conversation.
- The user may still communicate with existing contacts and communities they open intentionally.

### Selective

- The user explicitly declares a standing signal in natural language.
- Example: "If someone is discussing safe local AI for families, I would like to participate."
- The app converts the statement into a structured signal and displays a plain-language preview before publishing it.
- Only that approved signal may be used for matching.
- The underlying private conversation remains unavailable.
- The signal can include community scope, language preference, time window, availability, and expiration.
- The user can pause, edit, or delete it at any time.

### Open

- The app may derive an ephemeral semantic representation from the current private conversation for proximity matching.
- Raw prompts, transcripts, AI responses, files, names, and topic labels are not published.
- Nearby users see presence and changing proximity, not the conversation.
- The derived representation expires shortly after the session or immediately when Open mode ends.
- Entering Open mode requires an explicit state change with a persistent on-screen indicator.

## Semantic Presence Model

The universe does not depict physical location. Distance represents current semantic relevance.

- A person's visual body is anonymous until their profile disclosure policy allows more.
- Proximity changes gradually to avoid revealing exact prompt changes.
- No exact similarity score is shown.
- The interface may say "A nearby mind is exploring something related" but must not guess or reveal the other person's subject.
- A user can mute an individual presence before connection.
- A user can disable presence sounds or all motion.
- A user can open a conventional list representation for accessibility.
- Empty-world behavior must clearly distinguish between no matches, offline mode, and a relay problem.
- Seeded demo presences may be used only in an explicitly labeled Preview world. They must never masquerade as live people.

## Handshake State Machine

States:

1. `idle`: Neither person has initiated contact.
2. `outgoing`: The initiator has sent a request.
3. `incoming`: The recipient has a request.
4. `connected`: Both users consented to a shared session.
5. `nearby`: At least one user chose to preserve the connection for later.
6. `deferred`: The recipient chose Not now; a respectful cooldown prevents immediate repeat requests.
7. `declined`: The request ended without a reason being disclosed.
8. `blocked`: One user blocked the other; no further proximity or requests occur.
9. `expired`: The unanswered request timed out.

Rules:

- A handshake never includes private conversation text automatically.
- A user may attach a short manual or AI-assisted introduction after reviewing it.
- The recipient sees only profile details authorized by the sender.
- The sender receives the outcome but not a private explanation.
- Natural-language responses map to explicit states. "Tell them I am interested but busy" maps to Nearby or Deferred only after confirmation when ambiguous.
- Rate limits apply per sender and recipient.
- Decline and block are always available without requiring a reason.

## Shared Session Model

### Human only

- AI does not listen, transcribe, summarize, or participate.
- The session contains only messages deliberately sent by the humans.

### Quiet notes

- AI may process the shared conversation only after every participant consents.
- AI does not speak unless a user changes mode.
- Participants see an unmissable notes indicator.
- Notes are shown for review before being saved.
- Each participant can choose whether notes are stored locally.

### On demand

- AI remains inactive until a participant explicitly invokes it by name or command.
- Invocation and the resulting AI message are visible to everyone.
- The requester spends their own Glaze credits when Glaze AI is used.

### Paired companions

- Each personal AI remains under its owner's authority.
- A personal AI may use private owner context internally only according to owner policy.
- It must not reveal private memory, files, profile facts, or past conversations unless the owner has explicitly allowed that disclosure.
- Each AI is visually and textually attributable to its owner.
- Either owner can remove their AI immediately without ending the human session.

### Session-level controls

- Participant list.
- AI participation mode.
- Microphone and transcription status.
- Translation status.
- Retention duration.
- Notes destination.
- Leave session.
- Report participant.
- Block participant.

## Communities

A community is a trust and policy boundary, not merely a chat room.

A community contains:

- Members and roles.
- Invitation and membership rules.
- Shared sessions.
- Declared interests and projects.
- Contributed AI resources.
- Resource access policies.
- Usage and contribution ledger.
- Moderation records.

Competition scope should support one private community and a small member count. Public communities and inter-community discovery are P2.

## AI Resource Sharing

### First resource type

The first supported resource is a Hermes Agent API server because Hermes can expose an OpenAI-compatible HTTP endpoint while retaining its configured model, tools, memory, and provider routing.

The user-facing setup asks for outcomes:

- "Connect a Hermes Agent on this Mac or another computer."
- "Keep its credential on this Mac."
- "Choose who may use it and what it may do."
- "Choose whether every request, expensive requests, or no requests require approval."

It should not ask nontechnical users to understand OpenAI protocol details unless advanced setup is opened.

### Required security invariant

The Hermes endpoint URL and API key must never be disclosed to requesting members or embedded in the published app.

Preferred request path:

1. The member submits a resource request to the community relay.
2. The contributor's online Folks app receives the encrypted or access-controlled request through an outbound connection.
3. The contributor app evaluates the local owner policy.
4. If approval is required, the contributor receives a native notification and approves or denies.
5. The contributor app calls the local or private Hermes endpoint using the credential stored in Keychain.
6. The contributor app returns the permitted result through the relay.
7. The app records minimal usage metadata for the community ledger.

This design avoids opening an inbound port and avoids sharing the resource credential. Glaze Plan mode must verify whether a reliable relay client and background behavior are feasible. If not, Glaze must propose the smallest secure alternative before building.

### Resource policy

The owner can define:

- Allowed communities.
- Allowed members or roles.
- Allowed capability or tool categories.
- Disallowed tools.
- Per-request token, duration, or estimated-cost limit.
- Per-member daily or monthly limit.
- Community-wide limit.
- Hours when the resource is available.
- Capacity reserved for the owner.
- Approval thresholds.
- Data classes the requester may provide.
- Whether results may be stored in community history.
- Immediate pause and revocation.

Natural-language policies are compiled into structured fields. The owner reviews the fields before activation.

### Fairness without settlement

The competition build does not transfer money.

The ledger shows:

- Resource owner.
- Requesting member.
- Community.
- Resource type.
- Start and completion time.
- Availability and execution duration.
- Provider-reported usage when available.
- Estimated monetary cost when reasonably measurable.
- Whether the resource was local compute or a paid provider.
- Approval decision.
- Outcome status.

Compute, money, time, and useful work remain separate contribution categories. The app must not claim an arbitrary exchange rate between them.

## Personal AI

The personal AI is the conversational front door to the app.

It should:

- Adapt explanations to the user's apparent fluency without patronizing them.
- Explain privacy and cost consequences before changing state.
- Convert natural language into draft policies, then ask for confirmation.
- Help users create or join a community.
- Explain why another presence moved closer without revealing a topic.
- Help compose a handshake introduction.
- Manage session modes through natural language.
- Explain which AI resource is being requested and who owns it.
- Surface failures in ordinary language.
- Avoid implying that it is a human, friend, therapist, or moral authority.
- Encourage relevant human connection without pressuring the user.

It must not:

- Publish or match private conversation content in Private mode.
- Reveal another user's topic, transcript, or identity beyond policy.
- Change permission or spending policies silently.
- Initiate a resource request with cost or external side effects without confirmation.
- Present estimated cost as exact when it is not exact.
- manipulate a user into accepting a connection.

## AI and Glaze Credits

- Glaze AI calls consume the credits of the person invoking the AI feature.
- Each user grants AI permission to the app independently.
- The app must explain this before the first intentional AI action, while allowing Glaze's native permission prompt to remain authoritative.
- Denying Glaze AI must not prevent browsing existing communities, managing policies, viewing the world, handshaking, or human chat.
- When credits are exhausted, the app shows a nonjudgmental explanation and keeps non-AI functions available.
- Calls routed to a community-owned Hermes resource are recorded separately from Glaze AI usage.
- The app must never imply that Glaze credits can be pooled or transferred.

## Capability Fabric

Folks should ultimately present one coherent capability fabric with two provider families:

### Glaze-native providers

- Glaze text generation for the personal companion, policy drafting, notes, translation, and workflow assistance.
- Glaze image generation for explicitly requested worldviews and visual artifacts.
- User-authorized Slack, Linear, GitHub, and custom OAuth integrations as optional sources of work and discussion context.

Each Glaze-native capability is authorized and paid for by the invoking user. An integration is never required for the basic Folks experience.

### Community-owned providers

- Hermes Agents.
- Local models.
- Home-server workflows.
- Provider-backed agents contributed by a member.
- Future bounded tools exposed through a reviewed adapter.

Each community-owned capability remains governed by its owner, including availability, allowed actions, approval thresholds, limits, and revocation.

### Unified capability contract

Both provider families should be represented through a shared internal capability contract containing:

- Provider family and capability type.
- Owner or authorizing user.
- Human-readable purpose.
- Input and output data classes.
- Permission and approval requirements.
- Cost source: invoking user's Glaze credits, local compute, or owner-funded provider.
- Availability and expected latency.
- Side-effect level.
- Retention policy.
- Audit and ledger behavior.

The contract must preserve provenance. Users should always know whether a result came from Glaze AI, a connected service, or another member's resource.

### Connected-source privacy

Slack messages, Linear issues, GitHub content, and other connected data remain private source material by default.

- Every source is individually opt-in.
- The user chooses which workspaces, projects, repositories, channels, or data classes may be read.
- Raw source content is never shown to another person through semantic presence.
- The user previews and approves any Selective signal derived from connected data.
- Open-mode matching may use only a short-lived privacy-minimized representation approved by the final privacy architecture.
- Revoking a connector removes its derived signals and cached representations.
- Connectors request the minimum practical read scopes.

The competition build should preserve this extension boundary without implementing direct Slack, Linear, GitHub, image-generation, or generic OAuth workflows.

## Voice

Voice is a desired interaction, not a single point of failure.

- Text input is always available.
- Microphone access is requested only when the user starts voice input.
- A visible recording state remains on screen for the full capture.
- Denial keeps text input functional.
- Plan mode should prefer native, on-device speech recognition where reliable.
- Streaming AI text can be spoken using a native voice if implementation is stable.
- The competition build does not require full-duplex, interruption-aware live voice.
- Live spoken translation is P2.

## Data and Privacy

### Local-only by default

- Private conversation history.
- Personal AI memories.
- Full profile details.
- Local preference and world configuration.
- Hermes endpoint URL and credential.
- Resource policy source text and local structured policy.
- Local notes not explicitly shared.
- Block list where possible.

### Relay-minimum data

- App-specific user identifier.
- Public or policy-approved profile fields.
- Presence mode.
- Ephemeral match representation in Open mode.
- Approved Selective signals.
- Handshake state.
- Shared-session messages.
- Community membership.
- Resource request envelope and minimal ledger metadata.

### Retention

- Open-mode semantic presence expires quickly.
- Handshake requests expire.
- Shared-session retention is visible and configurable.
- Users can delete local history.
- Communities can define shared-message retention.
- Resource request payloads are deleted after completion unless all relevant policies permit retention.
- Logs must avoid secrets and private conversation text.

### Security

- Secrets use macOS Keychain.
- Network transport is encrypted.
- Authorization is checked on every community, session, and resource request.
- Membership removal immediately revokes community access.
- Resource revocation prevents new work and cancels queued work when safe.
- The app never trusts client-supplied role or ownership claims without server verification.
- Report and block controls are available from every shared context.

## Core Data Entities

### UserProfile

- Stable app user ID.
- Display name or pseudonym.
- Optional introduction.
- Preferred language.
- Authorized profile visibility.
- Local worldview reference.
- Block and safety preferences.

### PresencePolicy

- Mode: Private, Selective, or Open.
- Allowed audience.
- Expiration.
- Availability.
- Language preferences.
- Structured rules compiled from natural language.

### Signal

- Owner.
- User-approved text.
- Semantic representation.
- Audience and community scope.
- Created and expiry time.
- Paused state.

### Presence

- Owner reference.
- Anonymous public identifier.
- Ephemeral semantic representation.
- Availability state.
- Last heartbeat.

### Handshake

- Initiator and recipient.
- Authorized introduction.
- State.
- Created, updated, and expiry time.
- Cooldown and block references.

### SharedSession

- Participants.
- Session AI mode.
- Retention policy.
- Language configuration.
- Message and event history.
- Active status.

### Community

- Name or private identifier.
- Creator and stewards.
- Membership policy.
- Member roles.
- Shared resources.
- Moderation settings.

### ResourceNode

- Owner.
- Type.
- Local secret reference.
- Availability.
- Capability description.
- Policy.
- Health status.

### ResourceRequest

- Requester.
- Resource.
- Community.
- Requested capability.
- Policy evaluation.
- Approval state.
- Execution state.
- Minimal result reference.

### LedgerEntry

- Contributor.
- Requester.
- Resource and community.
- Usage measurements.
- Cost estimate and confidence.
- Result status.

### Worldview

- Local theme identifier.
- Entity-to-visual mapping.
- Motion and sound preferences.
- Accessibility overrides.
- Optional generated asset references.

## Major Modules

### Personal Companion

Encapsulates Glaze AI conversation, streaming responses, AI permission states, credit failure handling, voice input, and natural-language commands.

### Consent Policy Engine

A deep module that converts natural-language intent into structured, reviewable privacy, session, and resource policies. It evaluates policy without requiring AI on every enforcement path.

### Presence and Matching

Creates ephemeral semantic signals, publishes the minimum allowed representation, receives nearby candidates, smooths proximity changes, and exposes a list alternative.

### Handshake Coordinator

Owns the connection state machine, expirations, rate limits, cooldowns, block behavior, introductions, and notifications.

### Shared Session

Manages human messages, session AI mode, consent indicators, AI attribution, translation state, retention, notes, and participant safety controls.

### Community Relay Adapter

Provides app identity, real-time presence, handshakes, communities, shared sessions, and resource-request delivery through an external service. This is the primary Glaze feasibility gate.

### Resource Router

Registers owner resources, checks availability, evaluates local owner policy, requests approval, calls Hermes, returns permitted results, and records minimal usage.

### Contribution Ledger

Presents transparent usage and contributions without performing settlement or equating unlike contribution types.

### World Renderer

Maps stable product entities and states into the default cosmic world and an accessible list view. Future generated worldviews replace rendering, not behavior.

### Local Persistence and Secrets

Stores private data locally, stores credentials in Keychain, manages deletion, and prevents sensitive values from entering logs.

## User Stories

1. As a complete beginner, I want the app to explain itself conversationally, so that I can begin without knowing AI terminology.
2. As a returning user, I want to skip onboarding and resume my last private state, so that the app respects my time.
3. As a user, I want text input to work without microphone permission, so that voice is optional.
4. As a user, I want to speak after explicitly enabling the microphone, so that conversation can feel natural.
5. As a user, I want a persistent recording indicator, so that I always know when audio is captured.
6. As a user, I want to deny Glaze AI permission while retaining non-AI features, so that consent is meaningful.
7. As a user, I want to know that my own Glaze credits pay for my Glaze AI requests, so that cost is understandable.
8. As a user, I want to choose Private mode, so that no current-conversation signal is used for discovery.
9. As a user, I want to declare a narrow interest in natural language, so that only a chosen subject can make me discoverable.
10. As a user, I want to review the structured interpretation of my sharing statement, so that AI cannot silently broaden it.
11. As a user, I want a selective signal to expire automatically, so that old interests do not follow me indefinitely.
12. As a user, I want Open mode to reveal only anonymous presence, so that I can feel less alone without exposing my thoughts.
13. As a user, I want an obvious Open-mode indicator, so that I do not forget I am discoverable.
14. As a user, I want to see relevant presences drift closer gradually, so that similarity feels alive without exposing exact scores.
15. As a user with reduced-motion needs, I want a stable list view, so that the app remains usable without animation.
16. As a user, I want to mute presence sounds, so that the app can remain quiet.
17. As a user, I want to select a nearby presence, so that I can decide whether to connect.
18. As a user, I want enough authorized profile context before accepting, so that I can make a safe decision.
19. As a user, I want to send a short reviewed introduction, so that contact has human context.
20. As a recipient, I want to connect now, so that we can begin talking immediately.
21. As a recipient, I want to stay nearby, so that I can preserve a promising connection without interrupting my current thought.
22. As a recipient, I want to say Not now, so that I can defer politely.
23. As a recipient, I want to decline without giving a reason, so that I retain social autonomy.
24. As a user, I want to block another person, so that they cannot appear or contact me again.
25. As a user, I want unanswered requests to expire, so that they do not become lingering obligations.
26. As a connected user, I want a human-only session, so that AI does not need to be present.
27. As a connected user, I want AI to take notes only after everyone consents, so that recording is not unilateral.
28. As a connected user, I want to invoke AI on demand, so that it helps without dominating the conversation.
29. As an AI owner, I want to control whether my personal AI can join, so that another person cannot summon it.
30. As an AI owner, I want my private AI memories withheld by default, so that assistance does not become disclosure.
31. As a participant, I want every AI message attributed to its owner and AI identity, so that the speaker is never ambiguous.
32. As a participant, I want to change session mode in natural language, so that control remains conversational.
33. As a participant, I want session controls visible, so that personalization never hides consent state.
34. As a participant, I want to leave immediately, so that no session traps me.
35. As a participant, I want to report harmful behavior, so that public discovery has a safety path.
36. As a user, I want to create a private community, so that trust has a defined boundary.
37. As a community steward, I want to invite members, so that membership is intentional.
38. As a steward, I want to remove a member and revoke access immediately, so that community boundaries are enforceable.
39. As a contributor, I want to connect my Hermes Agent, so that my community can benefit from capabilities I already operate.
40. As a contributor, I want my Hermes credential stored only in Keychain on my Mac, so that members never receive it.
41. As a contributor, I want my app to receive requests through an outbound connection, so that I do not expose an inbound server port.
42. As a contributor, I want to describe an access policy naturally, so that safe sharing does not require security expertise.
43. As a contributor, I want to review deterministic policy fields, so that enforcement does not depend on ambiguous AI interpretation.
44. As a contributor, I want to reserve capacity for myself, so that community generosity does not make my own resource unavailable.
45. As a contributor, I want expensive or long requests to require approval, so that one member cannot create uncontrolled cost.
46. As a contributor, I want native approval notifications, so that I can respond while the app is in the background.
47. As a contributor, I want to pause or revoke my resource instantly, so that contribution remains voluntary.
48. As a member, I want to see which capability I am requesting and who contributed it, so that shared AI is not an opaque pool.
49. As a member, I want to receive an understandable denial, so that policy enforcement does not feel arbitrary.
50. As a member, I want my request to fail gracefully when the contributor is offline, so that I know what to do next.
51. As a community member, I want to see contribution history, so that generosity and usage are visible.
52. As a community member, I want local compute and paid-provider costs labeled separately, so that the ledger does not create false equivalence.
53. As a community member, I want cost estimates labeled with confidence, so that uncertain accounting is honest.
54. As a privacy-conscious user, I want to delete my local conversation history, so that I control retention.
55. As a privacy-conscious user, I want shared-session retention explained before joining, so that I know what persists.
56. As a user without credits, I want to continue human conversations and manage communities, so that AI scarcity does not remove human access.
57. As a user whose network drops, I want the app to preserve unsent local text and reconnect safely, so that I do not lose my work.
58. As a user, I want a clear distinction between live people and Preview presences, so that the app never fakes community activity.
59. As a user, I want a polished default world, so that the product feels complete before I customize anything.
60. As a future user, I want to generate and share a worldview, so that the same social system can feel personally meaningful.

## Functional Acceptance Criteria

### Identity and multi-user

- Two separately installed copies can sign in as distinct users.
- Each user receives a stable app-specific identity.
- One user can block the other and the block survives restart.
- Authentication failure never reveals another user's data.

### Privacy modes

- Private mode emits no discoverability heartbeat or semantic representation.
- Selective mode publishes only an approved signal.
- Open mode publishes no raw transcript text.
- Switching to Private removes active discoverability promptly.
- Every mode is visible and keyboard accessible.

### Presence and handshake

- Two real users with a relevant match can see anonymous presence.
- Selecting a presence reveals only authorized profile fields.
- Every handshake outcome reaches both clients.
- Decline discloses no reason.
- Block prevents future matching and contact.
- The accessible list mirrors the same state as the visual world.

### Shared session

- Connected users can exchange text in real time.
- Human-only mode invokes no AI and records no notes.
- Quiet notes cannot activate without all participants consenting.
- On-demand AI clearly identifies the requester and spends that requester's Glaze credits.
- Removing an AI does not end the human conversation.
- Leaving ends that user's participation immediately.

### Resource sharing

- A contributor can register a Hermes endpoint and secret locally.
- The secret is absent from ordinary local data, logs, relay messages, and requesting clients.
- A request is denied when policy does not allow it.
- An approval-required request cannot execute before owner approval.
- Revocation prevents new execution.
- An unavailable contributor produces a clear retry-later state.
- A completed request creates one ledger entry without storing secret material.

### Degraded states

- AI permission denied: human and community features remain available.
- Glaze credits exhausted: AI actions explain the limitation; human chat remains.
- Microphone denied: text remains.
- Relay offline: private local conversation and settings remain.
- Hermes offline: the resource is visibly unavailable.
- Empty network: no fabricated live people appear.

## Testing Decisions

Tests should assert externally observable behavior and privacy invariants rather than internal implementation details.

### Consent Policy Engine

- Natural-language policy compiles to a reviewable structure.
- No compiled policy activates before confirmation.
- Deterministic evaluation allows and denies the expected request matrix.
- Revocation overrides previously granted access.

### Handshake Coordinator

- Every legal transition.
- Repeated and out-of-order events.
- Expiry, cooldown, block, and reconnect behavior.
- No private introduction content appears without authorization.

### Shared Session

- AI-disabled and AI-enabled modes.
- All-participant consent for notes.
- Owner control over personal AI.
- Message attribution and retention behavior.

### Resource Router

- Local credential isolation.
- Approval thresholds.
- Offline and timeout behavior.
- Cancellation and revocation races.
- Ledger metadata minimization.

### End-to-end scenarios

- Two real users match, handshake, and chat.
- One user contributes Hermes; another completes one permitted request.
- Contributor denies a request.
- User exhausts Glaze credits but continues human chat.
- User switches Open to Private and disappears from matching.
- User blocks another and remains protected after restart.

## Visual and Interaction Direction

### Default world

- Full-window, unframed living field rather than a dashboard of cards.
- The user's personal AI is a central responsive sphere with a clear functional role.
- Human presences are distinct planetary bodies, each representing a real or explicitly labeled Preview user.
- Distance communicates semantic relevance.
- Motion is slow, legible, and optional.
- The primary conversation composer remains reachable without covering the world.
- Privacy mode is a prominent segmented control, not a hidden preference.
- Handshakes use a focused sheet or side panel with clear outcomes.
- Communities and resources become navigable destinations in the same world model.

### Validated prototype recommendation

- Use Living Orbit as the primary product composition.
- Use Mission Control's inspector treatment when a user opens resource, policy, approval, or ledger details.
- Use Quiet Field's restraint for onboarding, private thinking, and reduced-stimulation states.
- These are visual states of one app, not separate products.
- The browser prototype is a behavior and composition reference only; the functional app should use Glaze-native macOS patterns.

### Palette

Avoid a one-note dark-blue or purple space aesthetic.

- Near black: `#111315`
- Warm white: `#F5F1E8`
- Mineral teal: `#3AAFA1`
- Coral: `#F26B5E`
- Saffron: `#E5B94B`
- Moss: `#789262`
- Cool gray: `#A7ADB4`

Each nearby presence may use a controlled combination from the palette. Text contrast must remain accessible.

### Typography

- Native-feeling sans serif for interface and conversation.
- A restrained display face only for the working brand and Store presentation.
- No viewport-scaled font sizes.
- Letter spacing remains zero.

### Sound

- Sparse, soft cues for presence arrival, incoming handshake, acceptance, and resource completion.
- No continuous ambient audio by default.
- Master sound toggle.
- Respect macOS reduced-motion and accessibility settings.

### Generated worldviews

Worldview generation is not part of P0. The architecture should nevertheless keep semantic entities separate from rendering so later themes can reinterpret:

- Self.
- Personal AI.
- Nearby person.
- Community.
- Shared resource.
- Connection.
- Availability.
- Trust or permission state.

## Brand Direction

### Product name

Folks

Why it fits:

- It puts people ahead of models, infrastructure, and visual metaphor.
- It feels warm and playful without becoming childish.
- It supports the social and resource-sharing halves equally.
- It remains flexible when generated worldviews eventually move beyond the cosmic default.

The name requires final Store and trademark availability review before publication.

### Tagline

Find your people. Share your power.

The line is under Glaze's 40-character Store tagline limit.

### Voice

- Calm.
- Curious.
- Human.
- Precise about consent.
- Optimistic without utopian promises.
- Never corporate, mystical, or infantilizing.

### Icon concept

Two unequal planetary forms entering a shared orbit around a small point of light. The icon should remain legible at macOS Dock size and avoid looking like a generic astronomy app.

## Competition Criteria Strategy

### Design and Aesthetics

- A full-window living universe with meaningful motion.
- Clear transitions from private sphere to nearby presence to shared orbit.
- Strong sound and reduced-motion alternatives.
- Store screenshots that show state change rather than static decoration.

### App Utility

- Real human matching and communication.
- Explicit privacy controls.
- One real owner-controlled AI resource request.
- Transparent usage and contribution history.

### Creativity

- Semantic proximity without public posts or exposed topics.
- AI as connective tissue rather than social substitute.
- Natural-language policy compiled into deterministic consent.
- Shared personal AIs under owner sovereignty.
- Community AI resources without credential sharing.

### Branding and Presentation

- One clear emotional story.
- Folks name and human-centered tagline.
- Distinct visual language.
- Six purposeful 16:9 screenshots and a concise demonstration.

### Community Traction

- Invite flow is part of the core loop.
- Every successful handshake can create a durable connection or community.
- Contributors have a reason to invite trusted members.
- Early testing should include at least three real Glaze users and one Hermes contributor.
- Store feedback should be requested immediately after publication and incorporated into one focused update if time permits.

### Tie-break: Originality and Execution

The submission should prefer a flawless two-person flow over superficial implementations of payments, public discovery, generated worlds, and distributed compute.

## Sixty-Second Demonstration Storyboard

This storyboard is useful even if the official submission format differs.

### 0-8 seconds

A user privately asks the personal AI about making local AI useful to nontechnical friends. Private mode is visibly active.

### 8-15 seconds

The user says, "Let people interested in safe community AI notice me." The app previews a Selective signal. The user confirms.

### 15-23 seconds

The universe opens. A distant human presence moves closer with a subtle sound. No topic or transcript appears.

### 23-31 seconds

The user sends a short handshake. A second real user accepts. Their bodies enter a shared orbit.

### 31-39 seconds

The shared session opens in Human only mode. One participant says, "Bring my AI in on demand." The state changes visibly.

### 39-52 seconds

The participant requests a bounded task from the other's contributed Hermes Agent. The owner policy allows it. The result streams back.

### 52-58 seconds

The contribution ledger shows: served by the contributor's Mac, provider or local-compute label, estimated cost if available, and no credential shared.

### 58-60 seconds

Folks. Find your people. Share your power.

## Store Listing Draft

### Name

Folks

### Tagline

Find your people. Share your power.

### Description

Folks turns private AI conversations into meaningful human connection.

Think privately with your own AI, then choose whether to remain invisible, share one specific interest, or become anonymously discoverable. Other people exploring related ideas appear nearby without exposing anyone's prompts or transcripts. Exchange a mutual handshake, open a shared conversation, and decide exactly how AI may participate.

Trusted communities can also contribute AI resources under clear owner-controlled policies. Members can request help without receiving another person's credentials, while the community sees an honest record of contributions and estimated usage.

Private by default. Human connection by consent. Shared capability without giving away the keys.

Uses Glaze AI. Each person's Glaze AI usage draws from their own Glaze credits.

### Screenshot sequence

1. Private conversation with the central personal AI and Private mode visible.
2. Selective signal preview showing natural-language consent becoming a clear rule.
3. Full universe with anonymous relevant presences moving closer.
4. Handshake sheet with Connect now, Stay nearby, Not now, and Decline.
5. Shared human conversation with AI mode controls.
6. Hermes resource request and contribution ledger.

## Glaze-Specific Feasibility Findings

Confirmed by current official documentation:

- Glaze builds real local-first Mac apps.
- Apps can request microphone access through macOS.
- Apps can store data locally and secrets in macOS Keychain.
- Apps can use deep links and custom URL schemes.
- Apps can connect to external APIs and OAuth services.
- Glaze AI supports text generation, streaming text, image understanding, and image generation.
- Each installed user grants AI permission per app and spends their own Glaze credits.
- AI-denied and credit-exhausted states must degrade gracefully.
- Published AI-powered apps display a Uses Glaze AI label.
- Store listings require one to six 16:9 screenshots.
- Glaze works best when substantial builds begin in Plan mode and proceed through focused increments.

Not confirmed in the public manual:

- Built-in app access to a Glaze user's account identity.
- Built-in multi-user authentication for published apps.
- Built-in real-time shared database, presence, or chat.
- Built-in hosted backend deployment.
- A turnkey speech-to-speech API for installed apps.
- Safe cross-device routing to a contributor's private local service.

These unconfirmed capabilities must be resolved in Glaze Plan mode. The app should expect to connect to a minimal external identity and real-time relay rather than assume Glaze provides one.

## Implementation Decisions

- Build one Glaze app, not separate social and resource-sharing entries.
- Use the default cosmic world as the only P0 renderer.
- Keep the prototype and product data models renderer-independent.
- Make text the guaranteed input; treat voice as enhancement.
- Use Glaze AI for the personal companion and semantic assistance.
- Never claim Glaze credits are pooled.
- Use a minimal external service for identity, presence, handshakes, chat, and relay only if Glaze confirms this can be integrated and published safely.
- Keep personal data and resource secrets local whenever possible.
- Use Hermes Agent's OpenAI-compatible API as the first owner-contributed resource.
- Route requests through the contributor's running app so the resource secret remains local.
- Keep real payments out of the submission.
- Keep generated worldviews, live spoken translation, public community scale, and external platform bridges out of P0.
- Include an explicitly labeled Preview world so judges can experience the visual flow when few real users are online, while preserving a real two-user path.

## Out of Scope

- Production-scale social network operations.
- Hundreds of simultaneous handshake requests.
- Child safety systems.
- Financial custody, pooled wallets, invoicing, or payment settlement.
- Automatic subscription-cost allocation.
- Legal claims about fair compensation.
- Automatic secure-tunnel configuration.
- Exposing home-server ports automatically.
- Sharing raw provider credentials.
- Full distributed inference.
- Voice cloning or impersonation.
- Autonomous calls that represent a user to a government or company.
- Automated creation of financial accounts or cards.
- Unreviewed high-impact actions.
- Mobile, Windows, Linux, or browser clients.
- A marketplace for generated themes.

## Blocking Plan-Mode Questions

Glaze should answer these before code is written:

1. What external identity and real-time relay approach can a published Glaze app use safely within the contest window?
2. Can the app maintain an outbound real-time connection while open and receive native notifications when backgrounded?
3. Can two published app installations exchange real-time text through that relay?
4. Can the contributor app receive a job, call a Keychain-protected local Hermes endpoint, and return the result without disclosing the secret?
5. What is the simplest reliable macOS speech-to-text and speech-output approach available to a Glaze app?
6. Can semantic representations be created without retaining or publishing raw private conversation text?
7. Which P0 items should be deferred if the relay or background execution cannot be implemented reliably?

## Final Readiness Gate

The app is ready to submit only when:

- Two real users can complete the matching and handshake flow.
- Private mode has been inspected for network leakage.
- Human-only chat functions without Glaze AI.
- The Hermes resource credential remains exclusively on the owner's Mac.
- One permitted and one denied resource request have been tested.
- Every permission denial has a functional fallback.
- The default world remains usable with reduced motion and keyboard navigation.
- No Preview presence is presented as a live human.
- The Store listing discloses AI, network, and permission requirements.
- Six screenshots tell the product story in order.
- The build passes Glaze review with no unresolved errors.

## Sources

- [Glaze Awards](https://www.glaze.app/awards)
- [Glaze Awards Terms](https://www.glaze.app/awards/terms)
- [Glaze Changelog](https://www.glaze.app/changelog)
- [What Glaze Can Build](https://manual.glaze.app/basics/what-glaze-can-build)
- [Glaze AI](https://manual.glaze.app/capabilities/ai)
- [Device Access](https://manual.glaze.app/capabilities/device-access)
- [Files and Data](https://manual.glaze.app/capabilities/files-and-data)
- [System Integration](https://manual.glaze.app/capabilities/system-integration)
- [Custom OAuth](https://manual.glaze.app/integrations/custom-oauth)
- [Model Context Protocol](https://manual.glaze.app/integrations/model-context-protocol)
- [Publishing Apps](https://manual.glaze.app/share/publish-apps)
- [Use Credits Efficiently](https://manual.glaze.app/account/use-credits-efficiently)
- [Hermes Agent](https://github.com/NousResearch/hermes-agent)
- [Hermes Agent API Server](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md)
