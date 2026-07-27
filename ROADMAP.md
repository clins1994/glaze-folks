# Folks Roadmap

Folks begins with a small idea: while you think out loud with AI, you may
discover that another person is exploring the same topic at the same moment.
The private conversation is never shown to that person. A connection happens
only when both people choose it, and the resulting room is temporary.

This roadmap is directional rather than a promise of dates. Priorities may
change as people use the app and teach us what is useful, confusing, or unsafe.

## Product Principles

- Private by default: Folks does not store conversation history or reveal a
  transcript to another user.
- Share the minimum: matching uses short AI-derived topic labels, not messages.
- Mutual consent: both people must accept before a room opens.
- Ephemeral by design: topics, matches, and rooms expire after inactivity.
- Human connection over engagement: no feed, follower count, streak, or
  permanent social graph.
- Earn complexity: broader community and resource-sharing features should
  follow evidence that the simple experience is valuable.

## Available In The Current Build

- Private conversation powered by the user's Glaze AI credits.
- One to three specific English topic labels derived from meaningful turns.
- Global topic discovery without exposing another person's conversation.
- Conservative exact and fuzzy topic matching with generic-topic suppression.
- Realtime notices when another active person is discussing a similar topic.
- `Connect` and `Not now` choices, followed by mutual acceptance.
- Temporary one-to-one human rooms with a visible inactivity countdown.
- Ten-minute inactivity expiry that refreshes while a topic or room is active.
- Per-install anonymous identity with no account or recovery interface.
- No profiles, friends list, feed, or chat history.
- Supabase Row Level Security and recipient-scoped match records.
- An in-app Settings roadmap.

## High Priority

### Stabilize The Core Experience

- Learn from real Store installs and two-person sessions.
- Improve reconnect behavior when a Mac sleeps, changes networks, or reopens
  Folks.
- Add native background notifications without leaking topic details.
- Tune topic confidence, generic-topic suppression, and fuzzy-match thresholds.
- Make expiry, cleanup, failure, and retry states consistently understandable.
- Expand accessibility, keyboard navigation, and reduced-motion support.
- Add practical abuse prevention, blocking, reporting, and rate limits before
  opening discovery to a larger audience.

### Multilingual Discovery

- Replace English-only matching with language-agnostic semantic embeddings.
- Evaluate `pgvector` with a server-side embedding provider that never receives
  the full private transcript.
- Start with English, Japanese, Spanish, German, Portuguese, and Russian, then
  expand based on model quality rather than a nominal language list.
- Build a cross-language evaluation set so equivalent ideas match while merely
  adjacent or generic ideas do not.
- Display topic labels in each person's language.
- Add optional translation inside temporary rooms with clear disclosure.

## Planned

### Optional Identity Continuity

- Let a user optionally protect an anonymous identity with an email address.
- Support recovery on a new Mac through Supabase Auth and Resend.
- Keep account creation unnecessary for discovery and temporary conversations.
- Explain clearly that identity recovery does not create a profile, friends
  list, or retained chat history.

### Richer Temporary Conversations

- Optional AI participation during a room: human-only, quiet notes, or
  on-demand assistance.
- User-controlled summaries that can be exported before a room disappears.
- Voice conversation and live translation when reliability, cost, and privacy
  are good enough.
- Carefully scoped small-group rooms after one-to-one safety and moderation are
  proven.

### Better Discovery Controls

- Natural-language preferences such as "tell me when someone is discussing
  this, but do not interrupt me now."
- Topic-level availability and notification controls.
- Better ways to defer a connection politely without creating a permanent
  inbox.
- Optional generated visual themes that do not change the privacy model or
  obscure the core workflow.

## Future Exploration

### Trusted Communities And Shared AI Resources

The original Folks vision goes beyond meeting someone for a temporary
conversation. Trusted communities could eventually contribute capabilities
they already operate, including local models, provider-backed agents, home
servers, or Hermes Agents.

This work will begin only after the discovery product is useful on its own. It
requires a separate security and fairness model:

- Owner-controlled policies for who may use a contributed resource and how.
- Credentials that remain on the owner's device or isolated server.
- Explicit allow, deny, approval, budget, and revocation controls.
- Transparent usage and contribution accounting before any payment system.
- Community governance for spending or policy changes.
- Safe integrations with tools such as Slack, Linear, and GitHub.
- Guided setup for beginners without exposing a personal Mac or home server.

Payments, pooled subscriptions, autonomous spending, and resource marketplaces
are research topics, not commitments.

## Intentionally Not Planned For The Core

- Permanent public profiles or follower counts.
- A friends list or retained direct-message history.
- A content feed optimized for time spent in the app.
- Storing private AI transcripts in the Folks relay.
- Automatically exposing local machines, provider keys, or agent credentials.

## How To Follow The Work

The in-app roadmap stays intentionally compact. This file is the fuller source
of truth for direction and sequencing. Concrete implementation work can be
tracked in GitHub Issues as each phase becomes ready to build.
