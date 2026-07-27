# Folks Release Scope and Runtime Audit v8

Date: 2026-07-24

Glaze commit verified:
`b22d071dc2903ba063314985fbc72e4133ef757a`

## Verdict

The database, identity, community, presence, mutual-handshake, and shared-session
foundation are approved for the final P0 renderer checkpoint.

The remaining Glaze budget should be spent only on the shared human text
experience, an honest Settings roadmap, and the known realtime retry UX
correction. Resource execution, voice, translation, generated themes, payments,
and governance remain post-release work.

## Independent Runtime Verification

Environment:

- Isolated local Supabase development stack
- PostgreSQL 17.6 on ARM64
- Auth, PostgREST, Realtime, and local email capture enabled
- Anonymous sign-in enabled for the beginner identity path
- No hosted project, home server, provider credential, or production account used

Database verification:

1. Applied the exact `main/db/schema.sql` from the Glaze commit.
2. Ran the complete `main/db/schema.tests.sql` with `ON_ERROR_STOP=1`.
3. Result: `NOTICE: ALL TESTS PASSED`, followed by `ROLLBACK`.
4. Confirmed the Realtime publication includes presence, handshakes,
   shared sessions, and session messages.

Real client verification:

1. Created a protected email owner through Supabase Auth.
2. Created a separate anonymous joiner.
3. Confirmed the anonymous identity could not create a community.
4. The owner created a community and single-use invitation.
5. The joiner accepted the invitation.
6. A third outsider could not discover the community through RLS.
7. Both members published and read presence.
8. A presence update arrived over Realtime.
9. The owner sent a handshake; the joiner received it over Realtime.
10. The joiner accepted; the owner received the connected state over Realtime.
11. The owner created a shared session and posted a message.
12. The joiner received the message over Realtime and read it through RLS.

Result: `PASS`.

## Release Scope

Keep for the first Store build:

- North, the private AI companion
- Private, Selective, and Open modes
- Protected and anonymous identities
- Communities and invitations
- Realtime presence
- Mutual handshake
- Shared human text sessions
- Security and privacy foundation
- Settings roadmap

Defer:

- AI participation inside human sessions
- Hermes and shared resource execution
- Slack, Linear, and GitHub discovery
- Voice, video, and live translation
- Generated worlds and themes
- Contribution accounting and payments
- Community governance

## Glaze Checkpoint Sent

Glaze was instructed to:

1. Add a real shared text UI for connected handshakes using the existing
   `create_shared_session` and `post_session_message` RPCs, RLS-readable session
   tables, and Realtime `session_messages`.
2. Keep Supabase access in the main process and send only data-free realtime
   identifiers to the renderer before an identity-scoped refetch.
3. Provide an `Open Chat` action, participant header, human-only state, history,
   loading/empty/error states, bounded composer, send state, and live messages.
4. Add a static Settings roadmap with `Available`, `Next`, and `Planned` groups,
   without dates, percentages, backend state, or fabricated claims.
5. Make the exhausted-retry message truthful by providing a real retry action
   or making the stated reopen action retrigger the subscription.
6. Preserve the verified SQL, RLS model, identity-scoped query keys, ordered
   sign-out, architecture, and backend-only credentials.
7. Run build, lint, and type-check, then stop at a checkpoint before stretch work.

## Release Gate

Before Store submission:

1. Review Glaze's checkpoint diff.
2. Run build, lint, and type-check independently.
3. Configure a non-local Supabase project with production redirect and email
   settings.
4. Run the two-instance flow against that project.
5. Verify no requester can inspect another user's credential or endpoint.
6. Capture the one-minute competition demo and Store screenshots.

