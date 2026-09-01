alter table public.lobbies
  add column if not exists starting_points int not null default 1;

alter table public.lobbies
  drop constraint if exists lobbies_starting_points_range;

alter table public.lobbies
  add constraint lobbies_starting_points_range
  check (starting_points >= 0 and starting_points <= 10);
