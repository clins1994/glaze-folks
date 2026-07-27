# Folks Glaze Plan v4 Final Build Gate

Reviewed plan: `glaze-generated-plan-v4.md`

## Verdict

Conditional GO. Glaze correctly resolved protected ownership, invitation lookup, and the Store's false blanket-deletion promise. One implementation contradiction and two stale wording details remain. They can be corrected in place without another architecture cycle.

## Accepted

- Protected identity is database-enforced before community creation and resource contribution.
- Ownership transfer and community dissolution prevent orphaned communities.
- Invitations use an implementable high-entropy `id.secret` format with row locking, password-style hashing, expiry, revocation, and use-count enforcement.
- Personal deletion and retained shared records are now distinguished in the product disclosure.
- The final plan remains Supabase-only for P0, with no Vercel or second authentication system.

## Remaining Build Gate

### 1. Immutable ledger pseudonymization

The plan says the `ledger_entries` trigger rejects every `UPDATE` or `DELETE`, but also says `delete_my_data` replaces a departing user's identifier in those rows. PostgreSQL triggers still run for `SECURITY DEFINER` functions, so both statements cannot be implemented together.

Keep `ledger_entries` truly immutable. A clean implementation is an indirection table such as `ledger_parties`:

- immutable ledger rows reference opaque party IDs;
- the party mapping holds the current `auth.uid()` association;
- `delete_my_data` removes that association and leaves a stable tombstone pseudonym;
- the ledger row itself is never updated or deleted;
- RLS continues to let the remaining counterparty read the record.

An equivalent schema is acceptable if it preserves both genuine immutability and deletion-time de-identification.

### 2. Ownership and message wording

- Change "anonymous users may ... create/join a community" to "join a community"; creation requires a protected identity everywhere.
- Choose one message-deletion behavior. The privacy-favoring default is to delete the departing user's message content while retaining only a contentless tombstone for conversation order. The Store disclosure must then say that placeholders may remain, not that sent messages remain readable.

## Paste-Ready Correction

```text
The revised plan is nearly ready for Build mode. Apply these final consistency corrections in place. Do not redesign the architecture and do not write application code yet.

1. Ledger immutability: the plan's BEFORE UPDATE OR DELETE trigger rejects every ledger mutation, but delete_my_data is also supposed to update ledger rows to pseudonymize a departing user. Resolve this without weakening append-only ledger integrity. Prefer immutable ledger_entries that reference opaque IDs in a separate ledger_parties mapping; delete_my_data removes the auth.uid association and leaves a stable tombstone pseudonym in the mapping while never updating or deleting ledger_entries. An equivalent design is acceptable if ledger entries remain genuinely immutable, the departing user is de-identified, the counterparty retains access, and RLS remains enforceable. Update the schema, delete_my_data description, triggers, RLS, and deletion tests accordingly.

2. Remove the stale statement that anonymous users may create communities; they may join, but create_community and register_resource require a protected identity. Also make message deletion unambiguous: delete the departing user's message content and retain only a contentless tombstone where conversation ordering must remain. Update the Store disclosure so it says contentless placeholders may remain, rather than saying sent messages remain readable.

Return only:
- the corrected passages and affected schema/function/test/disclosure changes;
- confirmation that ledger immutability and deletion now coexist without a trigger bypass;
- a final GO or any blocker.

Do not write application code yet.
```

## Build Readiness

After Glaze applies these corrections, the plan is ready for Build mode. Phase 0 should begin with the Supabase client/realtime compatibility spike before feature implementation.
