# Folks — Glaze Implementation Plan (v3, security-hardened)

## Context

Folks is a local-first macOS app (Glaze Awards submission) that turns private AI use into a path to human connection and trusted resource sharing. The vertical slice proves ONE loop across **two independently-installed copies (two real users)**:

> Private AI chat → Selective mode + one approved signal → notice a real nearby presence (no transcript exposed) → mutual handshake → shared **text** session (Human-only / Quiet-notes / On-demand AI) → one member requests a bounded task from another member's owner-controlled Hermes resource → deterministic policy allows/denies → transparent ledger entry (no money).

**Retained from v2 (unchanged):** Supabase as the hosted foundation; **text-first** P0 (no paid voice deps); **manual Hermes** connection (owner enters base URL + API key, tests, stores in Keychain, declares locality, exposes only via policy; credential never leaves the owner's Mac; real `POST /v1/chat/completions` is the demo path); **Living Orbit** single-app visual direction; **capability contract** extension boundary; the **phased build** (0 spikes → 1 shell/world/North → 2 identity/presence/handshake/shared-text → 3 community/Hermes/policy/ledger → 4 polish/a11y/store). North = personal companion; Hermes = contributed community resource.

**v3 amends six areas below.** The load-bearing change: **security-sensitive state is now database-authoritative** — clients do not freely UPDATE rows guarded by RLS alone; every sensitive transition goes through a transactional `SECURITY DEFINER` Postgres function, with RLS + triggers as defense-in-depth. No code is written yet.

---

## Amendment 1 — Secure community bootstrap for anonymous identities

**Goal:** anonymous per-install users can form a trusted community without accounts, without leaking an enumerable join surface.

**Protected-ownership gate (v3 correction):** creating a community or registering a resource makes you responsible to others, so both **require a protected identity** (Amendment 5). This is enforced **inside the database-authoritative functions**, not just the UI: `create_community` and `register_resource` read the caller's `auth.users` row and **raise if the identity is anonymous** (no linked, confirmed email). Anonymous users can still join, handshake, chat, and request — they just cannot own.

**Entities**
- `communities` (id, name, created_by, created_at).
- `memberships` (community_id, user_id, role `owner|member`, status `active|left|revoked`, joined_at) — unique `(community_id, user_id)`.
- `invitations` (**`id` = non-secret public token**, community_id, **`secret_hash`** password-style hash of the secret, created_by, created_at, expires_at, max_uses default 1, used_count default 0, revoked_at). The plaintext code handed to the inviter is **`<id>.<secret>`**; the secret is high-entropy and is **never stored** — only `secret_hash` (bcrypt via pgcrypto `crypt()/gen_salt('bf')`) is.

**Bootstrap flow (all via `SECURITY DEFINER` RPC, never direct DML):**
- `create_community(name) → community_id`: **requires protected identity**; inserts the community + an `owner` membership for `auth.uid()` atomically.
- `create_invitation(community_id, ttl, max_uses) → { code }`: owner-only; generates a high-entropy `secret`, stores `secret_hash = crypt(secret, gen_salt('bf'))`, returns the one-time plaintext **`<id>.<secret>`**. Copy-paste code is primary; an optional `folks://invite/<id>.<secret>` deep link wraps the same code (no separate trust path).
- `accept_invitation(code) → membership`: **splits `code` into `id` and `secret`**, looks up and **locks the row by non-secret `id`** (`SELECT … FOR UPDATE`), then **constant-time verifies** the secret with `crypt(secret, secret_hash) = secret_hash`; on match validates **not revoked, not expired, `used_count < max_uses`, caller not already an active member**, then inserts/reactivates membership and increments `used_count`, all in one transaction. Single-use is guaranteed by the row lock + check (concurrent double-accept → exactly one succeeds). This is directly implementable because lookup is by id, not by hash.
- `revoke_invitation(id)` / `revoke_membership(community_id, user_id)`: owner-only; sets `revoked_at` / membership `status='revoked'` (a revoked member's community reads immediately fail RLS).
- `leave_community(community_id)`: sets caller's membership `status='left'`.
- **Ownership lifecycle (v3):** `transfer_ownership(community_id, new_owner)` — owner-only; `new_owner` must be an **active, protected member**; atomically demotes the caller and promotes the target. `dissolve_community(community_id)` — owner-only; deactivates all memberships, revokes outstanding invitations, and removes community-scoped data. **A sole owner cannot delete their account until they either transfer ownership or dissolve the community** — `delete_my_data` blocks with a clear error listing the communities that must be resolved first.

**Anti-enumeration:** `id` alone is useless without the `secret`; a failed verify returns a **generic error** (no distinction between unknown id and wrong secret); acceptance is rate-limited. The `invitations` table has **no client SELECT policy** (owners read their own via a scoped RPC).

**Reinstall behavior:** anonymous identity + memberships are lost on reinstall/sign-out **unless the user protected their identity** (Amendment 5). Protected users sign back in (email OTP) → same `auth.uid()` → memberships intact. Since owners are always protected, ownership is always recoverable; unprotected reinstall = a fresh non-owner user, orphaned rows cleaned by the owner (revoke) or TTL.

---

## Amendment 2 — Database-authoritative state transitions

**Rule:** RLS alone (client UPDATE) is insufficient for security-sensitive transitions. Every such transition is a transactional `SECURITY DEFINER` function that (1) authenticates `auth.uid()`, (2) validates the current state, (3) locks the row (`FOR UPDATE`), (4) performs a legal transition, (5) writes side effects atomically. RLS denies direct writes to these tables/columns; clients get `EXECUTE` on the functions and `SELECT` only on rows they're party to. All functions pin `search_path` and are owned by a dedicated role.

| Domain | Function(s) | Server-enforced invariants |
|---|---|---|
| Community/ownership | `create_community`, `register_resource`, `transfer_ownership`, `dissolve_community` | **create/register require a protected identity** (raise if anonymous); transfer target must be an active protected member; dissolve cascades; sole-owner-must-resolve before account deletion |
| Invitations | `accept_invitation`, `create_invitation`, `revoke_invitation` | single-use, expiry, revocation, no duplicate membership, `id.secret` constant-time verify (Amdt 1) |
| Handshake | `send_handshake(recipient, community, intro?)`, `respond_handshake(id, accept\|decline\|defer\|block)` | shared-community required; sender not blocked; rate limit per sender/recipient; only recipient responds; **terminal states immutable** |
| Shared session | `create_shared_session(handshake_id)` | only when handshake `state=connected`; caller is a participant; **exactly one session per handshake** (unique index) |
| Resource lifecycle | `submit_resource_request`, `approve_resource_request`, `deny_resource_request`, `claim_resource_request`, `complete_resource_request`, `fail_resource_request`, `cancel_resource_request` | requester is a community member; resource active; **owner-only** approve/claim/complete; **single claim** (no double execution); legal state-machine only |
| Ledger | (no direct create) `complete_/deny_resource_request` writes the `ledger_entries` row + its two `ledger_parties` rows **in the same transaction** | ledger creation is a side effect of a terminal request transition, never a free client insert; entries carry opaque `party_id`s, never `auth.uid` directly |
| Resource control | `pause_resource`, `revoke_resource` | owner-only; cancels queued requests safely |
| Blocks | `block_user`, `unblock_user` | minimal server-side block record so `send_handshake` can reject at the relay |
| Account | `delete_my_data` | **blocks if caller is a sole owner** (must transfer/dissolve first); removes presence, signals, resource metadata, pending requests; **deletes own message content, leaving only a contentless tombstone where ordering must remain**; de-identifies by **nulling the caller's `user_id` in `ledger_parties` and setting a tombstone pseudonym — never touches `ledger_entries`** (Amdt 4) |

**Triggers (defense-in-depth, independent of the functions):**
- `ledger_entries`: `BEFORE UPDATE OR DELETE` → raise exception (**append-only / genuinely immutable**; de-identification never touches this table — it happens in `ledger_parties`).
- `ledger_parties`: guard so the mapping can only move `user_id` **toward NULL** (de-identify), never re-point one user to a different user — keeps the mapping tamper-resistant while allowing `delete_my_data` to tombstone.
- `handshakes`: reject any UPDATE moving out of a terminal state.
- `resource_requests`: reject illegal state transitions.
- `updated_at` timestamps.

**Concurrency:** `FOR UPDATE` row locks on every transition; unique indexes enforce one-session-per-handshake, one-active-membership-per-(community,user), single invitation consumption.

---

## Amendment 3 — Open-mode matching (correcting "derived locally via Glaze AI")

**Correction:** Glaze AI is a **hosted proxy call, not on-device processing** — the v2 phrase "derived locally via Glaze AI" was wrong and is removed.

- **Selective is the real P0 matching path.** The user explicitly writes/approves the signal; nothing is derived from private conversation.
- **Open ships as clearly-labeled Preview in P0** (illustrative bodies in the world, never real people, never mixed with live presence). Open becomes real only if a **deterministic, privacy-safe implementation is proven** — either (a) on-device deterministic extraction (local keyword/topic mapping, zero network), or (b) AI-derived tags, which because they leave the device to the Glaze proxy **require explicit processing consent AND a user preview of the exact tags before any publication**.
- **Hard rule:** private companion transcripts are **never** sent to Supabase for matching, under any mode. Only user-approved signals (Selective) or user-previewed tags (future Open path (b)) ever reach the relay — and only the resulting tags, never the transcript.

---

## Amendment 4 — Encryption & data-handling honesty

**P0 posture: TLS in transit + Row-Level Security for access control — NOT end-to-end encryption.** Stated plainly:

- Shared messages, resource job envelopes, results, and ledger metadata are encrypted **in transit (TLS)** and access-restricted **from other users by RLS**, but are **readable at rest by the Supabase project operator** (the app author, who holds dashboard/service access). This is not E2E.
- Data that is genuinely private stays private by **never being transmitted**: companion transcripts, North memory, Hermes base URL + API key, structured policy source, full ledger detail — local (`userData`) / Keychain (`safeStorage`) only.
- **E2E is a documented P1 option** (encrypt `session_messages` payloads with a handshake-derived shared key) — deferred because it complicates in-session AI and key recovery. Not claimed in P0.

**Retention / TTL / deletion:**
| Data | Retention | Cleanup |
|---|---|---|
| `presence` | ephemeral; cleared on mode change / heartbeat expiry | scheduled sweep (pg_cron) of stale rows |
| Open Preview tags | none published in P0 | n/a |
| `handshakes` | pending expires after timeout; terminal kept for cooldown/block, then pruned | pg_cron |
| `resource_requests` (+ job/result payload) | payload deleted after completion unless policy opts into retention | pg_cron + `complete_` cleanup |
| `session_messages` | per-session retention, **visible/configurable to participants**; content deleted on account deletion, **contentless tombstone kept only where ordering must remain**; whole rows removed with the session | cascade + sweep |
| `ledger_entries` | retained (transparency record); **no secrets**, **no direct user id** (parties referenced via `ledger_parties`); **genuinely immutable — never UPDATE/DELETE** | immutable |
| `ledger_parties` | opaque party mapping (`party_id → user_id?` + stable pseudonym); `delete_my_data` **nulls the user_id and sets a tombstone pseudonym here** | user-triggered de-identification |
| local store | wiped by "Delete local data"; `delete_my_data` RPC removes server-side presence/signals/resources/pending requests | user-triggered |

**Deletion semantics (v3 final — immutable ledger AND real de-identification, no trigger bypass):**
- **Fully deleted** on `delete_my_data`: all local data; server-side presence, signals, resource metadata, pending/owned resource requests, and the caller's community memberships.
- **Own messages:** the caller's `session_messages` **content is deleted**; only a **contentless tombstone** ("message removed") is retained where conversation ordering must be preserved for the counterparty — otherwise the row is removed. The counterparty's own messages are untouched (their data).
- **Ledger is never mutated.** `ledger_entries` reference opaque `party_id`s in a separate `ledger_parties` mapping. `delete_my_data` **only updates `ledger_parties`** — it removes the departing user's `auth.uid` association and leaves a **stable tombstone pseudonym** in the mapping. `ledger_entries` themselves are never updated or deleted, so the `BEFORE UPDATE OR DELETE` immutability trigger stands unweakened. The departing user is genuinely de-identified; the counterparty retains full, accurate access to the entry.
- **Shared sessions:** the caller is marked departed; the session persists for the other participant under that session's retention.
- Blocked case: a **sole community owner** must `transfer_ownership` or `dissolve_community` before `delete_my_data` succeeds.

**Administrator visibility (honest):** the Supabase project operator can access non-E2E data at rest. For this submission the operator is the app author. Disclosed in-app and in the Store listing (Amendment 4 disclosure below).

---

## Amendment 5 — Anonymous-first auth with identity protection (Supabase Auth only)

- **First launch:** Supabase **anonymous sign-in** → stable `auth.uid()`. Session (access + refresh token) persisted locally in Keychain (`safeStorage`). All rows key off `auth.uid()`.
- **"Protect your identity" upgrade:** link an email to the anonymous user via `supabase.auth.updateUser({ email })` verified by **email OTP code** (primary — no redirect/deep-link needed on desktop; magic link optional if `folks://auth-callback` is wired). Linking **preserves the same `auth.uid()`**, so memberships, handshakes, sessions, resources, and ledger all carry over.
- **What anonymous users may do:** chat with North (local), **join** a community, set presence, handshake, shared chat, and submit requests. They **cannot create a community or register a resource** — those require a protected identity (enforced in the DB functions).
- **When protection is recommended vs required:**
  - *Recommended* before your first real connection or joining a community you want to keep.
  - *Required* to **create/own a community** or **register/contribute a Hermes resource** — losing that identity would strand other members, so `create_community` and `register_resource` **enforce a protected identity in the database function itself** (raise if anonymous), not just in the UI.
- **Honest warning:** an unprotected identity may be **permanently lost after sign-out, "Delete local data," or reinstall** (a new `auth.uid()` is issued; prior rows are orphaned). Protected users recover everything via email OTP.
- **No second auth system.** Supabase Auth (anonymous + email-linking) satisfies every P0 requirement; no concrete P0 need requires Better Auth or another provider.

---

## Amendment 6 — Vercel is optional; Supabase-native is the default

- **Supabase is the whole foundation:** Auth, Postgres, RLS, Realtime. Privileged operations are handled **inside the database** by `SECURITY DEFINER` RPCs (Amendment 2) — so the app never needs, and never holds, a service-role key or any privileged secret. The distributed app holds only the **publishable anon key**.
- **If trusted server logic is ever required**, prefer **Supabase Edge Functions** (Supabase-native, secrets in Supabase env, one platform — no duplication of identity/authz/realtime).
- **Vercel only if** a concrete need cannot be met by a DB function or Edge Function. If used, it gets a **single narrow responsibility**, **server-only environment variables** (never shipped in the app), and must **not** duplicate identity, authorization, realtime state, or business logic.
- **P0 verdict: no Vercel, no Edge Functions required.** Every security-sensitive operation is expressible as a transactional DB function. TTL cleanup uses `pg_cron`. Email OTP is handled by Supabase Auth.

---

## Schema, RLS, functions, retention — concrete changes vs v2

**New / changed tables:** add `invitations` (non-secret `id`, `secret_hash` via pgcrypto bcrypt, community_id, expiry, max_uses, used_count, revoked_at) and `blocks` (blocker_id, blocked_id, created_at, unique pair). `memberships` gains `status`. **`ledger_entries` carry opaque `party_id`s (no direct `user_id`) and are truly immutable**; a new **`ledger_parties`** table maps `party_id → user_id?` + a stable pseudonym and is the *only* place de-identification happens. `resource_requests` carries the bounded job envelope + result reference + usage. Requires the `pgcrypto` extension. Full set (RLS on all): `users`, `communities`, `memberships`, `invitations`, `blocks`, `signals`, `presence`, `handshakes`, `shared_sessions`, `session_messages`, `resources` (non-secret metadata only), `resource_requests`, `ledger_entries`, `ledger_parties`.

**RLS model:** SELECT policies scope every table to `auth.uid()` via active membership/participation. Sensitive INSERT/UPDATE/DELETE are **denied to clients**; those mutations happen only through the `SECURITY DEFINER` functions in Amendment 2. Low-risk self-writes (e.g., own `presence` upsert) may be RLS-guarded direct writes shaped by a `CHECK`/trigger for TTL. `invitations` has no client SELECT; `ledger_entries` is client-readable **via a join to `ledger_parties` where `user_id = auth.uid()`** (so a de-identified party silently loses access while the counterparty keeps it) but never client-writable; `ledger_parties` is not client-writable.

**Functions & triggers:** exactly the set in Amendment 2 (bootstrap **with protected-identity gates on `create_community`/`register_resource`**, ownership `transfer_ownership`/`dissolve_community`, handshake, session, resource lifecycle, ledger-as-side-effect, blocks, and `delete_my_data` **with sole-owner block + `ledger_parties` de-identification, never touching `ledger_entries`**) plus the immutability/terminal-state/transition triggers (including the `ledger_entries` append-only guard and the `ledger_parties` user_id→NULL-only guard). All `SECURITY DEFINER`, pinned `search_path`, `EXECUTE` granted to `authenticated`.

**Retention:** the table in Amendment 4, implemented with `pg_cron` sweeps + cleanup inside terminal-transition functions.

**Applied once** to the Supabase project as `main/db/schema.sql` (tables → RLS policies → functions → triggers → cron).

---

## Test-plan changes (added to v2's unit / two-Mac E2E / privacy / AI / secrets / a11y)

- **Invitations:** expired code rejected; single-use enforced (2nd accept fails); revoked code rejected; **concurrent double-accept → exactly one membership**; invitations not client-readable/enumerable; **wrong/malformed `id.secret` → generic error**; correct `id.secret` verifies via `crypt()`.
- **Protected ownership:** `create_community` and `register_resource` **fail for anonymous callers** and succeed after email-OTP protection; `transfer_ownership` requires an active protected target; **sole owner's `delete_my_data` is blocked** until transfer/dissolve; `dissolve_community` cascades correctly.
- **Deletion consistency (no trigger bypass):** `delete_my_data` deletes own message **content** (contentless tombstone only where ordering must remain) while the counterparty's messages persist; it **de-identifies via `ledger_parties` (user_id→NULL + tombstone) and performs zero writes to `ledger_entries`**; a direct UPDATE/DELETE on `ledger_entries` is still rejected by the immutability trigger; the de-identified party loses ledger read access while the counterparty keeps it; `ledger_parties` cannot be re-pointed to a different user.
- **DB-authoritative transitions:** illegal handshake/request transitions rejected by function AND trigger; **ledger UPDATE/DELETE blocked**; **double resource claim → one winner**; direct client UPDATE of a guarded column is denied by RLS.
- **Auth upgrade:** anonymous → email-OTP link **preserves `auth.uid()`** and all rows; sign-out + sign-in recovers; unprotected reinstall loses access (expected); protected reinstall recovers.
- **Open Preview:** clearly labeled, **publishes nothing** to the relay; no transcript ever leaves the device.
- **Encryption honesty:** UI/Store make **no E2E claim**; operator-visibility disclosure present; `delete_my_data` removes server rows; TTL sweeps run.
- **Blocks:** blocked sender's `send_handshake` is rejected server-side; block survives restart.

---

## Store disclosure (exact text intent)

State plainly: Folks uses a **Supabase** backend (Auth, database, realtime). **Identity is anonymous by default**; adding an email is optional and only protects/recovers your identity. Community messages, resource jobs, results, and ledger entries are protected **in transit (TLS) and by row-level access control, but are not end-to-end encrypted and are readable by the app's backend operator**; they are **not** used to train anything. **Private companion conversations, AI memory, and your Hermes endpoint URL/API key never leave your Mac** (stored in the macOS Keychain). Each user spends **their own** Glaze AI credits. **Open mode is a labeled Preview** (illustrative, not real people). You can delete your local data and request deletion of your personal server-side data at any time. When you do, **your message content is deleted** — only a **contentless placeholder** may remain where it is needed to keep a conversation's order intact for the other person. Two-party transparency **ledger entries are kept but de-identified** (your identity is removed and replaced with an anonymous tombstone) so other members retain an accurate account; these contain no secrets and no personal identifier after deletion. If you are the sole owner of a community, you must transfer ownership or dissolve it before deleting your account.

---

## External configuration checklist

**Supabase (required, once):**
1. Create a project; copy **Project URL** + **publishable anon key** (baked into the app).
2. **Enable anonymous sign-ins** (Auth settings).
3. Configure an **email provider** (SMTP or Supabase default) for **email-OTP** identity protection.
4. Enable the **`pgcrypto`** extension (invitation `crypt()`), then apply `main/db/schema.sql`: extensions → tables → RLS → `SECURITY DEFINER` functions → triggers → `pg_cron` cleanup jobs.
5. Confirm **Realtime** is enabled on the relevant tables (presence, handshakes, shared_sessions, session_messages, resource_requests, ledger_entries).
6. (Optional) add `folks://` to allowed redirect URLs only if magic-link/deep-link is wired (not required — OTP is primary).

**Optional Vercel:** **not required for P0.** Only if a future concrete need appears: define one narrow responsibility, set server-only env vars (never in the app), never a service-role key in the client.

**Two test identities:** two Macs (or two macOS accounts). App A launches → anonymous → **protects identity via email OTP (required before ownership)** → `create_community` → `create_invitation` (copy `id.secret` code). App B launches → anonymous → `accept_invitation(code)` → both members. App A also protects before `register_resource` for the Hermes step. Run the full loop.

**Real Hermes endpoint:** one OpenAI-compatible endpoint ready (owner enters base URL + API key at runtime → stored in Keychain → tested → exposed via policy). Never shared with the requester or relay.

---

## Go / no-go verdict

**GO — Supabase-only, no Vercel, no second auth system for P0.** Every security-sensitive operation is expressible as a transactional `SECURITY DEFINER` Postgres function with trigger-enforced invariants and RLS defense-in-depth; anonymous-first Supabase Auth with email-OTP linking satisfies identity + protection; the app never holds a privileged secret. Remaining risks are non-blocking and mitigated: (1) confirm `@supabase/supabase-js` realtime runs in the Glaze backend WS runtime — Phase 0 spike, fallback thin WSS+REST client; (2) npm install-age policy may force pinning an older `@supabase/supabase-js`; (3) two-user flows verified manually across two Macs; (4) P0 is **not E2E** — disclosed honestly. Local phases (0–1) start immediately; network phases proceed once the Supabase project + schema are provisioned.

---

## Honest limitations (in-app + submission)

1. Requires the Supabase relay (free tier; anon key baked in, RLS + DB-authoritative functions are the protection).
2. Hermes requests require the **owner online with Folks open** (no background-while-quit).
3. **Text-only** P0; realtime voice is P1. Text completes the full flow.
4. **Selective** is the real matching path; **Open** is labeled **Preview**.
5. No embeddings; **not end-to-end encrypted** in P0 (TLS + RLS; operator can read at rest — disclosed).
6. Hermes is connected **manually**; AI-guided setup is future vision.
7. Unprotected anonymous identities can be lost on reinstall/sign-out/delete; email protection recovers them.
