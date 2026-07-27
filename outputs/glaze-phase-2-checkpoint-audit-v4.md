# Folks Phase 2 Checkpoint Audit v4

Date: 2026-07-24

Glaze commit reviewed:
`2cf5697f97fbb43743ed0f9010facd36d95f8fb0`

## Verdict

**ONE FINAL NARROW REVISION BEFORE SUPABASE APPLY.**

The ownership prerequisite identified in v3 is fixed in principle:

- `folks_private` remains admin-owned.
- `folks_definer` receives temporary `CREATE` on `public` and
  `folks_private`.
- Folks tables and functions are transferred to `folks_definer`.
- Temporary `CREATE` is revoked.
- The plan and tests describe the resulting model honestly.

Independent `npm run lint`, `npm run type-check`, and `npm run build` all pass.
The SQL suite remains authored but unexecuted.

## Remaining Ownership Hardening

### 1. Scope the function transfer

The ownership loop currently transfers:

```sql
where n.nspname = 'folks_private'
   or (n.nspname = 'public' and p.prosecdef)
```

The second branch means **every** `SECURITY DEFINER` function already present in
`public`, including functions unrelated to Folks, is reassigned to
`folks_definer`. A dedicated fresh project may happen to contain none, but the
schema must not depend on that assumption.

Use an explicit allowlist of Folks function signatures, just as the client
`GRANT EXECUTE` block already does. Prefer explicit signatures for the private
helpers and trigger functions too.

### 2. Make temporary privileges failure-atomic

The temporary `GRANT CREATE` statements are before the ownership `DO` block and
the `REVOKE` statements are after it. If an ownership statement fails and the
runner stops, the revokes may never execute, leaving `folks_definer` with
standing `CREATE`.

Put the temporary grants, exact ownership transfers, and revokes inside one
transactional `DO` block (or one explicit transaction). Then any failure rolls
back both the transfers and the temporary grants automatically.

## Paste-Ready Glaze Amendment

The ownership prerequisite is now correct in principle, but make two final
least-privilege corrections before this schema is safe to apply. Keep all
current behavior and stop again after the change.

1. Scope the function ownership transfer to Folks only. The current query
   transfers every `SECURITY DEFINER` function in `public`:
   `n.nspname = 'public' and p.prosecdef`. That can take ownership of unrelated
   project functions. Replace the broad catalog query with an explicit
   allowlist of exact Folks `regprocedure` signatures. Prefer an explicit list
   for `folks_private` helpers/triggers too.

2. Make the transient `CREATE` privileges failure-atomic. The grants currently
   occur before the `DO` block and the revokes after it; if an ownership
   transfer fails and execution stops, `folks_definer` can retain `CREATE`.
   Execute the temporary grants, allowlisted ownership transfers, and revokes
   inside one transactional `DO` block or one explicit transaction, so any
   failure rolls the grants back automatically.

Add focused checks that:

- an unrelated pre-existing `public` `SECURITY DEFINER` function keeps its
  original owner;
- every exact Folks table/function has the intended owner;
- `folks_definer` has no effective `CREATE` on either schema afterward; and
- the failure path cannot leave the temporary grants behind.

Keep the SQL suite labeled unexecuted unless it actually runs against local or
hosted Supabase. Do not apply live and do not start renderer/realtime wiring.

## Runtime Gate

After this amendment, static review should be complete. The remaining gate is a
fresh local or hosted Supabase execution of:

1. `main/db/schema.sql`
2. the verification queries
3. `main/db/schema.tests.sql`
