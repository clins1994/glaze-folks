# Folks Glaze Plan v2 Audit

Reviewed plan: `glaze-generated-plan-v2.md`

## Verdict

The plan is feasible with constraints and is a strong basis for implementation. Do not authorize Build mode until the six amendments below are incorporated into a v3 plan.

## Decisions Accepted

- Supabase hosted transport with anonymous per-install identities.
- Supabase Auth remains the P0 identity system, with an account-protection upgrade path.
- Supabase Realtime and Postgres with Row-Level Security.
- Vercel is available only as an optional trusted server environment when it solves a concrete limitation.
- Text-only P0.
- Selective mode as the real matching path.
- Manual Hermes connection using an OpenAI-compatible base URL and API key.
- Hermes credentials stored locally and never sent to Supabase or another member.
- The resource owner must have Folks open and online.
- Glaze-native and community-owned providers share a capability contract.
- A phased build beginning with technical spikes.

## Required Amendments

### 1. Secure community bootstrap

The plan does not define how two anonymous installations securely become members of the same community.

The v3 plan must define:

- Community creation.
- A one-time invitation code or deep link.
- Expiration and single-use behavior.
- The minimum information disclosed before acceptance.
- Database-enforced membership creation.
- Revocation and leaving.
- Behavior after reinstall, when an anonymous identity may be lost.

### 2. Database-authoritative state transitions

Clients must not be able to manufacture connected handshakes, community roles, approved resource requests, or ledger entries by directly editing rows.

The v3 plan must identify which transitions use transactional Postgres functions, triggers, or another server-enforced mechanism, including:

- Accepting an invitation.
- Accepting, deferring, declining, expiring, or blocking a handshake.
- Creating a shared session.
- Approving or denying a resource request.
- Claiming a request for execution.
- Completing or failing a request.
- Creating immutable ledger metadata.
- Revoking queued work.

RLS remains necessary but is not, by itself, a state-machine implementation.

### 3. Open-mode privacy

The phrase "derived locally via Glaze AI" is contradictory because Glaze AI processing is not on-device.

For P0:

- Selective remains the real matching path.
- Open should be clearly labeled Preview unless a privacy-safe deterministic implementation is proven.
- No private companion transcript may be sent to Supabase for matching.
- If Glaze AI is ever used to derive a signal, the user must explicitly consent to that processing and preview the result before publication.

### 4. Relay content security and disclosure

TLS and RLS protect access but do not make shared messages, bounded jobs, results, or ledger metadata end-to-end encrypted.

The v3 plan must choose and document one honest model:

- Client-side encryption with key distribution between accepted session members; or
- TLS plus RLS, with explicit disclosure that authorized Supabase infrastructure processes stored content.

In either case it must define:

- Retention defaults.
- TTL or cleanup behavior.
- Deletion semantics.
- Whether completed job inputs and outputs are retained.
- What administrators could technically access.
- What appears in Store disclosures.

### 5. Recoverable identity

Anonymous-first onboarding is appropriate for private exploration, but an unprotected anonymous identity can be lost after sign-out, local-data deletion, or reinstall.

The v3 plan must define:

- A stable anonymous Supabase user on first launch.
- Local session persistence.
- A "Protect your identity" upgrade using email OTP or magic link.
- Preservation of the same `auth.uid()`, memberships, connections, and history after upgrade.
- When protection is recommended or required for real community participation.
- Clear disclosure of what happens if an unprotected identity is lost.
- Whether anonymous users have narrower permissions than protected users.

Do not introduce Better Auth or a second authentication system unless Glaze identifies a concrete P0 requirement that Supabase Auth cannot satisfy.

### 6. Optional Vercel boundary

A Vercel Hobby account is available, but Vercel is not a mandatory dependency.

The v3 plan should:

- Keep Supabase as the Auth, Postgres, RLS, and Realtime foundation.
- Prefer Postgres functions, triggers, or Supabase-native trusted execution when they are sufficient.
- Use Vercel only for minimal trusted endpoints that cannot be implemented safely or reliably in the selected Supabase and Glaze architecture.
- Keep Supabase service-role credentials and all other privileged secrets exclusively in trusted server environment variables.
- Never place privileged credentials in the distributed Folks app.
- State whether Vercel is actually required and what concrete responsibility it owns.
- Avoid duplicating identity, authorization, realtime state, or business logic across services.

## Amendment Prompt for Glaze

```text
Before Build mode, revise the Folks implementation plan to v3 without writing code.

Keep the existing Supabase, text-first, manual-Hermes, Living Orbit, capability-contract, and phased-build decisions. Amend these six areas:

1. Define a secure community bootstrap for anonymous per-install identities: community creation, one-time invitation code or deep link, expiry, single-use behavior, database-enforced membership acceptance, revocation, leaving, and reinstall behavior.

2. Make security-sensitive state transitions database-authoritative. Identify the transactional Postgres functions, triggers, or equivalent server-enforced operations for invitation acceptance, handshake acceptance and terminal states, shared-session creation, resource approval/claim/completion, immutable ledger creation, and revocation. Do not rely on arbitrary client row updates plus RLS alone.

3. Resolve the statement that Open-mode tags are "derived locally via Glaze AI." Glaze AI is not on-device processing. Keep Selective as the real P0 path. Make Open clearly labeled Preview unless a deterministic privacy-safe implementation is proven. Never send private companion transcripts to Supabase for matching. Any future AI-derived signal requires explicit processing consent and user preview before publication.

4. State whether shared messages, resource jobs, results, and ledger metadata use client-side encryption or TLS plus RLS without end-to-end encryption. Define retention, TTL cleanup, deletion semantics, administrator visibility, and exact Store disclosure. Be technically honest.

5. Keep Supabase Auth for P0, using an anonymous-first account model. Create a stable anonymous user on first launch and persist its session locally. Add a "Protect your identity" upgrade using email OTP or magic link that preserves the same auth.uid(), memberships, connections, and history. Explain when protection is recommended or required, what anonymous users may do, and that an unprotected identity may be lost after sign-out, data deletion, or reinstall. Do not introduce Better Auth or a second auth system unless you identify a concrete P0 requirement that Supabase Auth cannot satisfy.

6. Treat Vercel as optional available infrastructure, not a requirement. Keep Supabase as the Auth, Postgres, RLS, and Realtime foundation. Prefer database functions, triggers, or Supabase-native trusted execution where sufficient. Use Vercel only for minimal trusted server endpoints when a concrete security or runtime limitation requires it. Never place a Supabase service-role key or other privileged secret in the distributed Folks app. If Vercel is needed, define its exact responsibility, server-only environment variables, and why the simpler Supabase-only design is insufficient. Avoid duplicating identity, authorization, realtime state, or business logic across services.

Return:
- the revised plan sections;
- schema, RLS, transactional-function, retention, test-plan, and Store-disclosure changes;
- an exact external configuration checklist for Supabase, optional Vercel, two test identities, and the real Hermes endpoint;
- a final go/no-go verdict.

Do not write application code yet.
```

## Build Gate

Build mode may begin when:

- The v3 plan resolves all six amendments.
- The Supabase provisioning requirements are exact.
- The two-install invitation path can be tested.
- Private and Selective network boundaries are unambiguous.
- The relay's access to shared content is accurately disclosed.
