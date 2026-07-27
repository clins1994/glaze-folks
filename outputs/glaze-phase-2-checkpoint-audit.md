# Folks Phase 2 Checkpoint Audit

Reviewed Glaze commit: `815323e`

Reviewed checkpoint:

- Privacy-language correction
- Supabase client and encrypted session storage
- Anonymous-first identity and email protection
- `main/db/schema.sql`

## Verdict

**PAUSE before renderer identity/realtime wiring.**

The privacy correction is accurate, and the TypeScript implementation builds,
lints, and type-checks. The SQL foundation has several plan-conformance and
authorization issues that should be corrected before it is applied to a real
Supabase project. Fixing them now is cheaper than migrating live data or
rewiring renderer flows around incorrect lifecycle behavior.

## Verified

- North now distinguishes local transcript storage from hosted Glaze AI
  processing.
- `@supabase/supabase-js@2.45.0` is pinned.
- Supabase initialization is lazy and disabled until both public configuration
  values exist.
- Auth tokens use a `safeStorage`-backed adapter.
- Anonymous sign-in and anonymous-to-email identity linking follow the supported
  Supabase flow.
- No service-role key is present.
- Every table has RLS enabled.
- Sensitive functions pin an empty `search_path`.
- `npm run build`, `npm run lint`, and `npm run type-check` pass.

## Blocking Corrections

### 1. Make ledger retention structurally compatible with deletion

`ledger_entries.community_id`, `resource_id`, and `request_id` currently use
`ON DELETE CASCADE`. `delete_my_data()` deletes owned resources, and
`dissolve_community()` deletes the community. Those cascades reach immutable
ledger rows, whose `BEFORE DELETE` trigger raises.

The result is internally contradictory: deletion either fails because of the
immutability trigger or, if that guard were absent/bypassed, deletes records
promised to be immutable.

Use an append-only design in which retained ledger rows do not cascade from
mutable/deletable parents. Suitable approaches include immutable UUID snapshots
without foreign-key delete actions, or retained/tombstoned parent records.
Whichever design is chosen must satisfy all three cases:

1. A resource owner with historical ledger entries can delete their data.
2. A community with historical ledger entries can be dissolved.
3. No operation updates or deletes a `ledger_entries` row.

### 2. Complete account-deletion semantics

`delete_my_data()` does not currently perform all behavior required by the
approved plan:

- pending requests submitted by the caller remain;
- session participation is not marked `departed`;
- handshake rows remain;
- the `public.users` profile row remains;
- deleting owned resources collides with immutable ledger history.

Correct the function atomically. Preserve counterparty messages and immutable
ledger history, remove the caller's message content, de-identify the caller's
ledger-party mappings, and ensure the caller can no longer participate in live
sessions after deletion.

Also use honest product language: this RPC deletes/de-identifies Folks data. It
does not delete the Supabase Auth identity unless an explicit, tested Auth-user
deletion mechanism is added.

### 3. Restrict function execution explicitly

PostgreSQL grants new functions to `PUBLIC` by default, and Supabase projects may
also have permissive default grants. The schema currently adds:

```sql
grant execute on all functions in schema public to authenticated;
```

This exposes helper, trigger, and maintenance functions as RPCs and lets every
authenticated user call `folks_cleanup()`.

Revoke function execution from `PUBLIC` and `anon`, remove the broad
`ALL FUNCTIONS` grant, and explicitly grant only the intended client RPCs to
`authenticated`. Put RLS helpers, trigger functions, and maintenance functions
in a non-exposed private schema where practical. Ensure cleanup runs under a
controlled owner/cron role, not an arbitrary client.

Implement the plan's dedicated least-privilege function owner, or amend the plan
and document the actual owner and its privileges.

### 4. Enforce actual state and participation rules

The request trigger only prevents transitions out of four terminal states; it
does not enforce the legal transition graph it claims to enforce. The handshake
trigger likewise allows illegal reversions such as `connected -> outgoing`.

Implement explicit allowed-transition matrices in both triggers and retain the
function-level checks.

`is_session_participant()` ignores participant status. A user marked
`departed` can still post messages, change the session AI mode, and read through
the same helper. Separate historical read membership from active write
participation, and require `status = 'active'` for every session mutation.

### 5. Preserve counterparty ledger visibility after de-identification

`ledger_entries_select` lets either party read an entry, but
`ledger_parties_select` lets a user read only their own mapping. The remaining
counterparty therefore cannot read the departed party's tombstone pseudonym,
contradicting the plan's promise that they retain an accurate, de-identified
record.

Allow a party who may read a ledger entry to read the two opaque party mappings
for that entry, without exposing mappings to unrelated users.

### 6. Fix the ledger-party guard

The guard says mappings may move only toward `NULL`, but its condition permits
`NULL -> arbitrary user_id` and permits unrestricted pseudonym changes.

Reject every `user_id` change except `existing user_id -> NULL`. Restrict the
tombstone pseudonym update to that same de-identification transition.

## Required Hardening Before Live P0

- Populate `public.users` deterministically for both new and existing Auth
  identities; otherwise profiles and display names have no bootstrap path.
- Add input and payload bounds for names, signals, intros, messages, errors,
  invitation codes, JSON jobs/results/usage, TTLs, and invitation use counts.
- Replace the handshake check-then-insert race with a database uniqueness or
  locking invariant for an active unordered pair. Add the promised cooldown or
  rate limit.
- Implement invitation-attempt throttling, or remove the plan's claim that
  acceptance is rate-limited and mark it as a known limitation.
- Add indexes for foreign keys and columns used by RLS/helper predicates.
- Make Realtime publication and `pg_cron` setup executable migration/setup
  steps rather than comments. If they remain manual, add exact idempotent SQL
  and verification queries.
- Add a protected-user email OTP sign-in/recovery path, not only identity
  protection and sign-out.
- Validate IPC inputs before passing them to Auth or database services.
- Change the `secrets.ts` comment: Hermes credentials are never relayed or
  stored remotely, but they are used locally to authenticate network requests
  to the owner-configured Hermes endpoint.

## Acceptance Tests For The Revision

1. `PUBLIC` and `anon` cannot execute any Folks RPC.
2. `authenticated` can execute only the intended public RPC list.
3. An authenticated client cannot call cleanup or trigger/helper functions as
   exposed RPCs.
4. Deleting a user who owns a resource with completed and denied ledger entries
   succeeds without writing to or deleting any ledger entry.
5. Dissolving a community with ledger history succeeds under the chosen
   retention design without mutating ledger entries.
6. The departing user's identity mapping becomes a tombstone; the counterparty
   can still read both the entry and the tombstone, while unrelated users cannot.
7. A departed session participant cannot post or change AI mode.
8. Illegal request and handshake transitions fail at the trigger layer even
   when attempted by the function owner.
9. Concurrent handshake creation for the same unordered pair yields one active
   handshake.
10. Concurrent single-use invitation acceptance yields one winner, and
    repeated invalid attempts are bounded.
11. Oversized text/JSON and unreasonable TTL/use-count inputs are rejected.
12. New and returning protected users receive the expected `public.users`
    profile and can recover the same `auth.uid()`.

## Paste-Ready Glaze Instruction

```text
Pause before renderer identity UI and realtime wiring. The privacy correction is
approved, and build/lint/type-check pass, but the Phase 2 SQL needs one
security/lifecycle revision before it is applied to Supabase.

Revise main/db/schema.sql and the plan in place:

1. Make ledger retention structurally compatible with deletion. ledger_entries
currently has ON DELETE CASCADE foreign keys to communities, resources, and
resource_requests, while an immutable BEFORE DELETE trigger forbids those
cascades. Choose an append-only design using non-cascading immutable identifier
snapshots or retained/tombstoned parents. Prove that delete_my_data and
dissolve_community both succeed with historical ledger entries while performing
zero UPDATE/DELETE operations on ledger_entries.

2. Complete delete_my_data atomically: remove the caller's presence/signals,
pending submitted requests and owned resource metadata; mark session
participation departed; remove obsolete handshakes/memberships/profile data;
delete only the caller's message content with contentless ordering tombstones
where needed; and de-identify ledger_parties without touching ledger_entries.
Describe this honestly as Folks-data deletion unless actual Supabase Auth-user
deletion is implemented and tested.

3. Remove `grant execute on all functions in schema public to authenticated`.
Revoke EXECUTE from PUBLIC and anon, then explicitly grant authenticated only
the intended client RPCs. Helpers, triggers, and folks_cleanup must not be
callable as public client RPCs; place them in a non-exposed private schema where
practical. Cleanup must run only through a controlled cron/owner role. Implement
the plan's dedicated least-privilege function owner or document and justify the
actual owner.

4. Implement full legal-transition matrices in the handshake and resource
request triggers. Separate historical session-read membership from active
session participation; departed users must not post or change AI mode.

5. Fix ledger visibility so either party to a readable entry can resolve both
opaque party rows, including a departed user's tombstone, without exposing
mappings to unrelated users.

6. Fix trg_ledger_parties_guard: permit only existing non-null user_id -> NULL,
never NULL -> user_id or one user -> another, and permit the tombstone pseudonym
change only during de-identification.

7. Before live P0, add profile bootstrap, bounded input/JSON/TTL constraints,
race-safe active-handshake uniqueness plus the promised rate/cooldown control,
invitation-attempt throttling (or explicitly remove that claim), RLS/FK indexes,
an email OTP sign-in/recovery path for protected users, IPC validation, and
executable/idempotent Realtime + pg_cron setup with verification queries.

8. Correct the secrets comment: Hermes URL/key never go to Supabase, a Folks
community, or another member, but the owner process uses them locally for
requests to the configured Hermes endpoint.

Add focused SQL tests for function privileges, trigger-level illegal
transitions, concurrent handshake/invitation behavior, deletion and dissolution
with retained ledger history, counterparty tombstone visibility, departed-user
write denial, and size/TTL bounds.

After revising, stop at a checkpoint. Report the exact schema ownership/grant
model, deletion behavior, ledger FK/retention design, migration/setup commands,
and test results. Do not apply the schema to a live project and do not continue
renderer/realtime wiring yet.
```

