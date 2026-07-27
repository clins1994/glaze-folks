# Folks Phase 2 Runtime Audit v5

Date: 2026-07-24

Glaze commit reviewed:
`26ad396182af7105891881ed74f7292b5655a88d`

Runtime:

- Supabase CLI `latest`
- Local Supabase Postgres `17.6.1.143`
- Isolated project: `/private/tmp/folks-supabase-validation`
- No hosted project touched

## Result

`main/db/schema.sql` executes to completion.

The test suite fails immediately when the first owner RPC initializes
`auth.uid()`:

```text
ERROR:  permission denied for schema auth
QUERY:  auth.uid()
CONTEXT:  PL/pgSQL function public.create_community(text)
```

During schema application PostgreSQL also reports:

```text
WARNING: no privileges were granted for "auth"
```

## Cause

In local Supabase:

- `auth` is owned by `supabase_admin`.
- `postgres` has `USAGE` on `auth`, but no grant option for that schema.
- `folks_definer` therefore does not receive `USAGE`.
- `auth.uid()` is owned by `supabase_auth_admin`.
- `postgres` does have `SELECT ... WITH GRANT OPTION` on `auth.users`, but table
  access is still unusable without schema `USAGE`.

The custom `folks_definer` role cannot directly call `auth.uid()` or read
`auth.users`. This is expected to affect hosted Supabase as well and must not be
worked around by assuming true-superuser privileges.

## Paste-Ready Glaze Amendment

The static ownership fixes pass, and I executed the exact schema against an
isolated local Supabase Postgres 17.6.1.143 instance. `schema.sql` completes,
but `schema.tests.sql` fails at the first owner RPC:

```text
ERROR: permission denied for schema auth
QUERY: auth.uid()
CONTEXT: PL/pgSQL function public.create_community(text)
```

Schema application also prints:

```text
WARNING: no privileges were granted for "auth"
```

Root cause: Supabase's `auth` schema is owned by `supabase_admin`. The
SQL-editor `postgres` role has `USAGE` but cannot grant schema `USAGE` to
`folks_definer`. Consequently the custom definer cannot call `auth.uid()` or
reference `auth.users`, even though the attempted table SELECT grant succeeds.

Fix this without broadening `folks_definer`:

1. Remove the ineffective `GRANT USAGE ON SCHEMA auth TO folks_definer` and the
   unnecessary direct `SELECT ON auth.users` grant.
2. Add a private `folks_private.current_uid()` helper that implements Supabase's
   stable JWT lookup using `current_setting('request.jwt.claim.sub', true)` with
   the `request.jwt.claims ->> 'sub'` fallback. It needs no `auth` access and may
   be owned by `folks_definer`.
3. Replace `auth.uid()` inside Folks-owned SECURITY DEFINER functions with
   `folks_private.current_uid()`. Do not change RLS policies: authenticated
   clients already have access to `auth.uid()`.
4. Keep the narrow `folks_private.is_protected(uid)` bridge admin-owned
   (`postgres`), not `folks_definer`, because it reads `auth.users`. Pin its
   `search_path`, revoke EXECUTE from PUBLIC/anon/authenticated, and grant
   EXECUTE only to `folks_definer`. Remove it from the ownership allowlist and
   from the authenticated RLS-helper grants unless a policy genuinely needs it.
5. Update ownership assertions and the plan to document this single
   admin-owned Auth bridge exception.

Then rebuild and stop. Do not apply anything hosted and do not begin
renderer/realtime wiring. I will reset the isolated local Supabase database,
apply the revised schema from scratch, and run the complete SQL suite again.
