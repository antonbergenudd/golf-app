-- Production RLS: keep anon gameplay working (no user accounts), but stop
-- unrestricted DELETE on live round tables. Lobby cleanup may only remove
-- rows older than 24 hours (matches databaseService.cleanupOldLobbies).

drop policy if exists "games_anon_all" on public.games;
drop policy if exists "lobbies_anon_all" on public.lobbies;
drop policy if exists "player_cards_anon_all" on public.player_cards;
drop policy if exists "global_effects_anon_all" on public.global_effects;
drop policy if exists "challenge_verifications_anon_all" on public.challenge_verifications;
drop policy if exists "game_events_anon_all" on public.game_events;
drop policy if exists "players_anon_all" on public.players;
drop policy if exists "scores_anon_all" on public.scores;

drop policy if exists "games_anon_select" on public.games;
drop policy if exists "games_anon_insert" on public.games;
drop policy if exists "games_anon_update" on public.games;
drop policy if exists "lobbies_anon_select" on public.lobbies;
drop policy if exists "lobbies_anon_insert" on public.lobbies;
drop policy if exists "lobbies_anon_update" on public.lobbies;
drop policy if exists "lobbies_anon_delete_stale" on public.lobbies;
drop policy if exists "player_cards_anon_select" on public.player_cards;
drop policy if exists "player_cards_anon_insert" on public.player_cards;
drop policy if exists "player_cards_anon_update" on public.player_cards;
drop policy if exists "global_effects_anon_select" on public.global_effects;
drop policy if exists "global_effects_anon_insert" on public.global_effects;
drop policy if exists "global_effects_anon_update" on public.global_effects;
drop policy if exists "challenge_verifications_anon_select" on public.challenge_verifications;
drop policy if exists "challenge_verifications_anon_insert" on public.challenge_verifications;
drop policy if exists "challenge_verifications_anon_update" on public.challenge_verifications;
drop policy if exists "game_events_anon_select" on public.game_events;
drop policy if exists "game_events_anon_insert" on public.game_events;
drop policy if exists "players_anon_select" on public.players;
drop policy if exists "players_anon_insert" on public.players;
drop policy if exists "players_anon_update" on public.players;
drop policy if exists "players_anon_delete" on public.players;
drop policy if exists "scores_anon_select" on public.scores;
drop policy if exists "scores_anon_insert" on public.scores;
drop policy if exists "scores_anon_update" on public.scores;
drop policy if exists "scores_anon_delete" on public.scores;

-- games: live rounds (no delete from clients)
create policy "games_anon_select" on public.games for select using (true);
create policy "games_anon_insert" on public.games for insert with check (true);
create policy "games_anon_update" on public.games for update using (true) with check (true);

-- lobbies: join-by-code still needs select; wipe of current lobbies is blocked
create policy "lobbies_anon_select" on public.lobbies for select using (true);
create policy "lobbies_anon_insert" on public.lobbies for insert with check (true);
create policy "lobbies_anon_update" on public.lobbies for update using (true) with check (true);
create policy "lobbies_anon_delete_stale" on public.lobbies
  for delete using (created_at < now() - interval '24 hours');

create policy "player_cards_anon_select" on public.player_cards for select using (true);
create policy "player_cards_anon_insert" on public.player_cards for insert with check (true);
create policy "player_cards_anon_update" on public.player_cards for update using (true) with check (true);

create policy "global_effects_anon_select" on public.global_effects for select using (true);
create policy "global_effects_anon_insert" on public.global_effects for insert with check (true);
create policy "global_effects_anon_update" on public.global_effects for update using (true) with check (true);

create policy "challenge_verifications_anon_select" on public.challenge_verifications for select using (true);
create policy "challenge_verifications_anon_insert" on public.challenge_verifications for insert with check (true);
create policy "challenge_verifications_anon_update" on public.challenge_verifications for update using (true) with check (true);

-- feed is append-only
create policy "game_events_anon_select" on public.game_events for select using (true);
create policy "game_events_anon_insert" on public.game_events for insert with check (true);

create policy "players_anon_select" on public.players for select using (true);
create policy "players_anon_insert" on public.players for insert with check (true);
create policy "players_anon_update" on public.players for update using (true) with check (true);
create policy "players_anon_delete" on public.players for delete using (true);

create policy "scores_anon_select" on public.scores for select using (true);
create policy "scores_anon_insert" on public.scores for insert with check (true);
create policy "scores_anon_update" on public.scores for update using (true) with check (true);
create policy "scores_anon_delete" on public.scores for delete using (true);
