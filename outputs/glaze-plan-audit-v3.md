# Folks Glaze Plan v3 Final Audit

Reviewed plan: `glaze-generated-plan-v3.md`

## Verdict

Conditional GO. The v3 architecture resolves the six major findings and is suitable for the competition build after three narrow consistency corrections. A new full planning cycle is not required.

## Accepted

- Supabase-only P0 with Auth, Postgres, RLS, Realtime, transactional functions, triggers, and scheduled cleanup.
- Anonymous-first identity with email-OTP protection.
- Database-authoritative security-sensitive transitions.
- Selective as the real path and Open as labeled Preview.
- Honest TLS-plus-RLS disclosure without an E2E claim.
- Manual real Hermes endpoint with local Keychain credentials.
- No Vercel, Better Auth, Edge Functions, paid voice provider, or second realtime system in P0.
- Phase 0 spikes before feature implementation.

## Final Corrections

### 1. Protected ownership must be consistent

The plan says identity protection is required to own a community or contribute a Hermes resource, but elsewhere allows anonymous `create_community` and tells App A to create a community before email protection.

The implementation must:

- Require a protected Supabase identity before `create_community`.
- Require a protected identity before registering or contributing a resource.
- Enforce both requirements in database-authoritative functions, not only the UI.
- Update the demo setup so App A protects its identity before creating the community.
- Define community dissolution or ownership transfer before a sole owner may delete their account.

### 2. Invitation lookup must be implementable

The plan stores a salted invitation-code hash but says acceptance looks the code up by hash. A per-row salt is not known until the row is found.

Use an implementable high-entropy token format such as:

- `invitation_id.secret`;
- look up the non-secret invitation id;
- lock that row;
- compare a password-style hash of the secret in constant time;
- never expose the stored hash or secret;
- retain expiry, revocation, use-count, and concurrency checks.

Glaze may choose an equivalent design if it has the same anti-enumeration and replay properties.

### 3. Deletion and immutable ledger claims must agree

The plan says ledger entries are immutable and retained, while the Store copy says users can delete all server-side data at any time.

The implementation and disclosure must define:

- Which server data is deleted immediately.
- Which minimal ledger metadata is retained.
- Whether retained entries are anonymized or pseudonymized after account deletion.
- What happens to shared records belonging to another participant.
- A Store statement that does not promise deletion of data the system intentionally retains.

## Final Clarification Prompt

```text
The v3 plan resolves the six major audit findings. Before Build mode, amend v3 in place with these three narrow consistency corrections. Do not write code yet and do not start another broad architecture redesign.

1. Protected ownership: the plan says identity protection is required to own a community or contribute a Hermes resource, but the bootstrap and external test flow allow anonymous create_community. Make protection mandatory before create_community and resource registration, enforce it in the database-authoritative functions, and update the two-Mac demo flow so App A protects its identity before creating the community. Define community dissolution or ownership transfer before a sole owner can delete their account.

2. Invitation token implementation: a salted hash cannot be directly looked up without first knowing the row and salt. Specify an implementable high-entropy design, preferably invitation_id.secret: look up and lock the row by non-secret id, then constant-time verify a password-style hash of the secret. Keep expiry, revocation, use-count, anti-enumeration, and concurrent single-use guarantees. An equivalent secure design is acceptable.

3. Deletion consistency: ledger entries are described as immutable and retained, while Store copy promises users can delete server-side data at any time. Define exactly which data is deleted, which minimal ledger metadata remains, whether retained records are anonymized or pseudonymized, how shared records are handled, and revise Store disclosure so it makes no false deletion promise.

Return only:
- the corrected plan passages;
- resulting schema/function/test/disclosure changes;
- confirmation that the final plan remains GO or any new blocker.

Do not write application code yet.
```

## Final Build Gate

After Glaze confirms these corrections, Build mode may begin with Phase 0. The next external action is Supabase provisioning from Glaze's final configuration checklist.
