-- Server-authoritative mutations, slice 1: challenges.
--
-- These move the "find the challenge card in the jsonb hand, check the rule,
-- patch one field" logic out of the client and into SECURITY DEFINER functions
-- that (a) take a row lock, (b) verify the caller is actually in the game, and
-- (c) enforce the not-already-claimed / not-pending guards. The client
-- (src/services/db/cardRepo.ts) calls the RPC and only falls back to the old
-- client-side write when the function is absent (migration not applied).
--
-- Pattern for every slice that follows: is_game_member() gate, FOR UPDATE,
-- rule check, jsonb_set, return the new cards array.

create or replace function public.is_game_member(
  p_game_id uuid,
  p_player_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.games
    where id = p_game_id
      and p_player_id = any (player_ids)
  );
$$;

grant execute on function public.is_game_member(uuid, text) to anon, authenticated;

-- ── claim_challenge ────────────────────────────────────────────────────────
create or replace function public.claim_challenge(
  p_game_id uuid,
  p_player_id text,
  p_card_id text,
  p_card_hole int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pc_id text := p_game_id::text || '_' || p_player_id;
  v_cards jsonb;
  v_idx int;
  v_card jsonb;
begin
  if not public.is_game_member(p_game_id, p_player_id) then
    raise exception 'You are not in this game' using errcode = '42501';
  end if;

  select cards into v_cards
  from public.player_cards
  where id = v_pc_id
  for update;

  if v_cards is null then
    raise exception 'Player cards not found';
  end if;

  select (ord - 1), value
  into v_idx, v_card
  from jsonb_array_elements(v_cards) with ordinality as t(value, ord)
  where value ->> 'id' = p_card_id
    and coalesce((value ->> 'hole')::int, -1) = p_card_hole
    and value ->> 'type' in ('challenge', 'passive')
  order by ord
  limit 1;

  if v_idx is null then
    raise exception 'Challenge not found';
  end if;
  if coalesce((v_card ->> 'claimed')::boolean, false) then
    raise exception 'Challenge already claimed';
  end if;
  if coalesce((v_card ->> 'verificationPending')::boolean, false) then
    raise exception 'Challenge is awaiting verification';
  end if;

  v_cards := jsonb_set(
    v_cards, array[v_idx::text, 'claimed'], 'true'::jsonb, true
  );

  update public.player_cards
  set cards = v_cards, updated_at = now()
  where id = v_pc_id;

  return v_cards;
end;
$$;

grant execute on function public.claim_challenge(uuid, text, text, int)
  to anon, authenticated;

-- ── assign_trial_combat_deputy ─────────────────────────────────────────────
create or replace function public.assign_trial_combat_deputy(
  p_game_id uuid,
  p_sponsor_id text,
  p_deputy_id text,
  p_deputy_name text,
  p_card_id text,
  p_card_hole int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pc_id text := p_game_id::text || '_' || p_sponsor_id;
  v_cards jsonb;
  v_idx int;
  v_card jsonb;
begin
  if p_deputy_id = p_sponsor_id then
    raise exception 'You cannot assign yourself as fighter';
  end if;
  if not public.is_game_member(p_game_id, p_sponsor_id) then
    raise exception 'You are not in this game' using errcode = '42501';
  end if;

  select cards into v_cards
  from public.player_cards
  where id = v_pc_id
  for update;

  if v_cards is null then
    raise exception 'Player cards not found';
  end if;

  select (ord - 1), value
  into v_idx, v_card
  from jsonb_array_elements(v_cards) with ordinality as t(value, ord)
  where value ->> 'id' = p_card_id
    and coalesce((value ->> 'hole')::int, -1) = p_card_hole
    and value ->> 'type' in ('challenge', 'passive')
  order by ord
  limit 1;

  if v_idx is null then
    raise exception 'Challenge not found';
  end if;
  if coalesce((v_card ->> 'claimed')::boolean, false) then
    raise exception 'Challenge already claimed';
  end if;
  if coalesce((v_card ->> 'verificationPending')::boolean, false) then
    raise exception 'Challenge is already awaiting verification';
  end if;

  v_cards := jsonb_set(
    v_cards, array[v_idx::text, 'trialCombatDeputyId'],
    to_jsonb(p_deputy_id), true
  );
  v_cards := jsonb_set(
    v_cards, array[v_idx::text, 'trialCombatDeputyName'],
    to_jsonb(p_deputy_name), true
  );

  update public.player_cards
  set cards = v_cards, updated_at = now()
  where id = v_pc_id;

  return v_cards;
end;
$$;

grant execute on function public.assign_trial_combat_deputy(
  uuid, text, text, text, text, int
) to anon, authenticated;
