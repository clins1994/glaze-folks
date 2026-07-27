# Folks Dependency Setup Checklist

This checklist covers infrastructure and external services needed for the two-user competition demo. It separates P0 requirements from later product work so the build does not accumulate unnecessary services or secrets.

## Recommended Deployment

Use a disposable, dedicated VPS for the P0 Hermes resource, reachable only through Tailscale.

Do not expose Hermes directly from a personal Mac or from the host OS of a home server. Hermes' OpenAI-compatible API provides access to the agent's toolset, including terminal commands. Its write guards reduce accidental damage but are not a hard sandbox because terminal commands run as the Hermes OS user.

Acceptable alternatives:

| Option | P0 recommendation | Conditions |
| --- | --- | --- |
| Dedicated VPS | Preferred | Disposable, no personal data, Tailscale-only ingress, restricted tools and spend |
| Home server VM | Acceptable | Separate VM, separate service identity, no personal mounts, no LAN-wide access |
| Laptop VM/container | Temporary testing only | No host folders, credentials, Docker socket, SSH agent, or personal data mounted |
| Home server host or personal macOS host | Avoid | Blast radius is too large for a remotely callable tool-using agent |

## 1. Hermes Demo Resource

### Isolated host

- [ ] Provision one small VPS using a supported Linux LTS release.
- [ ] Create a non-root `hermes` service user.
- [ ] Enable automatic security updates and a default-deny firewall.
- [ ] Disable password SSH login; use a dedicated key or Tailscale SSH.
- [ ] Do not copy personal files, home-server credentials, cloud credentials, or production SSH keys to the VPS.
- [ ] Take a clean snapshot before installing Hermes so the host can be reset quickly.
- [ ] Define a teardown date after the competition.

### Private network path

- [ ] Install Tailscale on the VPS and the owner/demo Macs.
- [ ] Give the VPS a dedicated service tag.
- [ ] Replace any broad default-allow policy with an explicit Tailscale Grant.
- [ ] Allow only the owner/demo Mac identities to reach the Hermes service port.
- [ ] Keep the Hermes API bound to `127.0.0.1:8642`.
- [ ] Use Tailscale Serve to provide private tailnet HTTPS if needed.
- [ ] Do not enable Tailscale Funnel.
- [ ] Do not create a public DNS record or public firewall rule for Hermes.

### Hermes installation and API

- [ ] Install Hermes from the official Nous Research distribution.
- [ ] Run `hermes doctor` and record the installed version.
- [ ] Configure a minimal, dedicated P0 profile rather than reusing a personal Hermes profile.
- [ ] Enable the OpenAI-compatible API server:
  - `API_SERVER_ENABLED=true`
  - `API_SERVER_HOST=127.0.0.1`
  - `API_SERVER_PORT=8642`
  - `API_SERVER_KEY=<new random bearer token>`
- [ ] Generate `API_SERVER_KEY` specifically for Folks; do not reuse an OpenAI, Tailscale, or personal token.
- [ ] Leave browser CORS disabled because Folks does not need direct browser access.
- [ ] Start with the smallest useful toolset. Prefer model plus bounded web/research tools for the first demo.
- [ ] Keep dangerous-command approvals enabled; never use `approvals.mode: off` on a host containing anything valuable.
- [ ] If terminal access is demonstrated, restrict it to a disposable workspace and a dedicated unprivileged user.
- [ ] Set `HERMES_WRITE_SAFE_ROOT` to the disposable workspace as defense in depth.
- [ ] Never mount the Docker socket, SSH agent, host home directory, or cloud credential directories into the Hermes environment.

### Hermes verification

- [ ] Verify `GET /v1/health` locally on the VPS.
- [ ] Verify authenticated `GET /v1/models`.
- [ ] Verify one authenticated `POST /v1/chat/completions` locally.
- [ ] Verify the same request from the owner Mac over Tailscale.
- [ ] Verify an invalid bearer token is rejected.
- [ ] Verify the service is unreachable from the public internet.
- [ ] Configure Folks with the Tailscale HTTPS/base URL, `API_SERVER_KEY`, and model name.
- [ ] Confirm Folks stores the endpoint credential in macOS Keychain.
- [ ] Demonstrate one policy-allowed request and one policy-denied request.
- [ ] Document a kill switch: stop Hermes, revoke the API key, and remove the Tailscale Grant.

Official references:

- [Hermes API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/)
- [Hermes security model](https://hermes-agent.nousresearch.com/docs/user-guide/security/)
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
- [Tailscale Grants](https://tailscale.com/docs/features/access-control/grants)

## 2. OpenAI Provider For Hermes

This key powers the isolated Hermes instance. It is not shipped in Folks and is not shared with another community member.

- [ ] Create a dedicated OpenAI Project for the Folks competition demo.
- [ ] Create a new project-scoped API key, not a personal key reused from another project.
- [ ] Restrict key permissions where practical.
- [ ] Set a small project budget and usage alerts.
- [ ] Store the key only in the VPS secret environment or secret manager.
- [ ] Never enter the OpenAI key into the Folks desktop app.
- [ ] Never commit it to either Git repository.
- [ ] Verify usage appears under the dedicated OpenAI Project.
- [ ] Rotate or delete the key after the competition.

The credential entered into Folks is the separate Hermes `API_SERVER_KEY`; Hermes keeps and uses the upstream OpenAI key.

Official reference: [OpenAI API key safety](https://help.openai.com/en/articles/5112595)

## 3. Supabase Project

### Project and client configuration

- [ ] Create one hosted Supabase project for the P0 environment.
- [ ] Choose a region reasonably close to the two demo users.
- [ ] Store the database password in a password manager.
- [ ] Record the Project URL and `sb_publishable_...` key.
- [ ] Give Glaze/Folks only the Project URL and publishable key.
- [ ] Never place a secret key or legacy `service_role` key in Folks.

### Authentication

- [ ] Enable anonymous sign-ins.
- [ ] Enable manual identity linking.
- [ ] Enable email OTP for "Protect your identity."
- [ ] Confirm anonymous JWTs contain `is_anonymous`.
- [ ] Enforce protected identity inside `create_community` and `register_resource`, not only in UI.
- [ ] For the private demo, ensure the test email addresses are authorized recipients.
- [ ] Before external testing, configure custom SMTP. Supabase's default SMTP is best-effort, limited, and only sends to project-team addresses.
- [ ] Before public beta, add invisible CAPTCHA or Cloudflare Turnstile for anonymous-sign-in abuse prevention.
- [ ] Add scheduled cleanup for abandoned anonymous users.

### Database and Realtime

- [ ] Wait for Glaze to finish `main/db/schema.sql`.
- [ ] Review the SQL before applying it.
- [ ] Ensure `pgcrypto` and `pg_cron` are enabled by the migration.
- [ ] Confirm every exposed application table has RLS enabled.
- [ ] Confirm sensitive state changes use pinned-search-path `SECURITY DEFINER` functions.
- [ ] Confirm direct client writes to protected transitions are denied.
- [ ] Confirm `ledger_entries` are immutable and identity removal happens only through `ledger_parties`.
- [ ] Confirm invitation acceptance uses row locking and the `id.secret` design.
- [ ] Apply the schema through a versioned migration or the SQL editor once for P0.
- [ ] Enable Realtime/Postgres Changes only for the required tables.
- [ ] If Broadcast or Presence channels are used, make them private and add `realtime.messages` RLS policies.
- [ ] Verify revoked or departed members immediately lose reads.

### Two-user verification

- [ ] Launch two independent Folks installations or two macOS user accounts.
- [ ] App A signs in anonymously, then protects its identity with email OTP.
- [ ] App A creates a community and a one-use invitation.
- [ ] App B signs in anonymously and accepts the invitation.
- [ ] Verify Selective presence, handshake, and shared text in both directions.
- [ ] Verify private North conversation content never reaches Supabase.
- [ ] Verify owner transfer/dissolution and account-deletion guards.
- [ ] Verify concurrent invitation use and resource claiming each produce one winner.
- [ ] Verify retained ledger access and deletion-time de-identification.

Official references:

- [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Cron](https://supabase.com/docs/guides/cron)

## 4. Glaze AI

No additional provider key is required for North in P0.

- [ ] Confirm each user can grant the optional Glaze AI capability.
- [ ] Confirm each user spends their own Glaze credits.
- [ ] Confirm the UI says that transcripts are stored locally while submitted messages and relevant context are processed by Glaze AI.
- [ ] Confirm North content is never published to Supabase or a Folks community.
- [ ] Run one live streaming round-trip only after the privacy correction is built.
- [ ] Verify insufficient-credit, denied-consent, signed-out, and unavailable states.

## 5. LiveKit And Voice

Defer this entire section until P1. Text already completes the competition loop.

- [ ] Keep the existing LiveKit project inactive for P0.
- [ ] Do not put a LiveKit API secret in the desktop app.
- [ ] If voice is added later, create an authenticated server-side token endpoint.
- [ ] Give clients short-lived, room-scoped participant tokens.
- [ ] Reuse Supabase identity when authorizing token issuance.
- [ ] Choose one narrow backend for token generation, likely a Supabase Edge Function or Vercel Function.
- [ ] Add microphone consent, visible recording state, retention rules, and live-translation disclosure before enabling voice.

Official reference: [LiveKit endpoint token generation](https://docs.livekit.io/frontends/build/authentication/endpoint/)

## 6. Not Required For P0

- [ ] Vercel: defer unless Phase 2 reveals a concrete function that Supabase cannot handle.
- [ ] Better Auth: do not add; Supabase Auth is the P0 identity system.
- [ ] Stripe or contribution settlement: defer; use the transparent non-monetary ledger.
- [ ] OpenAI Realtime: defer.
- [ ] ElevenLabs: defer.
- [ ] Automated Hermes/Tailscale installation: defer.
- [ ] Public Hermes endpoint: do not build.
- [ ] Real Open matching or embeddings: defer; keep Open labeled Preview.

## Recommended Order

1. Let Glaze finish the Phase 2 adapter and `main/db/schema.sql`.
2. Create the Supabase project and configure Auth while the schema is being generated.
3. Provision the isolated Hermes VPS and private Tailscale path.
4. Create the dedicated OpenAI Project/key and configure Hermes.
5. Apply and test the Supabase migration.
6. Enter only the Supabase publishable configuration and Hermes bearer credential into Folks.
7. Run the full two-user loop.
8. Rotate demo secrets and tear down or snapshot the Hermes VPS after submission.

