# Folks Phase 2 Checkpoint Audit v3

Date: 2026-07-24

Glaze commit reviewed:
`0382397772e220283ae3a99355ba90e9593a0009`

## Verdict

**REVISE ONCE MORE BEFORE APPLYING TO SUPABASE.**

Glaze materially fixed the five v3.1 follow-ups:

- `folks_private` and pgcrypto access are now explicitly addressed.
- Invitation attempts use a locked counter and structured return values, so expected failures do not roll back the counter.
- Live handshake uniqueness and cooldown matching are unordered.
- Terminal request job/result payloads have an explicit seven-day cleanup policy, while P0 session-message retention is described honestly.
- The plan and tests now clearly say the SQL suite is authored but unexecuted.

Independent `npm run lint`, `npm run type-check`, and `npm run build` all pass.
No schema or test was applied to a live project.

## Remaining Deployment Blocker

The ownership block does not establish the privileges PostgreSQL requires for
ownership transfer:

- `ALTER SCHEMA ... OWNER TO folks_definer` requires `folks_definer` to have
  `CREATE` on the current database.
- `ALTER TABLE ... OWNER TO folks_definer` requires `folks_definer` to have
  `CREATE` on the table's schema.
- `ALTER FUNCTION ... OWNER TO folks_definer` requires `folks_definer` to have
  `CREATE` on the function's schema.

The current order is:

1. Transfer `folks_private` schema ownership.
2. Transfer public/private table ownership.
3. Transfer function ownership.
4. Grant only `USAGE` on the schemas.

On hosted Supabase, `postgres` is an admin role but not a true superuser. The
script therefore cannot assume these ownership prerequisites are bypassed. A
fresh apply may stop at the first ownership statement, before any tests run.

References:

- PostgreSQL `ALTER SCHEMA`: <https://www.postgresql.org/docs/current/sql-alterschema.html>
- PostgreSQL `ALTER TABLE`: <https://www.postgresql.org/docs/current/sql-altertable.html>
- PostgreSQL `ALTER FUNCTION`: <https://www.postgresql.org/docs/current/sql-alterfunction.html>
- Supabase role limitations: <https://supabase.com/docs/guides/database/postgres/roles-superuser>

## Paste-Ready Glaze Amendment

The latest checkpoint is materially correct, but one ownership prerequisite
still blocks a safe first Supabase apply. Keep all current behavior and stop
again after this narrow correction.

In `main/db/schema.sql`, fix the ownership-transfer sequence. PostgreSQL requires:

- the new schema owner to have `CREATE` on the current database;
- the new table owner to have `CREATE` on the table's schema; and
- the new function owner to have `CREATE` on the function's schema.

The current script attempts `ALTER SCHEMA`, `ALTER TABLE`, and `ALTER FUNCTION
... OWNER TO folks_definer` before granting only schema `USAGE`. A hosted
Supabase `postgres` role is not a true superuser, so do not rely on superuser
bypass.

Choose and implement the least-privilege approach:

1. Prefer leaving `folks_private` admin-owned and granting `folks_definer`
   `USAGE`; schema ownership is not required for its functions to access objects.
2. Temporarily grant `folks_definer` `CREATE` on `public` and
   `folks_private` only while transferring the Folks tables/functions, then
   revoke `CREATE` immediately after.
3. If you retain `folks_private` ownership transfer instead, explicitly and
   temporarily grant `CREATE` on the current database, transfer ownership, and
   revoke database `CREATE` immediately. Explain why this works on hosted
   Supabase.
4. Add assertions for the final ownership model and prove that
   `folks_definer` does not retain unnecessary `CREATE` privileges after setup.
5. Update the plan and checkpoint report to match the exact final schema owner.

Also add an explicit fresh-install preflight/test for this sequence. Keep the
SQL suite labeled unexecuted unless it is actually run against local or hosted
Supabase. Do not apply live and do not start renderer/realtime wiring yet.

## Residual Runtime Gate

Even after this correction, SQL approval remains conditional on one actual
fresh Supabase/local-Supabase execution of:

1. `main/db/schema.sql`
2. its verification queries
3. `main/db/schema.tests.sql`

That run is where Supabase-specific permissions around `auth.users`, custom-role
ownership, Realtime publication, and `pg_cron` must be confirmed.
