# Folks production relay

Provisioned on 2026-07-24 for the Glaze Awards release.

## Hosted project

- Supabase organization: `worthwhile`
- Project: `folks-production`
- Project ref: `chegtveumckupwwkusou`
- Region: `us-east-1`
- API URL: `https://chegtveumckupwwkusou.supabase.co`
- Plan: Free
- Database: PostgreSQL 17
- Status at provisioning: `ACTIVE_HEALTHY`

The database password, Supabase secret/service-role keys, and Resend API key are
not stored in this repository. The app contains only the public project URL and
publishable client key; authorization is enforced by RLS and restricted RPCs.

## Database

Migration:
`supabase/migrations/20260724105628_initial_folks_schema.sql`

Hosted verification after deployment:

- 15 Folks tables have RLS enabled.
- 7 change-feed tables are registered with `supabase_realtime`.
- The migration is recorded in `supabase_migrations.schema_migrations`.
- `anon` cannot execute `public.create_community(text)`.
- `folks_definer` retains no `CREATE` privilege on `public`.
- The rollback-only schema test suite completed without an error.

## Authentication

Enabled:

- New-user signup
- Anonymous sign-in
- Manual identity linking
- Email confirmation

Folks starts with an anonymous authenticated identity. The backend and email
infrastructure support attaching and verifying an email address without
changing the Supabase user ID, but the current anonymous-only interface does
not expose that flow. Optional identity protection and recovery are planned for
a later release.

## Email

- Provider: Resend via its Supabase integration
- Verified sending domain: `auth.clins.me`
- Sender: `Folks <no-reply@auth.clins.me>`
- Resend region: `us-east-1`

The Magic Link and Change Email Address templates use `{{ .Token }}` for a
six-digit code. They remain dormant until Folks exposes identity protection and
recovery. Deep links are deferred until Folks registers and handles a macOS
callback URL.

Template sources:

- `supabase/templates/magic_link.html`
- `supabase/templates/email_change.html`
