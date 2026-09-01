-- Fairway / Golf Game — schema migrated from Cloud Firestore collections.
-- Apply in Supabase SQL Editor or via CLI. Enable Realtime on these tables in Dashboard → Database → Replication.

create extension if not exists "pgcrypto";

-- ── games (started rounds) ────────────────────────────────────────────────
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  player_ids text[] not null default '{}',
  holes int not null default 18,
  mode text not null default 'classic',
  status text not null default 'active',
  current_hole int not null default 1,
  player_points jsonb not null default '{}'::jsonb,
  hidden_balance_until_hole jsonb not null default '{}'::jsonb,
  action_buy_locked_until_hole jsonb not null default '{}'::jsonb,
  action_steal_armed jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_created_at_idx on public.games (created_at desc);

-- ── lobbies ───────────────────────────────────────────────────────────────
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  host_id text not null,
  host_name text not null,
  players jsonb not null default '[]'::jsonb,
  status text not null default 'waiting',
  max_players int not null default 4,
  planned_holes int not null default 18,
  planned_mode text not null default 'classic',
  game_id uuid references public.games (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lobbies_code_idx on public.lobbies (upper(code));
create index if not exists lobbies_status_idx on public.lobbies (status);

-- ── player_cards (doc id in Firestore: `${gameId}_${playerId}`) ───────────
create table if not exists public.player_cards (
  id text primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  player_id text not null,
  cards jsonb not null default '[]'::jsonb,
  hole int,
  challenge_rerolls_used int not null default 0,
  action_rerolls_used int not null default 0,
  hide_next_challenge_draw_popup boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_cards_game_idx on public.player_cards (game_id);

-- ── global_effects ─────────────────────────────────────────────────────────
create table if not exists public.global_effects (
  game_id uuid primary key references public.games (id) on delete cascade,
  hole int,
  passive_effects jsonb not null default '[]'::jsonb,
  direct_cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── challenge_verifications (subcollection in Firestore) ────────────────────
create table if not exists public.challenge_verifications (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  claimant_id text,
  claimant_name text,
  card_id text,
  hole int,
  points_to_award int not null default 0,
  challenge_title text,
  challenge_description text,
  challenge_type text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  verifier_id text,
  verifier_name text,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  confirmation jsonb
);

create index if not exists challenge_verifications_game_created_idx
  on public.challenge_verifications (game_id, created_at desc);

-- ── game_events ─────────────────────────────────────────────────────────────
create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  player_id text not null,
  player_name text not null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create index if not exists game_events_game_time_idx
  on public.game_events (game_id, timestamp desc);

-- ── scores & players (Firestore demo / scorecard) ─────────────────────────
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  handicap double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  player_name text not null,
  hole int not null,
  strokes int not null,
  game_id uuid references public.games (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists scores_game_hole_idx on public.scores (game_id, hole);

-- ── RLS: permissive dev policies (replace with auth-aware rules in production)
alter table public.games enable row level security;
alter table public.lobbies enable row level security;
alter table public.player_cards enable row level security;
alter table public.global_effects enable row level security;
alter table public.challenge_verifications enable row level security;
alter table public.game_events enable row level security;
alter table public.players enable row level security;
alter table public.scores enable row level security;

drop policy if exists "games_anon_all" on public.games;
drop policy if exists "lobbies_anon_all" on public.lobbies;
drop policy if exists "player_cards_anon_all" on public.player_cards;
drop policy if exists "global_effects_anon_all" on public.global_effects;
drop policy if exists "challenge_verifications_anon_all" on public.challenge_verifications;
drop policy if exists "game_events_anon_all" on public.game_events;
drop policy if exists "players_anon_all" on public.players;
drop policy if exists "scores_anon_all" on public.scores;

create policy "games_anon_all" on public.games for all using (true) with check (true);
create policy "lobbies_anon_all" on public.lobbies for all using (true) with check (true);
create policy "player_cards_anon_all" on public.player_cards for all using (true) with check (true);
create policy "global_effects_anon_all" on public.global_effects for all using (true) with check (true);
create policy "challenge_verifications_anon_all" on public.challenge_verifications for all using (true) with check (true);
create policy "game_events_anon_all" on public.game_events for all using (true) with check (true);
create policy "players_anon_all" on public.players for all using (true) with check (true);
create policy "scores_anon_all" on public.scores for all using (true) with check (true);

-- Realtime (idempotent: skip if table already in publication)
do $$
begin
  alter publication supabase_realtime add table public.lobbies;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.games;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.player_cards;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.global_effects;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.challenge_verifications;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.game_events;
exception
  when duplicate_object then null;
end $$;
