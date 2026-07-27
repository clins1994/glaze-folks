# Folks Glaze Plan Final Verdict

Reviewed plan: `glaze-generated-plan-final.md`

## Verdict

**GO. Approve the plan and enter Build mode.**

The final revision resolves every blocking consistency issue identified in the v2-v4 audits.

## Confirmed

- Community creation and resource registration require a protected identity and are enforced by database-authoritative functions.
- Ownership can be transferred and communities can be dissolved before a sole owner deletes their identity.
- Invitations use an implementable high-entropy `id.secret` design with password-style hashing, row locking, expiry, revocation, and concurrent single-use enforcement.
- `ledger_entries` are genuinely immutable and contain opaque party identifiers rather than direct user identifiers.
- `ledger_parties` provides the mutable identity mapping. Account deletion nulls the departing user's association and leaves a tombstone without touching immutable ledger entries.
- Ledger RLS resolves access through `ledger_parties`, preserving access for the remaining counterparty and removing it for the deleted identity.
- Anonymous users may join but cannot create communities or contribute resources.
- Account deletion removes the departing user's message content and retains only contentless ordering placeholders where necessary.
- Store disclosure accurately describes Supabase operator visibility, lack of P0 end-to-end encryption, message deletion, de-identified ledger retention, identity recovery, and Open Preview.
- P0 remains Supabase-only with no Vercel, Better Auth, Edge Function, paid voice provider, or second realtime system.

## Non-Blocking Build Gates

Phase 0 must still verify:

1. `@supabase/supabase-js` Realtime compatibility with the Glaze backend runtime.
2. The package version allowed by Glaze's install-age policy.
3. The complete flow across two Macs or two independent macOS users.
4. A real OpenAI-compatible Hermes endpoint through the manual owner configuration.

These are implementation spikes and demo prerequisites, not reasons to revise the plan again.

## Next Action

Approve the plan in Glaze. Build should start with Phase 0 and stop for configuration only when the generated schema requires the Supabase Project URL, publishable key, Auth settings, Realtime publication, `pgcrypto`, and `pg_cron`.
