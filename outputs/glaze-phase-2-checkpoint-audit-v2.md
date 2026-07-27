# Folks Phase 2 Checkpoint Audit v2

Reviewed Glaze commit: `4a8c26c`

## Verdict

**PAUSE for one narrow SQL follow-up before Supabase provisioning or renderer
wiring.**

The revision fixes the major ledger, deletion, grant, session-participation, and
state-machine problems from the first checkpoint audit. The app independently
builds, lints, and type-checks.

Four implementation gaps remain. Three can break or bypass the intended live
behavior, and one leaves the implemented retention behavior inconsistent with
the approved plan.

## Confirmed Fixed

- `ledger_entries` no longer cascade from communities, resources, or requests.
- Ledger entries are immutable and identity removal occurs through
  `ledger_parties`.
- Counterparties can resolve both opaque ledger-party rows.
- Public client RPC grants are enumerated; helpers and maintenance functions
  moved to `folks_private`.
- Session reads and active session writes use separate predicates.
- Handshake and request transition triggers now contain explicit transition
  matrices.
- `delete_my_data()` is accurately described as Folks-data deletion rather than
  Supabase Auth-user deletion.
- Profile bootstrap, protected-user recovery methods, IPC validation, input
  bounds, indexes, Realtime setup, and optional cron setup were added.
- TypeScript build, lint, and type-check pass independently.

## Remaining Blockers

### 1. `folks_definer` lacks access to its private schema

`folks_private` is created by the admin role and remains admin-owned. The script
reassigns private functions and `invitation_attempts` to `folks_definer`, but
never transfers the schema or grants that role `USAGE`.

PostgreSQL requires a role to own a schema or hold `USAGE` before it can access
objects inside that schema. Public `SECURITY DEFINER` functions run as
`folks_definer` and call `folks_private.*`, so the first real RPC can fail with
`permission denied for schema folks_private`.

Transfer `folks_private` ownership to `folks_definer`, or explicitly grant it
`USAGE`. Also explicitly grant/verify the role's required access to the
`extensions` schema and the exact pgcrypto functions it calls.

Add verification assertions:

```sql
select has_schema_privilege('folks_definer', 'folks_private', 'usage');
select has_schema_privilege('folks_definer', 'extensions', 'usage');
```

Then execute at least one public RPC that calls each private dependency while
running as `authenticated`.

### 2. Invitation throttling rolls itself back

`accept_invitation()` inserts an attempt row, then raises exceptions for malformed
or invalid codes. A propagated PostgreSQL function error aborts the function
transaction, including the attempt insert. Failed attempts therefore leave no
record, so repeated invalid attempts are not throttled.

Implement a transactionally real limiter. Recommended:

- use a per-user time bucket/counter row locked with `FOR UPDATE`; and
- return a structured generic failure for expected invalid/rate-limited outcomes
  rather than raising, so the limiter update commits.

Do not distinguish unknown invitation IDs from wrong secrets. Add a test that
submits invalid codes repeatedly in separate transactions and proves the limit
persists and activates.

If robust throttling is intentionally deferred, remove the implemented/rate-
limited claim from the plan and UI and record the limitation explicitly.

### 3. Handshake uniqueness is directional, not pairwise

The unique index uses:

```sql
(community_id, initiator_id, recipient_id)
```

This prevents duplicate `A -> B` rows but permits a concurrent `B -> A` live
handshake. The acceptance requirement was one live handshake for the same
**unordered pair**.

Use a unique expression index based on:

```sql
community_id,
least(initiator_id, recipient_id),
greatest(initiator_id, recipient_id)
```

Apply the same unordered-pair logic to cooldown checks. Extend the test so B's
reverse request is rejected while A's request is live.

### 4. Retention claims are still not implemented

The approved plan says resource job/result payloads are deleted after completion
unless retention is selected, and session-message retention is visible and
configurable. The current cleanup function only handles presence, signals,
outgoing handshakes, and invitation-attempt rows. Terminal resource payloads and
session messages remain indefinitely until another deletion path happens.

Before live P0, choose one:

1. Implement a simple, explicit P0 retention policy with timestamps and cleanup,
   then expose the promised session-retention control in the renderer phase.
2. Narrow the plan and disclosure honestly: state exactly what P0 retains and
   until which user action, without claiming automatic cleanup.

Also update `delete_my_data()` accordingly. A completed request made by the
departing user currently retains their direct `requester_id`, job, and result on
the counterparty's resource even though the immutable ledger already preserves
the transparency record.

## Test-Harness Corrections

- Add a real crossed-handshake test (`A -> B` followed by `B -> A`).
- Add invitation-throttle tests across separate committed transactions; a
  single rollback-only script cannot prove persistence.
- Add schema-privilege assertions for `folks_definer`.
- Add terminal-payload/session-retention tests or remove those claims.
- Change the plan wording from “Verified by `schema.tests.sql`” to “Covered by
  tests pending execution.” The checkpoint correctly admits the SQL tests have
  not run, so the plan must not say they verified runtime behavior.

## Paste-Ready Glaze Instruction

```text
The v3.1 revision is substantially improved and the ledger/deletion/grant/session
fixes are approved. Keep the current design, but pause for one narrow SQL
follow-up before Supabase provisioning or renderer/realtime wiring.

1. Fix the definer role's schema access. `folks_private` is created and left
admin-owned, while its functions/table are reassigned to `folks_definer`.
PostgreSQL requires schema USAGE (or schema ownership) to access objects in a
schema. Transfer `folks_private` ownership to `folks_definer` or grant that role
USAGE. Explicitly grant/verify the required `extensions` schema usage and exact
pgcrypto function execution too. Add `has_schema_privilege` assertions and run
an authenticated public RPC that calls a private helper.

2. Replace the invitation throttle. The current attempt INSERT is in the same
function transaction as later RAISE EXCEPTION paths, so every invalid attempt
rolls back its own throttle record. Use a locked per-user time bucket/counter and
return a structured generic result for expected invalid/rate-limited outcomes so
the counter commits. Preserve anti-enumeration. Test repeated invalid attempts in
separate transactions and prove the limit activates. If this is deferred,
remove the rate-limited claim and document the limitation.

3. Make live-handshake uniqueness unordered. The current unique index on
`(community_id, initiator_id, recipient_id)` allows simultaneous A->B and B->A
rows. Use `least(initiator_id, recipient_id)` and
`greatest(initiator_id, recipient_id)` in the live partial unique index and in
cooldown matching. Add the reverse-direction concurrency test.

4. Resolve the remaining retention mismatch. The plan promises cleanup for
terminal resource job/result payloads and configurable session-message
retention, but `folks_cleanup` implements neither. Either implement a simple
explicit P0 retention policy now (with timestamps, cleanup, and later renderer
control), or narrow the plan/disclosure to the exact P0 behavior. Ensure
`delete_my_data` does not retain a departing requester's direct UID and
job/result merely because the request completed; the immutable ledger already
preserves the transparency record.

5. Update test/plan honesty. Add schema-access, crossed-handshake, durable
invitation-throttle, and retention tests. Change “Verified by schema.tests.sql”
to “Covered by tests pending execution” until the SQL suite has actually run.
The rollback-only suite cannot by itself test durable rate-limit state across
failed calls.

After revising, build/lint/type-check, then stop at another checkpoint. Report
the exact schema grants/ownership and the tests that remain unexecuted. Do not
apply anything live and do not start renderer/realtime wiring.
```

