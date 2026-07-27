-- ============================================================================
-- Folks — Supabase schema (v3.1, security- & lifecycle-hardened)
--
-- Apply ONCE to the Supabase project as an admin (the SQL editor runs as
-- `postgres`). Idempotent where practical. NOT compiled into the app.
--
-- Ownership / privilege model (least privilege):
--   * A dedicated non-login role `folks_definer` OWNS every Folks table and
--     every SECURITY DEFINER function EXCEPT the one admin-owned auth bridge
--     (see below). Because a table owner is exempt from its own RLS (we never
--     FORCE RLS), the SECURITY DEFINER functions read/write freely and RLS
--     helper functions do not recurse — WITHOUT granting any superuser/BYPASSRLS
--     attribute. `folks_definer` is not a superuser and holds NO `auth` access.
--   * The caller id is read from the request JWT via folks_private.current_uid()
--     (no `auth` schema access). The ONLY code that reads `auth.users` is the
--     narrow, admin-owned (`postgres`) folks_private.is_protected() bridge, whose
--     EXECUTE is granted solely to folks_definer. This is deliberate: hosted
--     Supabase's `postgres` cannot grant folks_definer USAGE on the
--     supabase_admin-owned `auth` schema, so a folks_definer-owned function
--     cannot touch `auth` at all.
--   * Clients (`authenticated`) get: SELECT on tables (RLS-filtered), EXECUTE on
--     the explicit client RPCs only, and USAGE+EXECUTE on the RLS helper
--     functions in schema `folks_private` (which PostgREST does NOT expose as
--     RPCs). Helpers, trigger functions, cleanup, and is_protected are never
--     client RPCs.
--   * EXECUTE is revoked from PUBLIC and anon on public functions.
--
-- Ledger design (append-only + deletion-compatible):
--   * `ledger_entries` are immutable (BEFORE UPDATE OR DELETE trigger rejects
--     all mutation) and hold NON-cascading identifier SNAPSHOTS (community_id,
--     resource_id, request_id, resource_name) with NO foreign keys to those
--     parents — so deleting a community/resource/request never cascades into
--     the ledger. The only FKs are to `ledger_parties`, which is never deleted,
--     only de-identified. Thus delete_my_data and dissolve_community both
--     succeed with historical ledger entries intact and perform ZERO
--     UPDATE/DELETE on ledger_entries.
-- ============================================================================

-- ── Roles & schemas ────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'folks_definer') then
    create role folks_definer nologin;
  end if;
  -- Allow the current admin role to reassign ownership to folks_definer.
  execute format('grant folks_definer to %I', current_user);
end $$;

create schema if not exists folks_private;
create extension if not exists pgcrypto with schema extensions;
-- Trigram similarity — conservative fuzzy fallback for discovery topic keys
-- (spelling / plurality / small wording variations). Exact key overlap is primary.
create extension if not exists pg_trgm with schema extensions;

-- ============================================================================
-- Tables (with bounded-input CHECK constraints)
-- ============================================================================

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'left', 'revoked')),
  joined_at timestamptz not null default now(),
  unique (community_id, user_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  secret_hash text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  used_count integer not null default 0 check (used_count >= 0),
  revoked_at timestamptz
);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  category text not null check (char_length(category) between 1 and 40),
  text text not null check (char_length(text) between 1 and 280),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.presence (
  user_id uuid not null references auth.users (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  mode text not null check (mode in ('selective', 'open')),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, community_id)
);

create table if not exists public.handshakes (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  initiator_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  state text not null default 'outgoing'
    check (state in ('outgoing', 'connected', 'nearby', 'deferred', 'declined', 'blocked', 'expired')),
  intro text check (intro is null or char_length(intro) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (initiator_id <> recipient_id)
);

-- Race-safe: at most one live handshake per UNORDERED pair (blocks simultaneous
-- A->B and B->A). Uses least()/greatest() so direction doesn't matter.
create unique index if not exists handshakes_active_uidx
  on public.handshakes (community_id, least(initiator_id, recipient_id), greatest(initiator_id, recipient_id))
  where state in ('outgoing', 'connected', 'nearby');

create table if not exists public.shared_sessions (
  id uuid primary key default gen_random_uuid(),
  -- Legacy community handshake rooms set handshake_id + community_id. Ephemeral
  -- global-discovery rooms (P0) leave both NULL and set origin='discovery'. The
  -- unique index still forbids two rooms for the same handshake (NULLs distinct).
  handshake_id uuid unique references public.handshakes (id) on delete cascade,
  community_id uuid references public.communities (id) on delete cascade,
  origin text not null default 'handshake' check (origin in ('handshake', 'discovery')),
  ai_mode text not null default 'human-only' check (ai_mode in ('human-only', 'quiet-notes', 'on-demand')),
  created_at timestamptz not null default now(),
  -- Room inactivity clock: refreshed on each message + heartbeat while either
  -- participant stays active. Discovery rooms expire ~10 min after last activity.
  last_activity_at timestamptz not null default now()
);
-- Idempotent upgrades for an already-provisioned schema (no-ops on fresh apply).
alter table public.shared_sessions alter column handshake_id drop not null;
alter table public.shared_sessions alter column community_id drop not null;
alter table public.shared_sessions add column if not exists origin text not null default 'handshake'
  check (origin in ('handshake', 'discovery'));
alter table public.shared_sessions add column if not exists last_activity_at timestamptz not null default now();

-- ── Ephemeral discovery (P0 topic matching) ─────────────────────────────────
-- Only AI-DERIVED topic labels/keys are stored here — never the transcript.
-- Logical expiry via expires_at (10-min inactivity TTL, refreshed each active
-- turn); physical cleanup is opportunistic (folks_cleanup / read-time filters).
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

-- Recipient-specific match records: TWO rows per match (one owned by each user),
-- each readable ONLY by its owner. No enumeration of others' matches or raw
-- signals. Mutual acceptance = both sides' `accepted` = true.
create table if not exists public.discovery_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,       -- owner/recipient of this record
  other_user_id uuid not null references auth.users (id) on delete cascade, -- the matched counterpart
  score integer not null default 0 check (score >= 0),
  shared_label text not null check (char_length(shared_label) between 1 and 80),
  shared_count integer not null default 0 check (shared_count >= 0),
  accepted boolean not null default false,   -- this owner tapped Connect
  dismissed boolean not null default false,  -- this owner tapped Not now
  session_id uuid references public.shared_sessions (id) on delete set null, -- room, once both accept
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (user_id <> other_user_id),
  unique (user_id, other_user_id)
);

create table if not exists public.session_participants (
  session_id uuid not null references public.shared_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'departed')),
  primary key (session_id, user_id)
);

create table if not exists public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.shared_sessions (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  content text check (content is null or char_length(content) <= 4000),
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  locality text not null check (locality in ('local', 'lan', 'tailscale', 'remote')),
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  created_at timestamptz not null default now()
);

create table if not exists public.resource_requests (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  state text not null default 'submitted'
    check (state in ('submitted', 'needs_approval', 'approved', 'denied', 'capped',
                     'executing', 'completed', 'failed', 'canceled')),
  job jsonb not null check (pg_column_size(job) <= 16384),
  result jsonb check (result is null or pg_column_size(result) <= 65536),
  usage jsonb check (usage is null or pg_column_size(usage) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Opaque party mapping — the ONLY place a ledger actor's identity lives.
create table if not exists public.ledger_parties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  pseudonym text not null check (char_length(pseudonym) between 1 and 60)
);

-- Immutable, append-only. Parents are NON-cascading identifier snapshots
-- (no FKs to community/resource/request) so parent deletion never touches this.
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  resource_id uuid not null,
  request_id uuid not null,
  resource_name text not null,
  contributor_party uuid not null references public.ledger_parties (id),
  requester_party uuid not null references public.ledger_parties (id),
  decision text not null check (decision in ('allowed', 'denied')),
  outcome text not null check (char_length(outcome) <= 200),
  usage jsonb check (usage is null or pg_column_size(usage) <= 8192),
  created_at timestamptz not null default now()
);

-- Durable per-user throttle for invitation-accept attempts (private). A locked
-- time-bucket counter that COMMITS on structured (non-raising) outcomes.
create table if not exists folks_private.invitation_throttle (
  user_id uuid primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);

-- ── Indexes for RLS/FK lookups ──────────────────────────────────────────────
create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_community_idx on public.memberships (community_id);
create index if not exists invitations_community_idx on public.invitations (community_id);
create index if not exists signals_community_idx on public.signals (community_id);
create index if not exists signals_user_idx on public.signals (user_id);
create index if not exists presence_community_idx on public.presence (community_id);
create index if not exists handshakes_initiator_idx on public.handshakes (initiator_id);
create index if not exists handshakes_recipient_idx on public.handshakes (recipient_id);
create index if not exists handshakes_community_idx on public.handshakes (community_id);
create index if not exists session_participants_user_idx on public.session_participants (user_id);
create index if not exists session_messages_session_idx on public.session_messages (session_id);
create index if not exists session_messages_sender_idx on public.session_messages (sender_id);
create index if not exists resources_community_idx on public.resources (community_id);
create index if not exists resources_owner_idx on public.resources (owner_id);
create index if not exists resource_requests_resource_idx on public.resource_requests (resource_id);
create index if not exists resource_requests_requester_idx on public.resource_requests (requester_id);
create index if not exists ledger_entries_contributor_idx on public.ledger_entries (contributor_party);
create index if not exists ledger_entries_requester_idx on public.ledger_entries (requester_party);
create index if not exists ledger_parties_user_idx on public.ledger_parties (user_id);
create index if not exists invitation_throttle_window_idx on folks_private.invitation_throttle (window_start);
create index if not exists discovery_topics_key_idx on public.discovery_topics (topic_key);
create index if not exists discovery_topics_expires_idx on public.discovery_topics (expires_at);
-- Trigram index for the conservative fuzzy fallback across other users' keys.
create index if not exists discovery_topics_key_trgm_idx on public.discovery_topics using gin (topic_key extensions.gin_trgm_ops);
create index if not exists discovery_matches_other_idx on public.discovery_matches (other_user_id);
create index if not exists discovery_matches_expires_idx on public.discovery_matches (expires_at);
create index if not exists shared_sessions_activity_idx on public.shared_sessions (last_activity_at) where origin = 'discovery';

-- ============================================================================
-- Private helper functions (SECURITY DEFINER; used by RLS; not client RPCs).
-- Owned by folks_definer (table owner) => bypass RLS => no policy recursion.
-- ============================================================================

-- Caller's user id from the request JWT, WITHOUT touching the `auth` schema.
-- On hosted Supabase the SQL-editor `postgres` role cannot grant folks_definer
-- USAGE on the supabase_admin-owned `auth` schema, so folks_definer-owned
-- SECURITY DEFINER functions cannot call `auth.uid()`. This reads the JWT sub
-- claim directly (new `request.jwt.claims` JSON, with the legacy
-- `request.jwt.claim.sub` GUC as a fallback). Owned by folks_definer.
create or replace function folks_private.current_uid()
returns uuid language sql stable set search_path = '' as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;

-- ADMIN-OWNED AUTH BRIDGE (the single exception to folks_definer ownership).
-- Reads auth.users, which requires `auth` access folks_definer cannot hold, so
-- this stays owned by the admin role (`postgres`). It is a narrow, pinned-path,
-- read-only check; EXECUTE is granted ONLY to folks_definer (see grants below),
-- and it is NOT in the ownership allowlist.
create or replace function folks_private.is_protected(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_uid and coalesce(u.is_anonymous, false) = false and u.email is not null
  );
$$;

create or replace function folks_private.is_active_member(p_community uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.community_id = p_community and m.user_id = p_uid and m.status = 'active'
  );
$$;

create or replace function folks_private.is_community_owner(p_community uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.community_id = p_community and m.user_id = p_uid and m.role = 'owner' and m.status = 'active'
  );
$$;

create or replace function folks_private.shares_community(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships ma
    join public.memberships mb on ma.community_id = mb.community_id
    where ma.user_id = p_a and mb.user_id = p_b and ma.status = 'active' and mb.status = 'active'
  );
$$;

-- Historical read access: any participant row (active OR departed).
create or replace function folks_private.is_session_participant(p_session uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_participants sp where sp.session_id = p_session and sp.user_id = p_uid
  );
$$;

-- Active participation: required to WRITE (post, change AI mode).
create or replace function folks_private.is_active_session_participant(p_session uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_participants sp
    where sp.session_id = p_session and sp.user_id = p_uid and sp.status = 'active'
  );
$$;

-- A discovery room is "live" only within its 10-minute inactivity window. Legacy
-- handshake rooms never expire this way (origin='handshake'). This is the single
-- source of truth for room expiry: RLS uses it so an expired discovery room (and
-- its participants + messages) becomes UNREADABLE, and the write guards use it so
-- post_session_message / touch_session reject and never revive an expired room —
-- correctness no longer depends on folks_cleanup having run.
create or replace function folks_private.is_session_live(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.shared_sessions s
    where s.id = p_session
      and s.origin = 'discovery'
      and s.last_activity_at < now() - interval '10 minutes'
  );
$$;

create or replace function folks_private.is_resource_owner(p_resource uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.resources r where r.id = p_resource and r.owner_id = p_uid);
$$;

create or replace function folks_private.is_blocked(p_by uuid, p_target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks b where b.blocker_id = p_by and b.blocked_id = p_target);
$$;

-- Is p_uid a party to the entry that references p_party (used by ledger_entries RLS).
create or replace function folks_private.is_ledger_party(p_contributor uuid, p_requester uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ledger_parties lp
    where lp.id in (p_contributor, p_requester) and lp.user_id = p_uid
  );
$$;

-- Can p_uid read this specific party row? Yes iff they are a party to some entry
-- that references it (lets either party resolve BOTH party rows, including a
-- de-identified tombstone whose user_id is NULL), without exposing to others.
create or replace function folks_private.can_read_party(p_party uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ledger_entries le
    where (le.contributor_party = p_party or le.requester_party = p_party)
      and exists (
        select 1 from public.ledger_parties lp
        where lp.id in (le.contributor_party, le.requester_party) and lp.user_id = p_uid
      )
  );
$$;

-- A topic key is "generic" only if EVERY one of its normalized hyphen-tokens is a
-- broad standalone word — i.e. the key carries no specific subject of its own.
-- A single broad word ('work','life','chat','programming') is generic, and so is
-- an all-broad composite ('work-life'); but a composite that includes ANY specific
-- token stays matchable: 'machine-learning', 'rust-programming',
-- 'japanese-language-learning', and 'video-game-design' are NOT generic, because
-- 'machine'/'rust'/'japanese'/'language'/'video'/'design' are specific. Owned by
-- folks_definer.
create or replace function folks_private.is_generic_key(p_key text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_key is null or char_length(trim(p_key)) = 0 then true
    else not exists (
      -- exists a token that is a SPECIFIC (non-broad, non-empty) word → not generic
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

-- ============================================================================
-- Row-Level Security: enable everywhere; SELECT-only for clients.
-- ============================================================================

alter table public.users enable row level security;
alter table public.communities enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.blocks enable row level security;
alter table public.signals enable row level security;
alter table public.presence enable row level security;
alter table public.handshakes enable row level security;
alter table public.shared_sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.session_messages enable row level security;
alter table public.resources enable row level security;
alter table public.resource_requests enable row level security;
alter table public.ledger_parties enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.discovery_topics enable row level security;
alter table public.discovery_matches enable row level security;

drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid()) or folks_private.shares_community((select auth.uid()), id));

drop policy if exists communities_select on public.communities;
create policy communities_select on public.communities for select to authenticated
  using (folks_private.is_active_member(id, (select auth.uid())));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or folks_private.is_active_member(community_id, (select auth.uid())));

-- invitations: intentionally NO select policy (no enumeration surface).

drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

drop policy if exists signals_select on public.signals;
create policy signals_select on public.signals for select to authenticated
  using (folks_private.is_active_member(community_id, (select auth.uid())));

drop policy if exists presence_select on public.presence;
create policy presence_select on public.presence for select to authenticated
  using (folks_private.is_active_member(community_id, (select auth.uid())));

drop policy if exists handshakes_select on public.handshakes;
create policy handshakes_select on public.handshakes for select to authenticated
  using (initiator_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- Participants only, AND (for discovery rooms) only while still within the 10-min
-- inactivity window — an expired discovery room, its participants, and its messages
-- all become unreadable through RLS even before physical cleanup runs.
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

drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources for select to authenticated
  using (folks_private.is_active_member(community_id, (select auth.uid())));

drop policy if exists resource_requests_select on public.resource_requests;
create policy resource_requests_select on public.resource_requests for select to authenticated
  using (requester_id = (select auth.uid()) or folks_private.is_resource_owner(resource_id, (select auth.uid())));

drop policy if exists ledger_parties_select on public.ledger_parties;
create policy ledger_parties_select on public.ledger_parties for select to authenticated
  using (folks_private.can_read_party(id, (select auth.uid())));

drop policy if exists ledger_entries_select on public.ledger_entries;
create policy ledger_entries_select on public.ledger_entries for select to authenticated
  using (folks_private.is_ledger_party(contributor_party, requester_party, (select auth.uid())));

-- Discovery: a user reads ONLY their own topics and their own match records —
-- never another user's raw signals or matches (global-discovery privacy).
drop policy if exists discovery_topics_select on public.discovery_topics;
create policy discovery_topics_select on public.discovery_topics for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists discovery_matches_select on public.discovery_matches;
create policy discovery_matches_select on public.discovery_matches for select to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================
-- Profile bootstrap (auto-create public.users on auth signup, incl. anonymous)
-- ============================================================================

create or replace function folks_private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function folks_private.handle_new_user();

create or replace function public.set_display_name(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if folks_private.current_uid() is null then raise exception 'Not authenticated'; end if;
  if p_name is not null and char_length(p_name) > 60 then raise exception 'Display name too long'; end if;
  insert into public.users (id, display_name) values (folks_private.current_uid(), p_name)
    on conflict (id) do update set display_name = excluded.display_name;
end;
$$;

-- ============================================================================
-- Community bootstrap + ownership (database-authoritative)
-- ============================================================================

create or replace function public.create_community(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_name is null or char_length(p_name) not between 1 and 80 then raise exception 'Invalid community name'; end if;
  if not folks_private.is_protected(v_uid) then
    raise exception 'A protected identity (verified email) is required to create a community';
  end if;
  insert into public.communities (name, created_by) values (p_name, v_uid) returning id into v_id;
  insert into public.memberships (community_id, user_id, role, status) values (v_id, v_uid, 'owner', 'active');
  return v_id;
end;
$$;

create or replace function public.create_invitation(p_community uuid, p_ttl interval default interval '7 days', p_max_uses integer default 1)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid(); v_id uuid; v_secret text;
begin
  if not folks_private.is_community_owner(p_community, v_uid) then
    raise exception 'Only the community owner can create invitations';
  end if;
  if p_ttl < interval '5 minutes' or p_ttl > interval '30 days' then raise exception 'TTL out of range'; end if;
  if p_max_uses < 1 or p_max_uses > 100 then raise exception 'max_uses out of range'; end if;

  v_secret := encode(extensions.gen_random_bytes(18), 'hex');
  insert into public.invitations (community_id, secret_hash, created_by, expires_at, max_uses)
    values (p_community, extensions.crypt(v_secret, extensions.gen_salt('bf')), v_uid, now() + p_ttl, p_max_uses)
    returning id into v_id;
  -- Returned ONCE. `id` is non-secret; `secret` is never stored in plaintext.
  return v_id::text || '.' || v_secret;
end;
$$;

-- Returns a STRUCTURED jsonb result (never RAISEs for expected outcomes) so the
-- throttle counter commits even for invalid/rate-limited attempts:
--   {"status":"joined","community_id":<uuid>}
--   {"status":"already_member","community_id":<uuid>}
--   {"status":"invalid"}          -- generic for ALL invalid reasons (anti-enumeration)
--   {"status":"rate_limited"}
-- Only truly unexpected conditions (not authenticated) RAISE.
create or replace function public.accept_invitation(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := folks_private.current_uid(); v_dot int; v_id uuid; v_secret text;
  v_inv public.invitations%rowtype; v_window timestamptz; v_attempts int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- Durable, locked per-user throttle. Ensure a row, lock it, then count within
  -- a 1-minute window. Because we RETURN (not RAISE) below, this INSERT/UPDATE
  -- commits with the outcome — invalid attempts still increment the counter.
  insert into folks_private.invitation_throttle (user_id, window_start, attempts)
    values (v_uid, now(), 0)
    on conflict (user_id) do nothing;
  select window_start, attempts into v_window, v_attempts
    from folks_private.invitation_throttle where user_id = v_uid for update;
  if v_window < now() - interval '1 minute' then
    v_window := now(); v_attempts := 0;
  end if;
  v_attempts := v_attempts + 1;
  update folks_private.invitation_throttle
    set window_start = v_window, attempts = v_attempts where user_id = v_uid;
  if v_attempts > 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if p_code is null or char_length(p_code) > 200 then return jsonb_build_object('status', 'invalid'); end if;
  v_dot := position('.' in p_code);
  if v_dot < 2 then return jsonb_build_object('status', 'invalid'); end if;
  begin
    v_id := substring(p_code from 1 for v_dot - 1)::uuid;
  exception when others then return jsonb_build_object('status', 'invalid'); end;
  v_secret := substring(p_code from v_dot + 1);

  select * into v_inv from public.invitations where id = v_id for update;
  if not found
     or v_inv.revoked_at is not null
     or v_inv.expires_at < now()
     or v_inv.used_count >= v_inv.max_uses
     or extensions.crypt(v_secret, v_inv.secret_hash) <> v_inv.secret_hash then
    return jsonb_build_object('status', 'invalid');
  end if;
  if folks_private.is_active_member(v_inv.community_id, v_uid) then
    return jsonb_build_object('status', 'already_member', 'community_id', v_inv.community_id);
  end if;

  insert into public.memberships (community_id, user_id, role, status)
    values (v_inv.community_id, v_uid, 'member', 'active')
    on conflict (community_id, user_id) do update set status = 'active', role = 'member';
  update public.invitations set used_count = used_count + 1 where id = v_id;
  return jsonb_build_object('status', 'joined', 'community_id', v_inv.community_id);
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.invitations set revoked_at = now()
  where id = p_invitation and folks_private.is_community_owner(community_id, folks_private.current_uid());
  if not found then raise exception 'Not permitted'; end if;
end;
$$;

create or replace function public.revoke_membership(p_community uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid();
begin
  if not folks_private.is_community_owner(p_community, v_uid) then raise exception 'Only the owner can revoke members'; end if;
  if p_user = v_uid then raise exception 'Use transfer_ownership or dissolve_community instead'; end if;
  update public.memberships set status = 'revoked' where community_id = p_community and user_id = p_user;
end;
$$;

create or replace function public.leave_community(p_community uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid();
begin
  if folks_private.is_community_owner(p_community, v_uid) then
    raise exception 'Owners must transfer ownership or dissolve the community before leaving';
  end if;
  update public.memberships set status = 'left' where community_id = p_community and user_id = v_uid;
end;
$$;

create or replace function public.transfer_ownership(p_community uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid();
begin
  if not folks_private.is_community_owner(p_community, v_uid) then raise exception 'Only the owner can transfer ownership'; end if;
  if not folks_private.is_active_member(p_community, p_new_owner) then raise exception 'New owner must be an active member'; end if;
  if not folks_private.is_protected(p_new_owner) then raise exception 'New owner must have a protected identity'; end if;
  update public.memberships set role = 'member' where community_id = p_community and user_id = v_uid;
  update public.memberships set role = 'owner' where community_id = p_community and user_id = p_new_owner;
end;
$$;

-- Hard-deletes the community (cascades ephemeral scoped data). Ledger entries
-- have NO FK to communities, so they are untouched and remain readable by their
-- parties. Performs zero writes to ledger_entries.
create or replace function public.dissolve_community(p_community uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not folks_private.is_community_owner(p_community, folks_private.current_uid()) then raise exception 'Only the owner can dissolve the community'; end if;
  delete from public.communities where id = p_community;
end;
$$;

-- ============================================================================
-- Presence + signals
-- ============================================================================

create or replace function public.set_presence(p_community uuid, p_mode text, p_ttl interval default interval '30 minutes')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not folks_private.is_active_member(p_community, folks_private.current_uid()) then raise exception 'Not a member'; end if;
  if p_mode not in ('selective', 'open') then raise exception 'Presence mode must be selective or open'; end if;
  if p_ttl < interval '1 minute' or p_ttl > interval '12 hours' then raise exception 'Presence TTL out of range'; end if;
  insert into public.presence (user_id, community_id, mode, updated_at, expires_at)
    values (folks_private.current_uid(), p_community, p_mode, now(), now() + p_ttl)
    on conflict (user_id, community_id) do update set mode = excluded.mode, updated_at = now(), expires_at = excluded.expires_at;
end;
$$;

create or replace function public.clear_presence(p_community uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.presence where user_id = folks_private.current_uid() and community_id = p_community;
end;
$$;

create or replace function public.publish_signal(p_community uuid, p_category text, p_text text, p_ttl interval default interval '7 days')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not folks_private.is_active_member(p_community, folks_private.current_uid()) then raise exception 'Not a member'; end if;
  if char_length(coalesce(p_category,'')) not between 1 and 40 then raise exception 'Invalid category'; end if;
  if char_length(coalesce(p_text,'')) not between 1 and 280 then raise exception 'Invalid signal text'; end if;
  if p_ttl < interval '1 hour' or p_ttl > interval '30 days' then raise exception 'Signal TTL out of range'; end if;
  insert into public.signals (user_id, community_id, category, text, expires_at)
    values (folks_private.current_uid(), p_community, p_category, p_text, now() + p_ttl) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.clear_signals(p_community uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.signals where user_id = folks_private.current_uid() and community_id = p_community;
end;
$$;

-- ============================================================================
-- Blocks
-- ============================================================================

create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user = folks_private.current_uid() then raise exception 'Cannot block yourself'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (folks_private.current_uid(), p_user) on conflict do nothing;
end;
$$;

create or replace function public.unblock_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.blocks where blocker_id = folks_private.current_uid() and blocked_id = p_user;
end;
$$;

-- ============================================================================
-- Handshake state machine (legal transitions enforced by trigger too)
-- ============================================================================

create or replace function public.send_handshake(p_community uuid, p_recipient uuid, p_intro text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid(); v_id uuid;
begin
  if v_uid = p_recipient then raise exception 'Cannot handshake yourself'; end if;
  if p_intro is not null and char_length(p_intro) > 280 then raise exception 'Intro too long'; end if;
  if not folks_private.is_active_member(p_community, v_uid) or not folks_private.is_active_member(p_community, p_recipient) then
    raise exception 'Both people must be members of the community';
  end if;
  if folks_private.is_blocked(p_recipient, v_uid) or folks_private.is_blocked(v_uid, p_recipient) then
    raise exception 'Handshake not permitted';
  end if;
  -- Cooldown: no re-offer within 1 day of a decline/defer, in EITHER direction.
  if exists (
    select 1 from public.handshakes h
    where h.community_id = p_community
      and least(h.initiator_id, h.recipient_id) = least(v_uid, p_recipient)
      and greatest(h.initiator_id, h.recipient_id) = greatest(v_uid, p_recipient)
      and h.state in ('declined', 'deferred') and h.updated_at > now() - interval '1 day'
  ) then
    raise exception 'Please wait before reaching out to this person again';
  end if;

  -- Lazily expire a stale outgoing offer for this unordered pair so a fresh
  -- handshake isn't blocked by the active-uniqueness index. Correctness must not
  -- depend on pg_cron (which is background cleanup, not a guarantee).
  update public.handshakes
     set state = 'expired', updated_at = now()
   where community_id = p_community
     and least(initiator_id, recipient_id) = least(v_uid, p_recipient)
     and greatest(initiator_id, recipient_id) = greatest(v_uid, p_recipient)
     and state = 'outgoing'
     and expires_at < now();

  -- Race-safe uniqueness of live handshakes is enforced by handshakes_active_uidx.
  begin
    insert into public.handshakes (community_id, initiator_id, recipient_id, state, intro, expires_at)
      values (p_community, v_uid, p_recipient, 'outgoing', p_intro, now() + interval '3 days')
      returning id into v_id;
  exception when unique_violation then
    raise exception 'A handshake with this person is already in progress';
  end;
  return v_id;
end;
$$;

create or replace function public.respond_handshake(p_handshake uuid, p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid(); v_h public.handshakes%rowtype; v_next text;
begin
  select * into v_h from public.handshakes where id = p_handshake for update;
  if not found then raise exception 'Handshake not found'; end if;
  if v_h.recipient_id <> v_uid then raise exception 'Only the recipient can respond'; end if;
  if v_h.state <> 'outgoing' then raise exception 'Handshake is no longer pending'; end if;
  -- A past-deadline offer can never be accepted late. Expire it and RETURN
  -- 'expired' so the UPDATE commits — a RAISE here would roll the update back in
  -- the same statement (never actually persisting the expiry). The caller maps
  -- the 'expired' result to a user-facing error after the RPC has committed.
  if v_h.expires_at < now() then
    update public.handshakes set state = 'expired', updated_at = now() where id = p_handshake;
    return 'expired';
  end if;

  v_next := case p_action
    when 'accept' then 'connected' when 'nearby' then 'nearby' when 'defer' then 'deferred'
    when 'decline' then 'declined' when 'block' then 'blocked' else null end;
  if v_next is null then raise exception 'Unknown action'; end if;

  update public.handshakes set state = v_next, updated_at = now() where id = p_handshake;
  if p_action = 'block' then
    insert into public.blocks (blocker_id, blocked_id) values (v_uid, v_h.initiator_id) on conflict do nothing;
  end if;
  return v_next;
end;
$$;

-- ============================================================================
-- Shared sessions (write requires ACTIVE participation)
-- ============================================================================

create or replace function public.create_shared_session(p_handshake uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid(); v_h public.handshakes%rowtype; v_id uuid;
begin
  select * into v_h from public.handshakes where id = p_handshake for update;
  if not found then raise exception 'Handshake not found'; end if;
  if v_uid not in (v_h.initiator_id, v_h.recipient_id) then raise exception 'Not a participant'; end if;
  if v_h.state <> 'connected' then raise exception 'Handshake is not connected'; end if;

  select id into v_id from public.shared_sessions where handshake_id = p_handshake;
  if v_id is not null then return v_id; end if;

  insert into public.shared_sessions (handshake_id, community_id) values (p_handshake, v_h.community_id) returning id into v_id;
  insert into public.session_participants (session_id, user_id) values (v_id, v_h.initiator_id), (v_id, v_h.recipient_id);
  return v_id;
end;
$$;

create or replace function public.post_session_message(p_session uuid, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not folks_private.is_active_session_participant(p_session, folks_private.current_uid()) then
    raise exception 'You are not an active participant in this session';
  end if;
  -- Never post into (nor revive) an expired discovery room.
  if not folks_private.is_session_live(p_session) then raise exception 'This room has expired'; end if;
  if char_length(coalesce(p_content,'')) not between 1 and 4000 then raise exception 'Invalid message'; end if;
  insert into public.session_messages (session_id, sender_id, content) values (p_session, folks_private.current_uid(), p_content) returning id into v_id;
  -- Posting is activity: refresh the room's inactivity clock.
  update public.shared_sessions set last_activity_at = now() where id = p_session;
  return v_id;
end;
$$;

create or replace function public.set_session_ai_mode(p_session uuid, p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not folks_private.is_active_session_participant(p_session, folks_private.current_uid()) then
    raise exception 'You are not an active participant in this session';
  end if;
  if p_mode not in ('human-only', 'quiet-notes', 'on-demand') then raise exception 'Invalid AI mode'; end if;
  update public.shared_sessions set ai_mode = p_mode where id = p_session;
end;
$$;

create or replace function public.leave_session(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.session_participants set status = 'departed' where session_id = p_session and user_id = folks_private.current_uid();
end;
$$;

-- Heartbeat: keep a room alive while a participant is actively in it. Only an
-- ACTIVE participant may touch it (merely leaving the app open does nothing —
-- the renderer only calls this while the room view is mounted + focused).
create or replace function public.touch_session(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not folks_private.is_active_session_participant(p_session, folks_private.current_uid()) then
    raise exception 'You are not an active participant in this session';
  end if;
  -- A heartbeat must never resurrect a room that already lapsed.
  if not folks_private.is_session_live(p_session) then raise exception 'This room has expired'; end if;
  update public.shared_sessions set last_activity_at = now() where id = p_session;
end;
$$;

-- ============================================================================
-- Discovery (P0): AI-derived topic sync + recipient-specific matching.
--
-- The transcript never reaches Postgres. sync_discovery receives ONLY the
-- canonical English keys/labels the caller's AI privately derived this turn. It:
--   1) refreshes the caller's active topics (10-min inactivity TTL),
--   2) finds other active users sharing >=1 SPECIFIC (non-generic) key — exact
--      overlap primary, conservative trigram fallback for near-spellings,
--   3) upserts a recipient-specific match record for EACH side (refreshing the
--      match TTL while both stay active), never resurrecting a dismissed one,
--   4) returns the caller's own active topics + live (non-dismissed) matches.
-- Generic keys ('work','life','chat','programming',…) never match on their own.
-- ============================================================================

create or replace function public.sync_discovery(p_topics jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := folks_private.current_uid();
  v_ttl interval := interval '10 minutes';
  -- Only reasonably-confident topics participate in matching (low-confidence
  -- topics are still stored for the caller's own view, but never create matches).
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

  -- 1) Refresh the caller's active topics from this turn's derived keys.
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

  -- An empty payload is a strictly read-only refresh. Realtime notifications use
  -- sync_discovery([]) to re-read recipient-scoped state; writing here would emit
  -- another notification and create a self-sustaining refresh loop.
  if v_has_valid_topics then
    -- Opportunistic physical cleanup of the caller's own expired topics.
    delete from public.discovery_topics where user_id = v_uid and expires_at < v_now;

    -- 2) Score other active users by shared SPECIFIC keys (exact + trigram fuzzy).
    --    A candidate needs >=1 shared non-generic key. The representative label is
    --    the caller's own label for their highest-confidence shared key.
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
    -- Exact key overlap is primary. The trigram fallback is deliberately strict:
    -- it fires only for near-identical spellings (plurals/typos), requiring BOTH
    -- keys to be long enough for trigram similarity to be meaningful AND a high
    -- 0.82 threshold — so 'rust-programming' never fuzzily matches
    -- 'ruby-programming', which share only a common suffix.
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
    -- Never match across a block in either direction.
    where not folks_private.is_blocked(v_uid, s.other_id)
      and not folks_private.is_blocked(s.other_id, v_uid)
  )
  -- 3) Upsert recipient-specific records for BOTH sides (dedup the pair).
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
          -- Lifecycle: if the prior record had already LAPSED (expired), this is a
          -- brand-new encounter — reset accepted/dismissed and drop any stale room
          -- so nothing leaks across the gap. While the record is still live, preserve
          -- them (a "Not now" therefore suppresses only the current match lifetime).
          accepted = case when public.discovery_matches.expires_at < v_now then false
                          else public.discovery_matches.accepted end,
          dismissed = case when public.discovery_matches.expires_at < v_now then false
                           else public.discovery_matches.dismissed end,
          session_id = case when public.discovery_matches.expires_at < v_now then null
                            else public.discovery_matches.session_id end;
  end if;

  -- 4) Return the caller's own active topics + live (non-dismissed) matches.
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

-- "Not now" — dismiss the caller's own match record only.
create or replace function public.dismiss_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.discovery_matches
     set dismissed = true, updated_at = now()
   where id = p_match and user_id = folks_private.current_uid();
end;
$$;

-- "Connect" — mark the caller's side accepted. When BOTH sides have accepted,
-- open a shared (community-less) discovery room once, idempotently, and link it
-- to both records. Returns { mutual, sessionId }.
create or replace function public.accept_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := folks_private.current_uid();
  v_m public.discovery_matches%rowtype;
  v_other public.discovery_matches%rowtype;
  v_other_uid uuid;
  v_session uuid;
begin
  -- Read the counterpart id first (no lock), then take a per-pair advisory lock so
  -- simultaneous accepts from both sides serialize without row-lock deadlocks.
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

  -- Not mutual yet, the counterpart withdrew, or their side has EXPIRED — just
  -- record our acceptance. A room opens only when BOTH reciprocal records are
  -- live and accepted, so we never connect into a lapsed counterpart.
  if not found or v_other.accepted = false or v_other.expires_at < now() then
    return jsonb_build_object('mutual', false, 'sessionId', null);
  end if;

  -- Already opened (idempotent) — return the existing room.
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

-- Clear the caller's own discovery footprint (called on exit / sign-out). TTL is
-- the fallback; this is the immediate best-effort clear.
create or replace function public.clear_discovery()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid();
begin
  if v_uid is null then return; end if;
  delete from public.discovery_topics where user_id = v_uid;
end;
$$;

-- ============================================================================
-- Resources + policy-gated requests + immutable ledger
-- ============================================================================

create or replace function public.register_resource(p_community uuid, p_name text, p_locality text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid(); v_id uuid;
begin
  if not folks_private.is_active_member(p_community, v_uid) then raise exception 'Not a member'; end if;
  if not folks_private.is_protected(v_uid) then
    raise exception 'A protected identity (verified email) is required to register a resource';
  end if;
  if char_length(coalesce(p_name,'')) not between 1 and 80 then raise exception 'Invalid resource name'; end if;
  if p_locality not in ('local', 'lan', 'tailscale', 'remote') then raise exception 'Invalid locality'; end if;
  insert into public.resources (community_id, owner_id, name, locality) values (p_community, v_uid, p_name, p_locality) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_resource_status(p_resource uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not folks_private.is_resource_owner(p_resource, folks_private.current_uid()) then raise exception 'Only the owner can change a resource'; end if;
  if p_status not in ('active', 'paused', 'revoked') then raise exception 'Invalid status'; end if;
  update public.resources set status = p_status where id = p_resource;
  if p_status in ('paused', 'revoked') then
    update public.resource_requests set state = 'canceled', updated_at = now()
    where resource_id = p_resource and state in ('submitted', 'needs_approval', 'approved');
  end if;
end;
$$;

create or replace function public.submit_resource_request(p_resource uuid, p_job jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid(); v_res public.resources%rowtype; v_id uuid;
begin
  if p_job is null or pg_column_size(p_job) > 16384 then raise exception 'Invalid or oversized job'; end if;
  select * into v_res from public.resources where id = p_resource;
  if not found or v_res.status <> 'active' then raise exception 'Resource unavailable'; end if;
  if not folks_private.is_active_member(v_res.community_id, v_uid) then raise exception 'Not a member'; end if;
  insert into public.resource_requests (resource_id, requester_id, state, job) values (p_resource, v_uid, 'submitted', p_job) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.claim_resource_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.resource_requests%rowtype;
begin
  select * into v_req from public.resource_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if not folks_private.is_resource_owner(v_req.resource_id, folks_private.current_uid()) then raise exception 'Only the owner can claim'; end if;
  if v_req.state not in ('submitted', 'approved') then raise exception 'Request not claimable'; end if;
  update public.resource_requests set state = 'executing', updated_at = now() where id = p_request;
end;
$$;

create or replace function public.approve_resource_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.resource_requests%rowtype;
begin
  select * into v_req from public.resource_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if not folks_private.is_resource_owner(v_req.resource_id, folks_private.current_uid()) then raise exception 'Only the owner can approve'; end if;
  if v_req.state not in ('submitted', 'needs_approval') then raise exception 'Request not approvable'; end if;
  update public.resource_requests set state = 'approved', updated_at = now() where id = p_request;
end;
$$;

-- Shared helper: append an immutable ledger entry (+ two party rows) atomically.
create or replace function folks_private.write_ledger(p_req public.resource_requests, p_res public.resources, p_decision text, p_outcome text, p_usage jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner_party uuid; v_requester_party uuid;
begin
  insert into public.ledger_parties (user_id, pseudonym) values (p_res.owner_id, 'owner') returning id into v_owner_party;
  insert into public.ledger_parties (user_id, pseudonym) values (p_req.requester_id, 'requester') returning id into v_requester_party;
  insert into public.ledger_entries (community_id, resource_id, request_id, resource_name, contributor_party, requester_party, decision, outcome, usage)
    values (p_res.community_id, p_res.id, p_req.id, p_res.name, v_owner_party, v_requester_party, p_decision, p_outcome, p_usage);
end;
$$;

create or replace function public.deny_resource_request(p_request uuid, p_reason text default 'denied')
returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.resource_requests%rowtype; v_res public.resources%rowtype;
begin
  select * into v_req from public.resource_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  select * into v_res from public.resources where id = v_req.resource_id;
  if v_res.owner_id <> folks_private.current_uid() then raise exception 'Only the owner can deny'; end if;
  if v_req.state not in ('submitted', 'needs_approval', 'approved') then raise exception 'Request not deniable'; end if;
  update public.resource_requests set state = 'denied', updated_at = now() where id = p_request;
  perform folks_private.write_ledger(v_req, v_res, 'denied', left(coalesce(p_reason, 'denied'), 200), null);
end;
$$;

create or replace function public.complete_resource_request(p_request uuid, p_result jsonb, p_usage jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.resource_requests%rowtype; v_res public.resources%rowtype;
begin
  if p_result is not null and pg_column_size(p_result) > 65536 then raise exception 'Result too large'; end if;
  select * into v_req from public.resource_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  select * into v_res from public.resources where id = v_req.resource_id;
  if v_res.owner_id <> folks_private.current_uid() then raise exception 'Only the owner can complete'; end if;
  if v_req.state <> 'executing' then raise exception 'Request is not executing'; end if;
  update public.resource_requests set state = 'completed', result = p_result, usage = p_usage, updated_at = now() where id = p_request;
  -- Refresh snapshot for the ledger with the just-written usage.
  select * into v_req from public.resource_requests where id = p_request;
  perform folks_private.write_ledger(v_req, v_res, 'allowed', 'completed', p_usage);
end;
$$;

create or replace function public.fail_resource_request(p_request uuid, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.resource_requests%rowtype;
begin
  select * into v_req from public.resource_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if not folks_private.is_resource_owner(v_req.resource_id, folks_private.current_uid()) then raise exception 'Only the owner can fail'; end if;
  if v_req.state <> 'executing' then raise exception 'Request is not executing'; end if;
  update public.resource_requests set state = 'failed', result = jsonb_build_object('error', left(coalesce(p_error,'error'), 500)), updated_at = now() where id = p_request;
end;
$$;

create or replace function public.cancel_resource_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.resource_requests%rowtype;
begin
  select * into v_req from public.resource_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.requester_id <> folks_private.current_uid() then raise exception 'Only the requester can cancel'; end if;
  if v_req.state not in ('submitted', 'needs_approval', 'approved') then raise exception 'Too late to cancel'; end if;
  update public.resource_requests set state = 'canceled', updated_at = now() where id = p_request;
end;
$$;

-- ============================================================================
-- Account data deletion.
-- NOTE: This deletes the caller's FOLKS DATA. It does NOT delete the Supabase
-- Auth user (that requires the admin API / service role, which the app never
-- holds). Atomic (single function = single transaction). Zero writes to
-- ledger_entries — de-identification happens only in ledger_parties.
-- ============================================================================

create or replace function public.delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := folks_private.current_uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- Block sole owners until they transfer or dissolve.
  if exists (
    select 1 from public.memberships m
    where m.user_id = v_uid and m.role = 'owner' and m.status = 'active'
      and (select count(*) from public.memberships o
           where o.community_id = m.community_id and o.role = 'owner' and o.status = 'active') = 1
  ) then
    raise exception 'You solely own one or more communities. Transfer ownership or dissolve them first.';
  end if;

  delete from public.presence where user_id = v_uid;
  delete from public.signals where user_id = v_uid;

  -- ALL requests the caller made — including terminal ones. We do NOT retain a
  -- departing requester's direct UID or job/result payloads just because a
  -- request completed; the immutable ledger already preserves the (de-identified)
  -- transparency record.
  delete from public.resource_requests where requester_id = v_uid;
  -- Owned resource metadata (cascades those resources' requests).
  delete from public.resources where owner_id = v_uid;

  -- Mark session participation departed; delete own message CONTENT, leaving a
  -- contentless ordering tombstone.
  update public.session_participants set status = 'departed' where user_id = v_uid;
  update public.session_messages set content = null, deleted = true, sender_id = null where sender_id = v_uid;

  -- Obsolete handshakes with no session (keep session-bearing handshakes so the
  -- counterparty's session survives).
  delete from public.handshakes h
  where (h.initiator_id = v_uid or h.recipient_id = v_uid)
    and not exists (select 1 from public.shared_sessions s where s.handshake_id = h.id);

  delete from public.blocks where blocker_id = v_uid or blocked_id = v_uid;
  delete from public.memberships where user_id = v_uid;

  -- De-identify ledger participation WITHOUT touching ledger_entries.
  update public.ledger_parties set user_id = null, pseudonym = 'removed member' where user_id = v_uid;

  delete from public.users where id = v_uid;
end;
$$;

-- ============================================================================
-- Triggers (defense-in-depth) — in folks_private.
-- ============================================================================

create or replace function folks_private.trg_ledger_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'ledger_entries are append-only and immutable';
end;
$$;

drop trigger if exists ledger_entries_immutable on public.ledger_entries;
create trigger ledger_entries_immutable
  before update or delete on public.ledger_entries
  for each row execute function folks_private.trg_ledger_immutable();

-- ledger_parties: user_id may ONLY move non-null -> NULL (de-identify); never
-- NULL -> user, never user -> different user. Pseudonym may change ONLY in that
-- same de-identification step.
create or replace function folks_private.trg_ledger_parties_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    if not (old.user_id is not null and new.user_id is null) then
      raise exception 'ledger_parties.user_id may only be cleared (de-identify), never set or repointed';
    end if;
  end if;
  if new.pseudonym is distinct from old.pseudonym then
    if not (old.user_id is not null and new.user_id is null) then
      raise exception 'ledger_parties.pseudonym may only change during de-identification';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_parties_guard on public.ledger_parties;
create trigger ledger_parties_guard
  before update on public.ledger_parties
  for each row execute function folks_private.trg_ledger_parties_guard();

-- Handshake legal-transition matrix.
create or replace function folks_private.trg_handshake_transition()
returns trigger language plpgsql set search_path = '' as $$
declare v_ok boolean;
begin
  if new.state = old.state then return new; end if;
  v_ok :=
      (old.state = 'outgoing' and new.state in ('connected', 'nearby', 'deferred', 'declined', 'blocked', 'expired'))
   or (old.state = 'nearby'   and new.state in ('connected', 'declined', 'blocked', 'expired'))
   or (old.state = 'deferred' and new.state in ('outgoing', 'expired'));
  if not v_ok then raise exception 'Illegal handshake transition % -> %', old.state, new.state; end if;
  return new;
end;
$$;

drop trigger if exists handshakes_transition_guard on public.handshakes;
create trigger handshakes_transition_guard
  before update on public.handshakes
  for each row execute function folks_private.trg_handshake_transition();

-- Resource-request legal-transition matrix.
create or replace function folks_private.trg_request_transition()
returns trigger language plpgsql set search_path = '' as $$
declare v_ok boolean;
begin
  if new.state = old.state then return new; end if;
  v_ok :=
      (old.state = 'submitted'      and new.state in ('needs_approval', 'approved', 'denied', 'capped', 'executing', 'canceled'))
   or (old.state = 'needs_approval' and new.state in ('approved', 'denied', 'canceled'))
   or (old.state = 'approved'       and new.state in ('executing', 'denied', 'canceled'))
   or (old.state = 'capped'         and new.state in ('denied', 'canceled'))
   or (old.state = 'executing'      and new.state in ('completed', 'failed'));
  if not v_ok then raise exception 'Illegal request transition % -> %', old.state, new.state; end if;
  return new;
end;
$$;

drop trigger if exists resource_requests_transition_guard on public.resource_requests;
create trigger resource_requests_transition_guard
  before update on public.resource_requests
  for each row execute function folks_private.trg_request_transition();

-- ============================================================================
-- Cleanup (private; run only via cron/owner — never a client RPC).
-- ============================================================================

-- P0 retention policy (explicit + implemented):
--   * presence: deleted at TTL expiry.
--   * signals: deleted at TTL expiry.
--   * handshakes: outgoing offers expire after their deadline.
--   * resource_requests: terminal job/result PAYLOADS are stripped 7 days after
--     the request settled (the row + state stay for history; the ledger keeps the
--     transparency record). No PII beyond the requester UID, which delete_my_data
--     removes on departure.
--   * invitation_throttle: stale buckets pruned.
-- NOTE (P0 scope): session_messages have NO timed auto-expiry — they are kept
--   until the session is deleted or a participant deletes their data (their
--   content becomes a contentless tombstone). Configurable per-session retention
--   is a later, renderer-driven feature; the plan/disclosure reflect exactly this.
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

  -- Discovery: expired topics/matches, and inactive discovery rooms (deletes
  -- cascade participants + messages; the match's session_id is set null).
  delete from public.discovery_topics where expires_at < now();
  delete from public.discovery_matches where expires_at < now() and session_id is null;
  delete from public.shared_sessions
    where origin = 'discovery' and last_activity_at < now() - interval '10 minutes';
end;
$$;

-- ============================================================================
-- Ownership: reassign Folks TABLES + SECURITY DEFINER FUNCTIONS to folks_definer
-- (least-privilege owner; table-owner RLS exemption lets SD functions work).
--
-- IMPORTANT — hosted-Supabase-safe, allowlisted, failure-ATOMIC transfer:
--   * `ALTER … OWNER TO folks_definer` requires the *receiving* role to hold
--     CREATE on the object's schema. Hosted Supabase's `postgres` is NOT a true
--     superuser, so it cannot bypass this. We grant folks_definer CREATE on
--     `public` + `folks_private` ONLY for the transfer, then REVOKE it — all
--     inside ONE DO block with NO exception handler. If any transfer fails, the
--     whole DO statement aborts and PostgreSQL rolls back the transient GRANTs
--     automatically, so folks_definer can never be left holding CREATE.
--   * The transfer targets an EXPLICIT ALLOWLIST of exact Folks signatures — it
--     never scans the catalog, so it cannot take ownership of unrelated
--     project functions that happen to be SECURITY DEFINER.
--   * `folks_private` stays ADMIN-OWNED — a SECURITY DEFINER function only needs
--     USAGE on its schema, never ownership.
-- ============================================================================

-- Runtime access folks_definer keeps permanently: USAGE on the private schema.
grant usage on schema folks_private to folks_definer;

do $$
declare
  obj text;
  folks_tables text[] := array[
    'public.users','public.communities','public.memberships','public.invitations',
    'public.blocks','public.signals','public.presence','public.handshakes',
    'public.shared_sessions','public.session_participants','public.session_messages',
    'public.resources','public.resource_requests','public.ledger_parties',
    'public.ledger_entries','public.discovery_topics','public.discovery_matches',
    'folks_private.invitation_throttle'
  ];
  folks_functions text[] := array[
    -- public client RPCs (all SECURITY DEFINER)
    'public.set_display_name(text)',
    'public.create_community(text)',
    'public.create_invitation(uuid, interval, integer)',
    'public.accept_invitation(text)',
    'public.revoke_invitation(uuid)',
    'public.revoke_membership(uuid, uuid)',
    'public.leave_community(uuid)',
    'public.transfer_ownership(uuid, uuid)',
    'public.dissolve_community(uuid)',
    'public.set_presence(uuid, text, interval)',
    'public.clear_presence(uuid)',
    'public.publish_signal(uuid, text, text, interval)',
    'public.clear_signals(uuid)',
    'public.block_user(uuid)',
    'public.unblock_user(uuid)',
    'public.send_handshake(uuid, uuid, text)',
    'public.respond_handshake(uuid, text)',
    'public.create_shared_session(uuid)',
    'public.post_session_message(uuid, text)',
    'public.set_session_ai_mode(uuid, text)',
    'public.leave_session(uuid)',
    'public.touch_session(uuid)',
    'public.sync_discovery(jsonb)',
    'public.dismiss_match(uuid)',
    'public.accept_match(uuid)',
    'public.clear_discovery()',
    'public.register_resource(uuid, text, text)',
    'public.set_resource_status(uuid, text)',
    'public.submit_resource_request(uuid, jsonb)',
    'public.claim_resource_request(uuid)',
    'public.approve_resource_request(uuid)',
    'public.deny_resource_request(uuid, text)',
    'public.complete_resource_request(uuid, jsonb, jsonb)',
    'public.fail_resource_request(uuid, text)',
    'public.cancel_resource_request(uuid)',
    'public.delete_my_data()',
    -- folks_private helpers, trigger functions, ledger writer, cleanup
    -- NOTE: is_protected is intentionally EXCLUDED — it stays admin-owned (auth bridge).
    'folks_private.current_uid()',
    'folks_private.is_active_member(uuid, uuid)',
    'folks_private.is_community_owner(uuid, uuid)',
    'folks_private.shares_community(uuid, uuid)',
    'folks_private.is_session_participant(uuid, uuid)',
    'folks_private.is_active_session_participant(uuid, uuid)',
    'folks_private.is_session_live(uuid)',
    'folks_private.is_resource_owner(uuid, uuid)',
    'folks_private.is_blocked(uuid, uuid)',
    'folks_private.is_ledger_party(uuid, uuid, uuid)',
    'folks_private.can_read_party(uuid, uuid)',
    'folks_private.is_generic_key(text)',
    'folks_private.handle_new_user()',
    'folks_private.write_ledger(public.resource_requests, public.resources, text, text, jsonb)',
    'folks_private.trg_ledger_immutable()',
    'folks_private.trg_ledger_parties_guard()',
    'folks_private.trg_handshake_transition()',
    'folks_private.trg_request_transition()',
    'folks_private.folks_cleanup()'
  ];
begin
  -- Transient CREATE (auto-rolled-back if any transfer below fails).
  grant create on schema public to folks_definer;
  grant create on schema folks_private to folks_definer;

  foreach obj in array folks_tables loop
    execute format('alter table %s owner to folks_definer', obj);
  end loop;
  foreach obj in array folks_functions loop
    execute format('alter function %s owner to folks_definer', obj);
  end loop;

  -- On success, drop the transient CREATE so folks_definer keeps none.
  revoke create on schema public from folks_definer;
  revoke create on schema folks_private from folks_definer;
end $$;

-- NOTE: folks_definer is deliberately NOT granted anything on the `auth` schema.
-- Hosted Supabase's `postgres` cannot grant USAGE on the supabase_admin-owned
-- `auth` schema anyway (it silently no-ops). folks_definer-owned functions read
-- the caller id via folks_private.current_uid() (JWT), and the only auth.users
-- read goes through the admin-owned folks_private.is_protected() bridge.

-- pgcrypto lives in the `extensions` schema; the invitation functions run as
-- folks_definer and call crypt()/gen_salt()/gen_random_bytes() there.
grant usage on schema extensions to folks_definer;
grant execute on function extensions.crypt(text, text) to folks_definer;
grant execute on function extensions.gen_salt(text) to folks_definer;
grant execute on function extensions.gen_random_bytes(integer) to folks_definer;
-- pg_trgm similarity() is called by sync_discovery (runs as folks_definer).
grant execute on function extensions.similarity(text, text) to folks_definer;

-- ============================================================================
-- Grants (least privilege)
-- ============================================================================

-- Clients read tables (RLS-filtered).
grant usage on schema public to authenticated;
grant select on
  public.users, public.communities, public.memberships, public.blocks, public.signals,
  public.presence, public.handshakes, public.shared_sessions, public.session_participants,
  public.session_messages, public.resources, public.resource_requests,
  public.ledger_parties, public.ledger_entries,
  public.discovery_topics, public.discovery_matches
to authenticated;

-- RLS helper functions are callable by clients (needed to evaluate policies) but
-- live in folks_private, which PostgREST does NOT expose as RPCs.
-- (is_protected is intentionally NOT here — it is not used by any RLS policy;
--  only folks_definer-owned SD functions call it, via the grant below.)
grant usage on schema folks_private to authenticated;
revoke execute on all functions in schema folks_private from public;
grant execute on function
  folks_private.is_active_member(uuid, uuid),
  folks_private.is_community_owner(uuid, uuid),
  folks_private.shares_community(uuid, uuid),
  folks_private.is_session_participant(uuid, uuid),
  folks_private.is_active_session_participant(uuid, uuid),
  folks_private.is_session_live(uuid),
  folks_private.is_resource_owner(uuid, uuid),
  folks_private.is_blocked(uuid, uuid),
  folks_private.is_ledger_party(uuid, uuid, uuid),
  folks_private.can_read_party(uuid, uuid)
to authenticated;

-- The admin-owned auth bridge: callable ONLY by folks_definer-owned SD functions.
revoke execute on function folks_private.is_protected(uuid) from public, anon, authenticated;
grant execute on function folks_private.is_protected(uuid) to folks_definer;

-- Public functions: revoke the default PUBLIC grant, then allow only clients
-- on the intended RPCs. (write_ledger stays private/uncallable by clients.)
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on function
  public.set_display_name(text),
  public.create_community(text),
  public.create_invitation(uuid, interval, integer),
  public.accept_invitation(text),
  public.revoke_invitation(uuid),
  public.revoke_membership(uuid, uuid),
  public.leave_community(uuid),
  public.transfer_ownership(uuid, uuid),
  public.dissolve_community(uuid),
  public.set_presence(uuid, text, interval),
  public.clear_presence(uuid),
  public.publish_signal(uuid, text, text, interval),
  public.clear_signals(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.send_handshake(uuid, uuid, text),
  public.respond_handshake(uuid, text),
  public.create_shared_session(uuid),
  public.post_session_message(uuid, text),
  public.set_session_ai_mode(uuid, text),
  public.leave_session(uuid),
  public.touch_session(uuid),
  public.sync_discovery(jsonb),
  public.dismiss_match(uuid),
  public.accept_match(uuid),
  public.clear_discovery(),
  public.register_resource(uuid, text, text),
  public.set_resource_status(uuid, text),
  public.submit_resource_request(uuid, jsonb),
  public.claim_resource_request(uuid),
  public.approve_resource_request(uuid),
  public.deny_resource_request(uuid, text),
  public.complete_resource_request(uuid, jsonb, jsonb),
  public.fail_resource_request(uuid, text),
  public.cancel_resource_request(uuid),
  public.delete_my_data()
to authenticated;

-- ============================================================================
-- Realtime (idempotent) — add change-feed tables to the supabase_realtime pub.
-- ============================================================================

do $$
declare
  t text;
  rt_tables text[] := array[
    'presence','signals','handshakes','shared_sessions','session_messages',
    'resource_requests','ledger_entries','discovery_matches'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array rt_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- pg_cron (optional; requires the extension). Idempotent scheduling.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'folks-cleanup') then
      perform cron.schedule('folks-cleanup', '*/5 * * * *', 'select folks_private.folks_cleanup()');
    end if;
  end if;
end $$;

-- ============================================================================
-- Verification queries (run manually after applying)
-- ============================================================================
-- 1. Every Folks table has RLS enabled:
--    select relname, relrowsecurity from pg_class
--    where relnamespace = 'public'::regnamespace and relkind = 'r'
--      and relname in ('users','communities','memberships','invitations','blocks','signals',
--        'presence','handshakes','shared_sessions','session_participants','session_messages',
--        'resources','resource_requests','ledger_parties','ledger_entries');
-- 2. anon/PUBLIC hold no EXECUTE on public functions:
--    select p.proname, r.rolname from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace, lateral (values ('anon'),('public')) r(rolname)
--    where n.nspname = 'public'
--      and has_function_privilege(r.rolname, p.oid, 'execute');  -- expect 0 rows
-- 3. Folks objects owned by folks_definer:
--    select relname, relowner::regrole from pg_class
--    where relnamespace = 'public'::regnamespace and relname like any (array['communities','ledger_entries']);
-- 4. Realtime publication membership:
--    select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';
-- 5. Definer + client schema access:
--    select has_schema_privilege('folks_definer','folks_private','usage')  -- expect t
--         , has_schema_privilege('folks_definer','extensions','usage')     -- expect t
--         , has_function_privilege('folks_definer','extensions.crypt(text,text)','execute') -- expect t
--         , has_schema_privilege('authenticated','folks_private','usage'); -- expect t
-- 6. Final ownership: tables/functions owned by folks_definer; folks_private stays admin-owned:
--    select relname, relowner::regrole from pg_class
--    where relnamespace = 'public'::regnamespace and relname in ('communities','ledger_entries'); -- folks_definer
--    select nspname, nspowner::regrole from pg_namespace where nspname = 'folks_private'; -- NOT folks_definer (admin)
-- 7. No standing CREATE retained after setup (least privilege):
--    select has_schema_privilege('folks_definer','public','create')          -- expect f
--         , has_schema_privilege('folks_definer','folks_private','create');   -- expect f
-- 8. Auth bridge: is_protected stays admin-owned; only folks_definer executes it;
--    folks_definer has NO auth access:
--    select proowner::regrole from pg_proc where oid='folks_private.is_protected(uuid)'::regprocedure; -- NOT folks_definer
--    select has_function_privilege('authenticated','folks_private.is_protected(uuid)','execute') -- expect f
--         , has_function_privilege('folks_definer','folks_private.is_protected(uuid)','execute')  -- expect t
--         , has_schema_privilege('folks_definer','auth','usage');                                 -- expect f
