-- ============================================================================
-- Folks — schema tests (run AFTER schema.sql, in the Supabase SQL editor as an
-- admin). Everything runs inside a single transaction and ROLLS BACK, so it
-- leaves no data behind. Each block raises on failure; "ALL TESTS PASSED" prints
-- only if every assertion held.
--
-- Status: these tests are written but NOT YET EXECUTED (no Postgres in the build
-- environment). Run them against a real/local Supabase to get results.
--
-- NOTE: inserting into auth.users is version-sensitive; the minimal column set
-- below works on current Supabase. Adjust if your instance requires more.
-- ============================================================================

begin;

-- Two real auth users: A (protected owner) and B (anonymous member).
insert into auth.users (id, aud, role, email, is_anonymous, email_confirmed_at, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@example.com', false, now(), now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', null, true, null, now(), now());
-- profile bootstrap trigger fills public.users.

-- Helper: act as a given authenticated user (sets the JWT sub claim).
create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_comm uuid; v_code text; v_res uuid; v_req uuid; v_hs uuid; v_hs2 uuid; v_sess uuid;
  v_count int; i int; v_status text; v_owner text; v_unrelated_owner text;
  c uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  d uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  e uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  f uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  g uuid := '11111111-1111-1111-1111-111111111111';
  h uuid := '22222222-2222-2222-2222-222222222222';
  v_disc jsonb; v_match uuid; v_accept jsonb; v_dsess uuid; v_last timestamptz;
  v_match_updated timestamptz; v_match_expires timestamptz;
begin
  -- ── Privilege model ──────────────────────────────────────────────────────
  assert not has_function_privilege('anon', 'public.create_community(text)', 'execute'),
    'anon must NOT execute create_community';
  assert not has_function_privilege('public', 'public.delete_my_data()', 'execute'),
    'PUBLIC must NOT execute delete_my_data';
  assert has_function_privilege('authenticated', 'public.accept_invitation(text)', 'execute'),
    'authenticated must execute accept_invitation';
  assert not has_function_privilege('authenticated', 'folks_private.folks_cleanup()', 'execute'),
    'authenticated must NOT execute folks_cleanup';
  -- Admin-owned auth bridge: only folks_definer may execute it.
  assert not has_function_privilege('authenticated', 'folks_private.is_protected(uuid)', 'execute'),
    'authenticated must NOT execute is_protected';
  assert not has_function_privilege('anon', 'folks_private.is_protected(uuid)', 'execute'),
    'anon must NOT execute is_protected';
  assert has_function_privilege('folks_definer', 'folks_private.is_protected(uuid)', 'execute'),
    'folks_definer must execute is_protected (the auth bridge)';

  -- ── Fresh-install ownership preflight (definer + client schema access) ─────
  -- Run against a database where schema.sql was JUST applied. These assertions
  -- prove the hosted-Supabase-safe transfer sequence succeeded: folks_definer
  -- ended up owning the tables/functions with only USAGE (no standing CREATE) on
  -- the schemas, and folks_private stayed admin-owned.
  assert has_schema_privilege('folks_definer', 'folks_private', 'usage'),
    'folks_definer needs USAGE on folks_private';
  assert has_schema_privilege('folks_definer', 'extensions', 'usage'),
    'folks_definer needs USAGE on extensions';
  assert has_function_privilege('folks_definer', 'extensions.crypt(text, text)', 'execute'),
    'folks_definer needs EXECUTE on pgcrypto crypt()';
  assert has_schema_privilege('authenticated', 'folks_private', 'usage'),
    'authenticated needs USAGE on folks_private (for RLS helpers)';
  -- Final ownership model: TABLES + FUNCTIONS owned by folks_definer, but the
  -- folks_private SCHEMA stays admin-owned (schema ownership is not required).
  assert (select relowner::regrole::text from pg_class where relname = 'communities'
            and relnamespace = 'public'::regnamespace) = 'folks_definer',
    'public tables must be owned by folks_definer';
  assert (select nspowner::regrole::text from pg_namespace where nspname = 'folks_private') <> 'folks_definer',
    'folks_private schema must remain admin-owned (not transferred)';
  -- Least privilege: no standing CREATE retained after the transfer.
  assert not has_schema_privilege('folks_definer', 'public', 'create'),
    'folks_definer must NOT retain CREATE on public';
  assert not has_schema_privilege('folks_definer', 'folks_private', 'create'),
    'folks_definer must NOT retain CREATE on folks_private';

  -- Representative owners: exact Folks tables + functions ended up folks_definer.
  assert (select relowner::regrole::text from pg_class where oid = 'public.ledger_entries'::regclass) = 'folks_definer',
    'ledger_entries must be owned by folks_definer';
  assert (select proowner::regrole::text from pg_proc where oid = 'public.create_community(text)'::regprocedure) = 'folks_definer',
    'create_community must be owned by folks_definer';
  assert (select proowner::regrole::text from pg_proc where oid = 'folks_private.folks_cleanup()'::regprocedure) = 'folks_definer',
    'folks_cleanup must be owned by folks_definer';
  assert (select proowner::regrole::text from pg_proc where oid = 'folks_private.current_uid()'::regprocedure) = 'folks_definer',
    'current_uid must be owned by folks_definer';
  -- The single admin-owned exception: is_protected must NOT be folks_definer.
  assert (select proowner::regrole::text from pg_proc where oid = 'folks_private.is_protected(uuid)'::regprocedure) <> 'folks_definer',
    'is_protected must remain admin-owned (auth bridge)';

  -- ── Allowlist scoping: an UNRELATED public SD function is never taken ─────
  -- The old broad query (nspname='public' and prosecdef) WOULD have grabbed this;
  -- the explicit allowlist must not. Re-run an allowlisted transfer while it exists.
  create function public.__folks_unrelated_sd() returns int language sql security definer as $fn$ select 1 $fn$;
  select proowner::regrole::text into v_unrelated_owner from pg_proc where oid = 'public.__folks_unrelated_sd()'::regprocedure;
  grant create on schema public to folks_definer;
  alter function public.create_community(text) owner to folks_definer;  -- listed
  -- (public.__folks_unrelated_sd is intentionally NOT in the allowlist)
  revoke create on schema public from folks_definer;
  assert (select proowner::regrole::text from pg_proc where oid = 'public.__folks_unrelated_sd()'::regprocedure) = v_unrelated_owner,
    'unrelated public SECURITY DEFINER function must keep its original owner';

  -- ── Failure atomicity: a failing transfer leaves NO transient CREATE ─────
  -- The inner DO grants CREATE then errors; the PL/pgSQL savepoint rolls it back.
  begin
    execute 'do $inner$ begin grant create on schema public to folks_definer; perform 1/0; end $inner$;';
    raise exception 'TEST FAILED: failing transfer block did not error';
  exception when division_by_zero then null; -- expected; grant rolled back with the aborted block
  end;
  assert not has_schema_privilege('folks_definer', 'public', 'create'),
    'a failed transfer must not leave transient CREATE behind';

  -- ── Protected-ownership gate ─────────────────────────────────────────────
  perform pg_temp.act_as(b); -- anonymous
  begin
    perform public.create_community('B Community');
    raise exception 'TEST FAILED: anonymous user created a community';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;

  perform pg_temp.act_as(a); -- protected
  v_comm := public.create_community('A Community');
  assert v_comm is not null, 'protected user should create a community';

  -- ── Invitation: bounds, structured results, single-use ───────────────────
  begin
    perform public.create_invitation(v_comm, interval '90 days', 1);
    raise exception 'TEST FAILED: over-long TTL accepted';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;

  v_code := public.create_invitation(v_comm, interval '7 days', 1);
  perform pg_temp.act_as(b);
  assert (public.accept_invitation(v_code) ->> 'status') = 'joined', 'B should join via invitation';
  -- Reuse of a single-use code returns a generic invalid (no RAISE).
  assert (public.accept_invitation(v_code) ->> 'status') = 'invalid', 'single-use code must not be reusable';

  -- ── Authenticated RLS path reaches a private helper (schema access) ───────
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.communities;  -- RLS calls folks_private.is_active_member
  execute 'reset role';
  assert v_count = 1, 'authenticated B sees exactly their one community via RLS+private helper';

  -- ── Durable invitation throttle (returns commit the counter) ─────────────
  -- Because accept_invitation RETURNS (never RAISEs) for invalid input, the
  -- per-user counter accumulates across calls instead of rolling back each time.
  perform pg_temp.act_as(a);
  for i in 1..10 loop
    v_status := public.accept_invitation('bogus-no-dot') ->> 'status';
    assert v_status = 'invalid', 'attempt ' || i || ' should be invalid';
  end loop;
  v_status := public.accept_invitation('bogus-no-dot') ->> 'status';
  assert v_status = 'rate_limited', '11th attempt in the window must be rate_limited';

  -- ── Handshake: deadline expiry enforced WITHOUT pg_cron ──────────────────
  -- (1) respond_handshake expires a past-deadline offer and COMMITS it: it must
  -- RETURN 'expired' (not RAISE, which would roll the expiry back) so the late
  -- accept is refused AND the row is persisted as expired.
  perform pg_temp.act_as(a);
  v_hs := public.send_handshake(v_comm, b, 'early');
  update public.handshakes set expires_at = now() - interval '1 minute' where id = v_hs; -- stale, still 'outgoing'
  perform pg_temp.act_as(b);
  v_status := public.respond_handshake(v_hs, 'accept');
  assert v_status = 'expired', 'respond_handshake must return expired for a past-deadline offer';
  assert (select state from public.handshakes where id = v_hs) = 'expired',
    'respond_handshake must persist the expired state (RETURN, not RAISE)';
  -- (2) send_handshake lazily expires a stale outgoing offer so it no longer blocks a fresh one.
  perform pg_temp.act_as(a);
  v_hs := public.send_handshake(v_comm, b, 'second');
  update public.handshakes set expires_at = now() - interval '1 minute' where id = v_hs; -- stale, still 'outgoing'
  v_hs2 := public.send_handshake(v_comm, b, 'third'); -- must succeed: the stale offer is lazily expired
  assert (select state from public.handshakes where id = v_hs) = 'expired',
    'send_handshake must lazily expire a stale outgoing offer for the pair';
  assert (select state from public.handshakes where id = v_hs2) = 'outgoing',
    'a fresh handshake must be allowed once the prior offer expired';
  update public.handshakes set state = 'expired' where id = v_hs2; -- reset: no live A<->B offer for downstream tests

  -- ── Handshake: live-uniqueness + UNORDERED (crossed) blocking ────────────
  perform pg_temp.act_as(a);
  v_hs := public.send_handshake(v_comm, b, 'hello');
  begin
    perform public.send_handshake(v_comm, b, 'again'); -- same direction
    raise exception 'TEST FAILED: duplicate live handshake allowed';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  perform pg_temp.act_as(b);
  begin
    perform public.send_handshake(v_comm, a, 'reverse'); -- crossed B->A while A->B is live
    raise exception 'TEST FAILED: reverse-direction live handshake allowed';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;

  -- ── Illegal transition (trigger) ─────────────────────────────────────────
  begin
    update public.handshakes set state = 'connected' where id = v_hs; -- outgoing->connected legal
    update public.handshakes set state = 'outgoing' where id = v_hs;  -- connected->outgoing ILLEGAL
    raise exception 'TEST FAILED: illegal handshake transition accepted';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  update public.handshakes set state = 'connected' where id = v_hs; -- reset for session tests

  -- ── Shared session: departed users cannot write, can still read ──────────
  perform pg_temp.act_as(a);
  v_sess := public.create_shared_session(v_hs);
  -- Idempotent: reopening the same connected handshake returns the SAME session
  -- (the renderer's "Open Chat" calls this unconditionally).
  assert public.create_shared_session(v_hs) = v_sess, 'create_shared_session is idempotent';
  perform public.post_session_message(v_sess, 'hi from A');
  perform public.leave_session(v_sess); -- A departs
  begin
    perform public.post_session_message(v_sess, 'A should be blocked now');
    raise exception 'TEST FAILED: departed user posted a message';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  assert folks_private.is_session_participant(v_sess, a), 'departed user retains read membership';

  -- ── Resource + immutable-ledger creation ─────────────────────────────────
  perform pg_temp.act_as(a);
  v_res := public.register_resource(v_comm, 'A Hermes', 'tailscale');
  perform pg_temp.act_as(b);
  v_req := public.submit_resource_request(v_res, '{"prompt":"hi"}'::jsonb);
  begin
    perform public.submit_resource_request(v_res, jsonb_build_object('blob', repeat('x', 20000)));
    raise exception 'TEST FAILED: oversized job accepted';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;

  perform pg_temp.act_as(a);
  perform public.claim_resource_request(v_req);
  perform public.complete_resource_request(v_req, '{"text":"done"}'::jsonb, '{"tokens":42}'::jsonb);
  select count(*) into v_count from public.ledger_entries where request_id = v_req;
  assert v_count = 1, 'exactly one ledger entry after completion';

  begin
    update public.ledger_entries set outcome = 'tampered' where request_id = v_req;
    raise exception 'TEST FAILED: ledger entry was updated';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  begin
    delete from public.ledger_entries where request_id = v_req;
    raise exception 'TEST FAILED: ledger entry was deleted';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;

  -- ── Retention: cleanup strips terminal payloads (ledger unaffected) ───────
  update public.resource_requests set updated_at = now() - interval '8 days' where id = v_req;
  perform folks_private.folks_cleanup();
  select count(*) into v_count from public.resource_requests
    where id = v_req and job = '{}'::jsonb and result is null;
  assert v_count = 1, 'terminal request payload stripped by cleanup';
  select count(*) into v_count from public.ledger_entries where request_id = v_req;
  assert v_count = 1, 'ledger entry untouched by retention cleanup';

  -- ── Deletion retains ledger; de-identifies requester; drops their request ─
  perform pg_temp.act_as(b);
  perform public.delete_my_data(); -- B leaves
  select count(*) into v_count from public.ledger_entries where request_id = v_req;
  assert v_count = 1, 'ledger entry survives requester deletion';
  select count(*) into v_count from public.resource_requests where id = v_req;
  assert v_count = 0, 'departing requester''s request row (UID + payload) is removed';
  select count(*) into v_count from public.ledger_parties lp
    join public.ledger_entries le on lp.id = le.requester_party
    where le.request_id = v_req and lp.user_id is null and lp.pseudonym = 'removed member';
  assert v_count = 1, 'requester party de-identified (user_id null, tombstone)';

  -- ── Counterparty (owner A) can still resolve BOTH party rows under RLS ────
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into v_count
  from public.ledger_entries le
  join public.ledger_parties lp on lp.id in (le.contributor_party, le.requester_party)
  where le.request_id = v_req;
  execute 'reset role';
  assert v_count = 2, 'owner resolves both party rows (incl. tombstone) under RLS';

  -- ── Dissolution retains ledger ───────────────────────────────────────────
  perform pg_temp.act_as(a);
  perform public.dissolve_community(v_comm);
  select count(*) into v_count from public.ledger_entries where request_id = v_req;
  assert v_count = 1, 'ledger entry survives community dissolution';

  -- ── ledger_parties guard: cannot resurrect / repoint a tombstone ─────────
  begin
    update public.ledger_parties set user_id = a where pseudonym = 'removed member';
    raise exception 'TEST FAILED: tombstone was re-pointed to a user';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;

  -- ══ Discovery (P0 topic matching + ephemeral rooms) ═══════════════════════
  -- Fresh anonymous users, unrelated to the community tests above.
  insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
  values
    (c, 'authenticated', 'authenticated', null, true, now(), now()),
    (d, 'authenticated', 'authenticated', null, true, now(), now()),
    (e, 'authenticated', 'authenticated', null, true, now(), now()),
    (f, 'authenticated', 'authenticated', null, true, now(), now()),
    (g, 'authenticated', 'authenticated', null, true, now(), now()),
    (h, 'authenticated', 'authenticated', null, true, now(), now());

  -- Generic-key classification: deny only broad STANDALONE keys (or all-broad
  -- composites), never a composite that carries a specific token.
  assert folks_private.is_generic_key('work'), 'work must be generic';
  assert folks_private.is_generic_key('life'), 'life must be generic';
  assert folks_private.is_generic_key('chat'), 'chat must be generic';
  assert folks_private.is_generic_key('programming'), 'programming alone must be generic';
  assert folks_private.is_generic_key('work-life'), 'an all-broad composite is generic';
  assert not folks_private.is_generic_key('japanese-grammar'), 'japanese-grammar must be specific';
  assert not folks_private.is_generic_key('japanese-language-learning'),
    'japanese-language-learning must be matchable (has specific tokens)';
  assert not folks_private.is_generic_key('machine-learning'), 'machine-learning must be matchable';
  assert not folks_private.is_generic_key('rust-programming'), 'rust-programming must be matchable';
  assert not folks_private.is_generic_key('video-game-design'), 'video-game-design must be matchable';

  -- C syncs a specific topic + a generic one; no one else is active yet.
  perform pg_temp.act_as(c);
  v_disc := public.sync_discovery('[
    {"key":"japanese-grammar","label":"Japanese grammar","confidence":0.94},
    {"key":"work","label":"Work","confidence":0.5}
  ]'::jsonb);
  assert jsonb_array_length(v_disc -> 'topics') = 2, 'C has 2 active topics';
  assert jsonb_array_length(v_disc -> 'matches') = 0, 'C has no match yet';

  -- D syncs the same specific key -> a recipient-specific record is created for BOTH.
  perform pg_temp.act_as(d);
  v_disc := public.sync_discovery('[
    {"key":"japanese-grammar","label":"Japanese grammar","confidence":0.88}
  ]'::jsonb);
  assert jsonb_array_length(v_disc -> 'matches') = 1, 'D matches C on the shared specific key';
  v_match := (v_disc -> 'matches' -> 0 ->> 'id')::uuid;
  assert (v_disc -> 'matches' -> 0 ->> 'mutual')::boolean = false, 'match starts non-mutual';

  -- Empty syncs are read-only Realtime refreshes. Preserve sentinel timestamps
  -- across repeated reads; the old implementation rewrote these values and
  -- emitted an unbounded discovery_matches UPDATE loop.
  update public.discovery_matches
     set updated_at = now() - interval '2 minutes',
         expires_at = now() + interval '8 minutes'
   where user_id = d and other_user_id = c;
  select updated_at, expires_at into v_match_updated, v_match_expires
    from public.discovery_matches where user_id = d and other_user_id = c;
  perform public.sync_discovery('[]'::jsonb);
  perform public.sync_discovery('[]'::jsonb);
  assert (select updated_at from public.discovery_matches where user_id = d and other_user_id = c)
           = v_match_updated,
    'empty discovery refresh must not change match updated_at';
  assert (select expires_at from public.discovery_matches where user_id = d and other_user_id = c)
           = v_match_expires,
    'empty discovery refresh must not change match expires_at';
  perform pg_temp.act_as(b);
  select count(*) into v_count from public.discovery_matches where user_id = b;
  perform public.sync_discovery('[]'::jsonb);
  assert (select count(*) from public.discovery_matches where user_id = b) = v_count,
    'empty discovery refresh must not create match rows';

  -- C sees the reciprocal record on its next sync.
  perform pg_temp.act_as(c);
  v_disc := public.sync_discovery('[
    {"key":"japanese-grammar","label":"Japanese grammar","confidence":0.94}
  ]'::jsonb);
  assert jsonb_array_length(v_disc -> 'matches') = 1, 'C sees the reciprocal match';

  -- RLS: authenticated D can enumerate ONLY its own match rows, never C''s.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.discovery_matches;
  execute 'reset role';
  assert v_count = 1, 'D reads exactly its own one match record under RLS';

  -- Generic-only overlap must NOT create a match.
  perform pg_temp.act_as(e);
  perform public.sync_discovery('[{"key":"work","label":"Work","confidence":0.6}]'::jsonb);
  perform pg_temp.act_as(f);
  v_disc := public.sync_discovery('[{"key":"work","label":"Work","confidence":0.6}]'::jsonb);
  assert jsonb_array_length(v_disc -> 'matches') = 0, 'generic-only overlap must not match';

  -- Mutual acceptance opens exactly one shared room, linked to both records.
  perform pg_temp.act_as(c);
  v_accept := public.accept_match((select id from public.discovery_matches where user_id = c and other_user_id = d));
  assert (v_accept ->> 'mutual')::boolean = false, 'first accept is not yet mutual';
  perform pg_temp.act_as(d);
  v_accept := public.accept_match((select id from public.discovery_matches where user_id = d and other_user_id = c));
  assert (v_accept ->> 'mutual')::boolean = true, 'second accept is mutual';
  v_dsess := (v_accept ->> 'sessionId')::uuid;
  assert v_dsess is not null, 'mutual acceptance yields a room';
  select count(*) into v_count from public.discovery_matches where user_id in (c, d) and session_id = v_dsess;
  assert v_count = 2, 'both match records point at the one room';
  select count(*) into v_count from public.session_participants where session_id = v_dsess;
  assert v_count = 2, 'both users are room participants';
  assert (select origin from public.shared_sessions where id = v_dsess) = 'discovery', 'room origin is discovery';

  -- Posting a message is allowed for an active participant and refreshes activity.
  perform pg_temp.act_as(c);
  update public.shared_sessions set last_activity_at = now() - interval '5 minutes' where id = v_dsess;
  perform public.post_session_message(v_dsess, 'hello');
  select last_activity_at into v_last from public.shared_sessions where id = v_dsess;
  assert v_last > now() - interval '1 minute', 'posting refreshes room activity clock';

  -- "Not now" hides the match from the caller's own live sync results (C's only
  -- match is to D, so dismissing it leaves zero live matches) while the row stays.
  perform pg_temp.act_as(c);
  perform public.dismiss_match((select id from public.discovery_matches where user_id = c and other_user_id = d));
  v_disc := public.sync_discovery('[{"key":"japanese-grammar","label":"Japanese grammar","confidence":0.94}]'::jsonb);
  assert jsonb_array_length(v_disc -> 'matches') = 0, 'a dismissed match is excluded from live matches';
  assert exists (select 1 from public.discovery_matches where user_id = c and other_user_id = d and dismissed),
    'the dismissed match record still exists (only hidden)';

  -- ── Low-confidence topics never create a match (req: ignore low-confidence) ──
  perform pg_temp.act_as(e);
  perform public.sync_discovery('[{"key":"kite-surfing","label":"Kite surfing","confidence":0.3}]'::jsonb);
  perform pg_temp.act_as(f);
  v_disc := public.sync_discovery('[{"key":"kite-surfing","label":"Kite surfing","confidence":0.3}]'::jsonb);
  assert jsonb_array_length(v_disc -> 'matches') = 0, 'low-confidence shared key must not match';
  -- Both confident on the same specific key → they now match.
  perform pg_temp.act_as(e);
  perform public.sync_discovery('[{"key":"kite-surfing","label":"Kite surfing","confidence":0.9}]'::jsonb);
  perform pg_temp.act_as(f);
  v_disc := public.sync_discovery('[{"key":"kite-surfing","label":"Kite surfing","confidence":0.9}]'::jsonb);
  assert jsonb_array_length(v_disc -> 'matches') = 1, 'a confident shared specific key matches';

  -- ── Trigram fallback is genuinely conservative (req 3) ──────────────────────
  -- g/h are a fresh pair: 'rust-programming' must NOT fuzzily match
  -- 'ruby-programming' (different subject, only a shared suffix).
  perform pg_temp.act_as(g);
  perform public.sync_discovery('[{"key":"rust-programming","label":"Rust programming","confidence":0.9}]'::jsonb);
  perform pg_temp.act_as(h);
  v_disc := public.sync_discovery('[{"key":"ruby-programming","label":"Ruby programming","confidence":0.9}]'::jsonb);
  assert jsonb_array_length(v_disc -> 'matches') = 0, 'conservative trigram must not match rust vs ruby programming';
  -- Sanity: an EXACT shared specific key DOES match g/h — proving it was the
  -- trigram being conservative above, not some unrelated block.
  perform pg_temp.act_as(h);
  v_disc := public.sync_discovery('[
    {"key":"ruby-programming","label":"Ruby programming","confidence":0.9},
    {"key":"rust-programming","label":"Rust programming","confidence":0.9}
  ]'::jsonb);
  assert jsonb_array_length(v_disc -> 'matches') = 1, 'an exact shared specific key matches g/h';

  -- ── Discovery-room expiry enforced by RLS + write guards, not by cleanup ─────
  -- Force c/d's room past its 10-minute inactivity window.
  update public.shared_sessions set last_activity_at = now() - interval '11 minutes' where id = v_dsess;
  -- Writes are rejected and cannot revive the room.
  perform pg_temp.act_as(c);
  begin
    perform public.post_session_message(v_dsess, 'still around?');
    raise exception 'TEST FAILED: posted into an expired room';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  begin
    perform public.touch_session(v_dsess);
    raise exception 'TEST FAILED: revived an expired room via touch';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  select last_activity_at into v_last from public.shared_sessions where id = v_dsess;
  assert v_last < now() - interval '10 minutes', 'a rejected write must not revive the room clock';
  -- RLS: an expired discovery room, its participants, and its messages are all
  -- unreadable even to a participant.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.shared_sessions where id = v_dsess;
  assert v_count = 0, 'expired discovery room is unreadable via RLS';
  select count(*) into v_count from public.session_messages where session_id = v_dsess;
  assert v_count = 0, 'expired room messages are unreadable via RLS';
  select count(*) into v_count from public.session_participants where session_id = v_dsess;
  assert v_count = 0, 'expired room participants are unreadable via RLS';
  execute 'reset role';

  -- ── accept_match requires BOTH reciprocal records unexpired (req 1) ─────────
  -- Reuse c/d's records: c's is dismissed, d's is live. Force-expire d's side and
  -- have c re-accept → must NOT reopen a room against an expired counterpart.
  update public.discovery_matches set accepted = true, dismissed = false, session_id = null, expires_at = now() + interval '10 minutes'
    where user_id = c and other_user_id = d;
  update public.discovery_matches set expires_at = now() - interval '1 minute'
    where user_id = d and other_user_id = c;
  perform pg_temp.act_as(c);
  v_accept := public.accept_match((select id from public.discovery_matches where user_id = c and other_user_id = d));
  assert (v_accept ->> 'mutual')::boolean = false, 'accept against an expired counterpart is not mutual';
  assert (v_accept ->> 'sessionId') is null, 'no room opens against an expired counterpart';

  -- ── Match lifecycle resets when a LAPSED pair matches again (req 4) ─────────
  -- Give e's record accepted+dismissed+a stale session, expire BOTH e/f records,
  -- then let them match again on the same specific key.
  update public.discovery_matches
    set accepted = true, dismissed = true, session_id = v_dsess
    where user_id = e and other_user_id = f;
  update public.discovery_matches set expires_at = now() - interval '1 minute'
    where user_id in (e, f) and other_user_id in (e, f);
  perform pg_temp.act_as(e);
  perform public.sync_discovery('[{"key":"kite-surfing","label":"Kite surfing","confidence":0.9}]'::jsonb);
  perform pg_temp.act_as(f);
  perform public.sync_discovery('[{"key":"kite-surfing","label":"Kite surfing","confidence":0.9}]'::jsonb);
  assert (select accepted from public.discovery_matches where user_id = e and other_user_id = f) = false,
    'a re-match after expiry resets accepted';
  assert (select dismissed from public.discovery_matches where user_id = e and other_user_id = f) = false,
    'a re-match after expiry resets dismissed';
  assert (select session_id from public.discovery_matches where user_id = e and other_user_id = f) is null,
    'a re-match after expiry clears the stale session';

  raise notice 'ALL TESTS PASSED';
end $$;

rollback;
