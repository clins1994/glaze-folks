-- ============================================================================
-- Folks migration: community-relay schema → P0 ephemeral discovery
--
-- Incremental, IDEMPOTENT upgrade. Apply ONCE to an EXISTING Folks Supabase
-- project (SQL editor, as admin) that is currently on the community-relay
-- schema. Safe to re-run: every statement is `create … if not exists`,
-- `create or replace`, `drop policy if exists`/`create policy`, or an idempotent
-- DO block. It never DROPS a table, never touches auth/*, and performs no
-- destructive change. It does NOT auto-apply to hosted production — run it
-- yourself against the target project.
--
-- This file is kept SYNCHRONIZED with main/db/schema.sql: schema.sql is the full
-- fresh-install source of truth; this file is exactly the discovery delta on top
-- of the community-relay schema. A fresh project should apply schema.sql instead.
--
-- Delta covered:
--   * pg_trgm extension (conservative fuzzy topic-key fallback).
--   * shared_sessions made community-less-capable (nullable handshake/community,
--     + origin, + last_activity_at) so rooms reuse participant-based session RLS.
--   * discovery_topics + recipient-specific discovery_matches tables.
--   * is_generic_key (broad-standalone-only) + is_session_live (room expiry).
--   * Session RLS now enforces discovery-room expiry; discovery RLS added.
--   * RPCs: sync_discovery / dismiss_match / accept_match / clear_discovery /
--     touch_session; post_session_message refreshes activity + rejects expired.
--   * folks_cleanup extended with discovery cleanup.
--   * Ownership transfer (new objects), grants, realtime publication.
-- ============================================================================

-- Trigram similarity — conservative fuzzy fallback for near-identical topic keys.
create extension if not exists pg_trgm with schema extensions;

-- ── shared_sessions: community-less discovery rooms ─────────────────────────
alter table public.shared_sessions alter column handshake_id drop not null;
alter table public.shared_sessions alter column community_id drop not null;
alter table public.shared_sessions add column if not exists origin text not null default 'handshake'
  check (origin in ('handshake', 'discovery'));
alter table public.shared_sessions add column if not exists last_activity_at timestamptz not null default now();

-- ── Discovery tables ────────────────────────────────────────────────────────
create table if not exists public.discovery_topics (
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_key text not null check (char_length(topic_key) between 1 and 80),
  label text not null check (char_length(label) between 1 and 80),
  is_generic boolean not null default false,
  confidence real not null default 0 check (confidence >= 0 and confidence <= 1),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, topic_key)
);

create table if not exists public.discovery_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  other_user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  shared_label text not null check (char_length(shared_label) between 1 and 80),
  shared_count integer not null default 0 check (shared_count >= 0),
  accepted boolean not null default false,
  dismissed boolean not null default false,
  session_id uuid references public.shared_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (user_id <> other_user_id),
  unique (user_id, other_user_id)
);

-- ── Helper functions (new) ──────────────────────────────────────────────────
create or replace function folks_private.is_session_live(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.shared_sessions s
    where s.id = p_session
      and s.origin = 'discovery'
      and s.last_activity_at < now() - interval '10 minutes'
  );
$$;

-- Generic iff EVERY normalized hyphen-token is a broad standalone word (so a
-- composite carrying any specific token stays matchable).
create or replace function folks_private.is_generic_key(p_key text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_key is null or char_length(trim(p_key)) = 0 then true
    else not exists (
      select 1
      from unnest(string_to_array(lower(trim(p_key)), '-')) w
      where char_length(w) > 0
        and w <> all (array[
          'work','life','chat','talk','stuff','things','general','random','misc',
          'programming','coding','code','dev','development','software','tech','technology',
          'help','question','questions','advice','idea','ideas','project','projects',
          'today','day','time','people','fun','hobby','hobbies','learning','study','studying',
          'business','money','job','career','school','food','music','game','games','news'
        ])
    )
  end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.discovery_topics enable row level security;
alter table public.discovery_matches enable row level security;

-- Session reads now also require the discovery room to still be live.
drop policy if exists sessions_select on public.shared_sessions;
create policy sessions_select on public.shared_sessions for select to authenticated
  using (folks_private.is_session_participant(id, (select auth.uid()))
         and folks_private.is_session_live(id));

drop policy if exists session_participants_select on public.session_participants;
create policy session_participants_select on public.session_participants for select to authenticated
  using (folks_private.is_session_participant(session_id, (select auth.uid()))
         and folks_private.is_session_live(session_id));

drop policy if exists session_messages_select on public.session_messages;
create policy session_messages_select on public.session_messages for select to authenticated
  using (folks_private.is_session_participant(session_id, (select auth.uid()))
         and folks_private.is_session_live(session_id));

drop policy if exists discovery_topics_select on public.discovery_topics;
create policy discovery_topics_select on public.discovery_topics for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists discovery_matches_select on public.discovery_matches;
create policy discovery_matches_select on public.discovery_matches for select to authenticated
  using (user_id = (select auth.uid()));

-- ── Write guards / RPCs ──────────────────────────────────────────────────────
create or replace function public.post_session_message(p_session uuid, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not folks_private.is_active_session_participant(p_session, folks_private.current_uid()) then
    raise exception 'You are not an active participant in this session';
  end if;
  if not folks_private.is_session_live(p_session) then raise exception 'This room has expired'; end if;
  if char_length(coalesce(p_content,'')) not between 1 and 4000 then raise exception 'Invalid message'; end if;
  insert into public.session_messages (session_id, sender_id, content) values (p_session, folks_private.current_uid(), p_content) returning id into v_id;
  update public.shared_sessions set last_activity_at = now() where id = p_session;
  return v_id;
end;
$$;

create or replace function public.touch_session(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not folks_private.is_active_session_participant(p_session, folks_private.current_uid()) then
    raise exception 'You are not an active participant in this session';
  end if;
  if not folks_private.is_session_live(p_session) then raise exception 'This room has expired'; end if;
  update public.shared_sessions set last_activity_at = now() where id = p_session;
end;
$$;

create or replace function public.sync_discovery(p_topics jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := folks_private.current_uid();
  v_ttl interval := interval '10 minutes';
  v_min_conf real := 0.5;
  v_topic jsonb;
  v_key text;
  v_label text;
  v_conf real;
  v_has_valid_topics boolean := false;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_topics is null or jsonb_typeof(p_topics) <> 'array' then
    p_topics := '[]'::jsonb;
  end if;

  for v_topic in select * from jsonb_array_elements(p_topics) loop
    v_key := lower(trim(coalesce(v_topic ->> 'key', '')));
    v_label := trim(coalesce(v_topic ->> 'label', ''));
    v_conf := coalesce((v_topic ->> 'confidence')::real, 0);
    if v_key = '' or v_label = '' then continue; end if;
    v_has_valid_topics := true;
    if char_length(v_key) > 80 then v_key := left(v_key, 80); end if;
    if char_length(v_label) > 80 then v_label := left(v_label, 80); end if;
    if v_conf < 0 then v_conf := 0; elsif v_conf > 1 then v_conf := 1; end if;

    insert into public.discovery_topics (user_id, topic_key, label, is_generic, confidence, updated_at, expires_at)
      values (v_uid, v_key, v_label, folks_private.is_generic_key(v_key), v_conf, v_now, v_now + v_ttl)
      on conflict (user_id, topic_key) do update
        set label = excluded.label,
            is_generic = excluded.is_generic,
            confidence = excluded.confidence,
            updated_at = v_now,
            expires_at = excluded.expires_at;
  end loop;

  -- Realtime refreshes call sync_discovery([]). Keep that path read-only so the
  -- refresh cannot emit another discovery_matches update and loop forever.
  if v_has_valid_topics then
    delete from public.discovery_topics where user_id = v_uid and expires_at < v_now;

    with my_keys as (
    select topic_key, label, confidence
    from public.discovery_topics
    where user_id = v_uid and expires_at > v_now and is_generic = false
      and confidence >= v_min_conf
  ),
  their_keys as (
    select t.user_id, t.topic_key
    from public.discovery_topics t
    where t.user_id <> v_uid and t.expires_at > v_now and t.is_generic = false
      and t.confidence >= v_min_conf
  ),
  topic_overlaps as (
    select tk.user_id,
           mk.topic_key as my_key,
           mk.confidence
    from their_keys tk
    join my_keys mk
      on mk.topic_key = tk.topic_key
      or (
        char_length(mk.topic_key) >= 6 and char_length(tk.topic_key) >= 6
        and extensions.similarity(mk.topic_key, tk.topic_key) >= 0.82
      )
  ),
  scored as (
    select o.user_id as other_id,
           count(distinct o.my_key) as shared_count,
           (array_agg(o.my_key order by o.confidence desc, o.my_key))[1] as top_key
    from topic_overlaps o
    group by o.user_id
    having count(distinct o.my_key) >= 1
  ),
  candidates as (
    select s.other_id,
           s.shared_count,
           (select mk.label from my_keys mk where mk.topic_key = s.top_key limit 1) as label
    from scored s
    where not folks_private.is_blocked(v_uid, s.other_id)
      and not folks_private.is_blocked(s.other_id, v_uid)
  )
  insert into public.discovery_matches
    (user_id, other_user_id, score, shared_label, shared_count, updated_at, expires_at)
  select p.u, p.o, p.sc, p.lbl, p.sc, v_now, v_now + v_ttl
  from (
    select v_uid as u, other_id as o, shared_count as sc, label as lbl from candidates
    union all
    select other_id as u, v_uid as o, shared_count as sc, label as lbl from candidates
  ) p
    on conflict (user_id, other_user_id) do update
      set score = excluded.score,
          shared_label = excluded.shared_label,
          shared_count = excluded.shared_count,
          updated_at = v_now,
          expires_at = excluded.expires_at,
          accepted = case when public.discovery_matches.expires_at < v_now then false
                          else public.discovery_matches.accepted end,
          dismissed = case when public.discovery_matches.expires_at < v_now then false
                           else public.discovery_matches.dismissed end,
          session_id = case when public.discovery_matches.expires_at < v_now then null
                            else public.discovery_matches.session_id end;
  end if;

  return jsonb_build_object(
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('key', topic_key, 'label', label, 'generic', is_generic)
                       order by is_generic asc, confidence desc)
      from public.discovery_topics where user_id = v_uid and expires_at > v_now
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'label', m.shared_label, 'score', m.score,
               'accepted', m.accepted, 'sessionId', m.session_id,
               'mutual', (m.session_id is not null))
             order by m.score desc, m.updated_at desc)
      from public.discovery_matches m
      where m.user_id = v_uid and m.dismissed = false and m.expires_at > v_now
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.dismiss_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.discovery_matches
     set dismissed = true, updated_at = now()
   where id = p_match and user_id = folks_private.current_uid();
end;
$$;

create or replace function public.accept_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := folks_private.current_uid();
  v_m public.discovery_matches%rowtype;
  v_other public.discovery_matches%rowtype;
  v_other_uid uuid;
  v_session uuid;
begin
  select other_user_id into v_other_uid
    from public.discovery_matches where id = p_match and user_id = v_uid;
  if v_other_uid is null then raise exception 'Match not found'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(least(v_uid, v_other_uid)::text || greatest(v_uid, v_other_uid)::text, 0)
  );

  select * into v_m from public.discovery_matches where id = p_match and user_id = v_uid for update;
  if not found then raise exception 'Match not found'; end if;
  if v_m.expires_at < now() then raise exception 'This match has expired'; end if;

  update public.discovery_matches set accepted = true, dismissed = false, updated_at = now()
    where id = v_m.id;

  select * into v_other from public.discovery_matches
    where user_id = v_m.other_user_id and other_user_id = v_uid for update;

  if not found or v_other.accepted = false or v_other.expires_at < now() then
    return jsonb_build_object('mutual', false, 'sessionId', null);
  end if;

  v_session := coalesce(v_m.session_id, v_other.session_id);
  if v_session is null then
    insert into public.shared_sessions (origin, ai_mode) values ('discovery', 'human-only') returning id into v_session;
    insert into public.session_participants (session_id, user_id) values (v_session, v_uid), (v_session, v_m.other_user_id);
  end if;

  update public.discovery_matches set session_id = v_session, updated_at = now()
    where id in (v_m.id, v_other.id);

  return jsonb_build_object('mutual', true, 'sessionId', v_session);
end;
$$;

create or replace function public.clear_discovery()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid();
begin
  if v_uid is null then return; end if;
  delete from public.discovery_topics where user_id = v_uid;
end;
$$;

-- ── Cleanup extended with discovery objects ─────────────────────────────────
create or replace function folks_private.folks_cleanup()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.presence where expires_at < now();
  delete from public.signals where expires_at is not null and expires_at < now();
  update public.handshakes set state = 'expired', updated_at = now()
    where state = 'outgoing' and expires_at < now();

  update public.resource_requests
    set job = '{}'::jsonb, result = null
    where state in ('completed', 'failed', 'denied', 'canceled')
      and updated_at < now() - interval '7 days'
      and (job <> '{}'::jsonb or result is not null);

  delete from folks_private.invitation_throttle where window_start < now() - interval '1 hour';

  delete from public.discovery_topics where expires_at < now();
  delete from public.discovery_matches where expires_at < now() and session_id is null;
  delete from public.shared_sessions
    where origin = 'discovery' and last_activity_at < now() - interval '10 minutes';
end;
$$;

-- ── Ownership transfer (NEW objects only; failure-atomic transient CREATE) ──
do $$
declare
  obj text;
  new_tables text[] := array[
    'public.discovery_topics','public.discovery_matches'
  ];
  new_functions text[] := array[
    'public.sync_discovery(jsonb)',
    'public.dismiss_match(uuid)',
    'public.accept_match(uuid)',
    'public.clear_discovery()',
    'public.touch_session(uuid)',
    'folks_private.is_generic_key(text)',
    'folks_private.is_session_live(uuid)'
  ];
begin
  grant create on schema public to folks_definer;
  grant create on schema folks_private to folks_definer;

  foreach obj in array new_tables loop
    execute format('alter table %s owner to folks_definer', obj);
  end loop;
  foreach obj in array new_functions loop
    execute format('alter function %s owner to folks_definer', obj);
  end loop;

  revoke create on schema public from folks_definer;
  revoke create on schema folks_private from folks_definer;
end $$;

-- pg_trgm similarity() is called by sync_discovery (runs as folks_definer).
grant execute on function extensions.similarity(text, text) to folks_definer;

-- ── Grants (least privilege) ────────────────────────────────────────────────
grant select on public.discovery_topics, public.discovery_matches to authenticated;

-- is_session_live is used by the session RLS policies, so clients must execute it.
grant execute on function folks_private.is_session_live(uuid) to authenticated;

grant execute on function
  public.sync_discovery(jsonb),
  public.dismiss_match(uuid),
  public.accept_match(uuid),
  public.clear_discovery(),
  public.touch_session(uuid)
to authenticated;
-- (post_session_message keeps its existing authenticated grant from the base schema.)

-- ── Realtime: add discovery_matches to the change feed ──────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'discovery_matches'
  ) then
    alter publication supabase_realtime add table public.discovery_matches;
  end if;
end $$;
