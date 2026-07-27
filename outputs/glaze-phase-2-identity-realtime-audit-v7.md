# Folks Phase 2 Identity and Realtime Audit v7

Date: 2026-07-24

Glaze commit reviewed:
`b48ecc52a3c81dda3bb1dcab8fee7b6f6f34fb9a`

## Verdict

The identity, community, presence, and mutual-handshake slice is implemented,
but it is not approved for shared-text work yet.

Build and type-check pass. The running app's Connect panel opens and correctly
reports that community features are offline while the relay is unconfigured.
Four corrections are required before a live two-user test.

## Findings

### P1: Identity changes can retain the previous user's community data

Community query keys do not include the current user id. Signing out only
invalidates identity and communities; it does not clear members, presence,
handshakes, the pending-handshake set, the persisted active community, or the
backend realtime watch.

The next anonymous or protected identity can therefore see cached rows from the
previous identity and can continue with a community id that it does not belong
to. The backend may also retain a realtime channel authenticated with the old
session.

Relevant code:

- `renderer/lib/use-community.ts:34`
- `renderer/components/community/identity-section.tsx:34`
- `renderer/components/community/identity-section.tsx:76`
- `renderer/main/home-view.tsx:32`
- `main/services/identity.ts:111`
- `main/services/realtime.ts:20`

### P1: First launch can permanently miss presence and realtime

`HomeView` starts realtime and presence publication when Supabase is configured,
not when `ensureIdentity()` has resolved a user. With a persisted active
community and no restored session, these calls can run unauthenticated.

`watchCommunity()` sets `watchedCommunityId` before the channel reaches
`SUBSCRIBED` and only logs failure states. A failed first attempt therefore
looks active and will not retry after anonymous sign-in completes.

Relevant code:

- `renderer/main/home-view.tsx:29`
- `renderer/main/home-view.tsx:34`
- `renderer/lib/use-community.ts:104`
- `renderer/lib/use-community.ts:137`
- `main/services/realtime.ts:31`
- `main/services/realtime.ts:57`

### P1: Expiry correctness depends on optional pg_cron

`listPresence()` does not exclude rows whose `expires_at` is in the past.
`folks_cleanup()` removes them, but its schedule is only installed when
`pg_cron` already exists.

More importantly, an expired `outgoing` handshake remains covered by the
partial unique index until cleanup changes its state. Without `pg_cron`, that
stale row can indefinitely block a new handshake for the pair, and a late
recipient can still respond to it.

Relevant code:

- `main/services/community.ts:169`
- `main/db/schema.sql:133`
- `main/db/schema.sql:672`
- `main/db/schema.sql:707`
- `main/db/schema.sql:1074`
- `main/db/schema.sql:1306`

### P2: Lint is order-dependent and package metadata is stale

After a successful `npm run build`, `npm run lint` scans `.build/main/index.js`
and fails with 220 generated-code errors. Glaze's default lint config ignores
`build/**` but not `.build/**`.

Also, `package.json` still describes the old START-HERE project and its icon
concept, not Folks.

## Paste-Ready Glaze Amendment

The mutual-handshake checkpoint is promising, but it is not approved for
shared-text work yet. Keep the current scope and correct these identity,
realtime, expiry, and validation defects. Stop again after the corrections.

1. Make all community state identity-scoped. Do not start communities,
   presence, handshakes, or realtime until `ensureIdentity()` has resolved a
   non-null user id. Include that user id in every user-scoped React Query key,
   or equivalently cancel and remove all community/member/presence/handshake
   queries whenever the uid changes. On an actual uid change, reset the pending
   handshake seen-set and clear the device-local `activeCommunityId` unless it
   is revalidated against the new user's fetched memberships. There must be no
   frame in which user B sees user A's cached people or handshakes.
2. Make sign-out ordered. While the old session is still active, best-effort
   clear its presence for the active community and stop its realtime channel.
   Then sign out, clear identity-scoped renderer state, and allow creation or
   recovery of the next identity. Protecting the same anonymous uid must not
   discard its community.
3. Make realtime lifecycle truthful and retryable. Do not mark a community
   watched until the channel reports `SUBSCRIBED`. On `CHANNEL_ERROR`,
   `TIMED_OUT`, or `CLOSED`, clear the stored channel/community state and allow
   retry. Guard asynchronous watch/unwatch calls against stale cleanup removing
   a newer channel. Restart the subscription when the authenticated uid/session
   changes. Do not silently swallow the initial watch failure.
4. Make expiry correct without assuming `pg_cron`. At minimum, exclude expired
   presence rows in the authoritative read. For handshakes, make
   `send_handshake` lazily mark an expired outgoing offer for that unordered
   pair as `expired` before the active-uniqueness insert, and make
   `respond_handshake` reject and expire an offer whose deadline has passed.
   Keep `pg_cron` as background cleanup, not a correctness dependency. Add SQL
   tests proving an expired offer no longer blocks a new one and cannot be
   accepted late.
5. Add a project-local ESLint configuration that preserves the Glaze framework
   rules while ignoring `.build/**`. Prove the sequential order
   `npm run build`, then `npm run lint`, then `npm run type-check` passes.
6. Replace the stale START-HERE `description` and `iconDescription` in
   `package.json` with accurate Folks metadata.

Preserve the tested SECURITY DEFINER/RLS model and keep Supabase credentials in
the backend. Do not begin shared-text sessions, Hermes/ledger work, or hosted
production configuration. Report the exact files changed and tests run. I will
then reset local Supabase, rerun the schema and SQL suite, and exercise the
two-user path against a local relay.
