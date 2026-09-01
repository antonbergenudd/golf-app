-- Atomic points mutation.
--
-- databaseService previously read games.player_points, mutated it in JS, and
-- wrote it back. Two concurrent callers (two players spending, a steal landing
-- while points are awarded) would clobber each other — last write wins, points
-- lost. apply_point_deltas does it in one statement under a row lock.
--
-- The client (src/services/db/shared.ts -> applyPointDeltas) prefers this RPC
-- and falls back to the old read-modify-write when the function is absent, so
-- applying this migration is safe to defer but strongly recommended.

create or replace function public.apply_point_deltas(
  p_game_id uuid,
  p_deltas jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_points jsonb;
  v_key text;
  v_delta numeric;
  v_current numeric;
begin
  select player_points into v_points
  from public.games
  where id = p_game_id
  for update;

  if v_points is null then
    raise exception 'apply_point_deltas: game % not found', p_game_id;
  end if;

  for v_key, v_delta in
    select key, value::numeric from jsonb_each_text(p_deltas)
  loop
    v_current := coalesce((v_points ->> v_key)::numeric, 0);
    -- Balances are a points economy: never let one go negative.
    v_points := jsonb_set(
      v_points,
      array[v_key],
      to_jsonb(greatest(0, floor(v_current + v_delta))::int),
      true
    );
  end loop;

  update public.games
  set player_points = v_points,
      updated_at = now()
  where id = p_game_id;

  return v_points;
end;
$$;

grant execute on function public.apply_point_deltas(uuid, jsonb)
  to anon, authenticated;
