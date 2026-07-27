# Folks Release Checkpoint Audit v9

Date: 2026-07-24

Glaze commits verified:

- `1eb4a5823713b6fcbedcd86bd228fba84282b507` — shared human text and roadmap
- `9dcf439725b896c7b209a05b1a54de30d320bc79` — final sign-out, roadmap-status,
  and departed-session corrections

## Verdict

The frozen first-Store feature slice is implemented and passes its local release
checks. No stretch feature should be added before the hosted relay and
two-instance release test are complete.

## Shipped Slice

- North private AI companion
- Private, Selective, and Open modes
- Anonymous and protected identities
- Communities and invitations
- Realtime presence
- Mutual handshake
- Shared human text sessions
- Static Settings roadmap
- Backend-only Supabase access with RLS and SECURITY DEFINER RPCs

## Final Corrections

1. Ordered sign-out now tears down both community and session Realtime channels
   before the old auth session is dropped.
2. The roadmap now lists shared human text sessions as `Available`.
3. A departed counterpart has an honest read-only chat state with no composer or
   send action.
4. The exhausted Realtime retry state exposes a real `Retry` action.

## Independent Validation

Database:

- Applied schema: unchanged from the previously approved schema.
- Ran the complete current `main/db/schema.tests.sql` against the isolated local
  Supabase PostgreSQL 17.6 stack.
- Result: `NOTICE: ALL TESTS PASSED`, followed by `ROLLBACK`.
- The suite includes the shared-session idempotency assertion relied on by
  `Open Chat`.

Application:

- `npm run build`: exit 0
- `npm run lint` after build: exit 0
- `npm run type-check`: exit 0
- Source worktree: clean
- Running app main window: rendered
- Running Settings window and roadmap: rendered
- Roadmap visibly places `Shared human text sessions` under `Available`

Runtime contract already proven through separate real Supabase clients:

- protected owner and anonymous joiner
- invitation membership
- outsider RLS isolation
- Realtime presence
- Realtime handshake offer and acceptance
- shared-session message delivery and RLS read

## Honest Limitation

The Glaze-managed Store build still has no Supabase URL or public anon key baked
in. The actual chat renderer has therefore not yet been exercised between two
installed Folks copies. The backend contract is real and locally proven, but the
release remains blocked until the hosted configuration and two-device UI run.

## Remaining Release Work

1. Provision one hosted Supabase project.
2. Apply the verified `main/db/schema.sql`.
3. Enable anonymous sign-in and configure production email delivery and URLs.
4. Bake the project URL and public anon key into the release build.
5. Test the complete flow on two Macs.
6. Verify sign-out while chat is open and reconnect/retry behavior.
7. Capture Store screenshots and the one-minute competition demo.
8. Publish through Glaze only after those checks pass.
