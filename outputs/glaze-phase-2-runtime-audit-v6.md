# Folks Phase 2 Runtime Audit v6

Date: 2026-07-24

Glaze commit reviewed:
`0ad9aa3862f766fe0e59cb4a344bf2a97903d78e`

Runtime:

- Supabase CLI `latest`
- Local Supabase Postgres `17.6.1.143`
- Fresh isolated project: `/private/tmp/folks-supabase-validation`
- No hosted project touched

## Verdict

Phase 2's database foundation is approved for the next checkpoint.

The v5 Auth access defect is resolved without granting `folks_definer` direct
access to Supabase's protected `auth` schema.

## Evidence

The Glaze project passes:

- `npm run build`
- `npm run lint`
- `npm run type-check`

The isolated local Supabase database was deleted and recreated before testing.
The exact revised `main/db/schema.sql` then executed from scratch with
`ON_ERROR_STOP=1`.

The prior warning did not recur:

```text
WARNING: no privileges were granted for "auth"
```

The exact revised `main/db/schema.tests.sql` completed with:

```text
BEGIN
INSERT 0 2
CREATE FUNCTION
NOTICE:  ALL TESTS PASSED
DO
ROLLBACK
```

## Confirmed Security Model

- `folks_private.current_uid()` reads the request JWT claims without accessing
  Supabase's `auth` schema.
- Folks-owned `SECURITY DEFINER` RPCs call `current_uid()`.
- RLS policies continue to use Supabase's `auth.uid()` as the authenticated
  caller.
- `folks_private.is_protected(uuid)` is the single admin-owned bridge that reads
  `auth.users`.
- `is_protected(uuid)` is not executable by PUBLIC, `anon`, or `authenticated`;
  only `folks_definer` may execute it.
- `folks_private` remains admin-owned.
- Ownership transfers are explicitly allowlisted and failure-atomic.
- `folks_definer` retains no `CREATE` privilege on `public` or
  `folks_private`.

## Paste-Ready Glaze Go-Ahead

Independent runtime verification is complete for commit
`0ad9aa3862f766fe0e59cb4a344bf2a97903d78e`.

I reset an isolated local Supabase Postgres 17.6.1.143 database, applied the
exact revised `main/db/schema.sql` from scratch with `ON_ERROR_STOP=1`, and ran
the complete `main/db/schema.tests.sql` suite. The schema applied without the
prior `auth` privilege warning and the suite completed with `ALL TESTS PASSED`.
`npm run build`, `npm run lint`, and `npm run type-check` also pass.

Phase 2's database foundation is approved. Proceed to the next planned
checkpoint: renderer identity and two-user realtime wiring. Preserve the tested
SQL and security model. Keep credentials local/Keychain, do not expose provider
keys or owner endpoints to requesters, and do not add hosted production
configuration yet. Stop after the first end-to-end two-user path is implemented
and report exactly what is real versus simulated, which environment variables
or external services remain unconfigured, and which tests were actually run.
