-- Server-authoritative mutations, slice 3a: market + attacks (no card draws).
--
--   bank_offer_action          — buy a hole offer into your bag (points check)
--   mark_hole_action_consumed  — mark a hole offer used
--   discard_banked_action_card / discard_pending_action_card / remove_action_card
--   resolve_attack             — the attack dispatcher (022/023/024/025/030)
--   resolve_action_steal_copies — "copy my next card" resolution
--
-- Same shape as slices 1–2. Reroll and play-from-bag (which draw new cards)
-- come in slice 3b. Clients fall back to the old logic when a function is
-- absent.

-- ── bank_offer_action ─────────────────────────────────────────────────────
create or replace function public.bank_offer_action(
  p_game_id uuid,
  p_player_id text,
  p_card_id text,
  p_card_hole int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pc_id text := p_game_id::text || '_' || p_player_id;
  v_hole int;
  v_locked jsonb;
  v_pp jsonb;
  v_cards jsonb;
  v_idx int;
  v_card jsonb;
  v_cost numeric;
  v_balance numeric;
begin
  if not public.is_game_member(p_game_id, p_player_id) then
    raise exception 'You are not in this game' using errcode = '42501';
  end if;

  select current_hole, action_buy_locked_until_hole, player_points
    into v_hole, v_locked, v_pp
  from public.games where id = p_game_id for update;
  if v_hole is null then
    raise exception 'Game not found';
  end if;

  if coalesce((coalesce(v_locked, '{}'::jsonb) ->> p_player_id)::int, 0) >= v_hole
  then
    raise exception 'Action buying is locked for this hole';
  end if;
  if p_card_hole <> v_hole then
    raise exception 'That action is not part of this hole''s offers';
  end if;

  select cards into v_cards
  from public.player_cards where id = v_pc_id for update;
  if v_cards is null then
    raise exception 'Player cards not found';
  end if;

  select (ord - 1), value
  into v_idx, v_card
  from jsonb_array_elements(v_cards) with ordinality as t(value, ord)
  where value ->> 'type' = 'action'
    and value ->> 'id' = p_card_id
    and coalesce((value ->> 'hole')::int, -1) = p_card_hole
    and coalesce((value ->> 'banked')::boolean, false) = false
    and coalesce((value ->> 'pendingBank')::boolean, false) = false
    and coalesce((value ->> 'offerConsumed')::boolean, false) = false
  order by ord
  limit 1;
  if v_idx is null then
    raise exception 'Action offer not found or already saved';
  end if;

  v_cost := least(9999, greatest(0, coalesce((v_card ->> 'points')::numeric, 1)));
  v_balance := coalesce((coalesce(v_pp, '{}'::jsonb) ->> p_player_id)::numeric, 0);
  if v_balance < v_cost then
    raise exception 'Need at least % points to save an action', v_cost::int;
  end if;

  v_cards := jsonb_set(
    v_cards, array[v_idx::text],
    v_card || jsonb_build_object('offerConsumed', true, 'pendingBank', true),
    true
  );
  update public.player_cards
  set cards = v_cards, updated_at = now() where id = v_pc_id;

  if v_cost > 0 then
    v_pp := jsonb_set(
      coalesce(v_pp, '{}'::jsonb), array[p_player_id],
      to_jsonb(greatest(0, floor(v_balance - v_cost))::int), true
    );
    update public.games
    set player_points = v_pp, updated_at = now() where id = p_game_id;
  end if;
end;
$$;

grant execute on function public.bank_offer_action(uuid, text, text, int)
  to anon, authenticated;

-- ── mark_hole_action_consumed ─────────────────────────────────────────────
create or replace function public.mark_hole_action_consumed(
  p_game_id uuid,
  p_player_id text,
  p_card_id text,
  p_card_hole int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pc_id text := p_game_id::text || '_' || p_player_id;
  v_hole int;
  v_cards jsonb;
  v_idx int;
  v_card jsonb;
begin
  if not public.is_game_member(p_game_id, p_player_id) then
    raise exception 'You are not in this game' using errcode = '42501';
  end if;
  select current_hole into v_hole from public.games where id = p_game_id;
  if v_hole is null then
    raise exception 'Game not found';
  end if;
  if p_card_hole <> v_hole then
    raise exception 'That action is not part of this hole''s offers';
  end if;

  select cards into v_cards
  from public.player_cards where id = v_pc_id for update;
  if v_cards is null then
    raise exception 'Player cards not found';
  end if;

  select (ord - 1), value
  into v_idx, v_card
  from jsonb_array_elements(v_cards) with ordinality as t(value, ord)
  where value ->> 'type' = 'action'
    and value ->> 'id' = p_card_id
    and coalesce((value ->> 'hole')::int, -1) = p_card_hole
    and coalesce((value ->> 'offerConsumed')::boolean, false) = false
    and not (
      coalesce((value ->> 'banked')::boolean, false)
      and not coalesce((value ->> 'pendingBank')::boolean, false)
    )
  order by ord
  limit 1;
  if v_idx is null then
    raise exception 'Action offer not found or already used';
  end if;

  update public.player_cards
  set cards = jsonb_set(
        v_cards, array[v_idx::text],
        v_card || jsonb_build_object('offerConsumed', true), true
      ),
      updated_at = now()
  where id = v_pc_id;
end;
$$;

grant execute on function public.mark_hole_action_consumed(uuid, text, text, int)
  to anon, authenticated;

-- ── discard helpers ──────────────────────────────────────────────────────
-- Removes the first array element matching (type=action, id) under a mode
-- filter; tries the given hole first, then any hole (mirrors the client).
create or replace function public._discard_action_card(
  p_game_id uuid,
  p_player_id text,
  p_card_id text,
  p_card_hole int,
  p_mode text,           -- 'banked' | 'pending' | 'any'
  p_not_found_msg text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pc_id text := p_game_id::text || '_' || p_player_id;
  v_cards jsonb;
  v_idx int;
begin
  if not public.is_game_member(p_game_id, p_player_id) then
    raise exception 'You are not in this game' using errcode = '42501';
  end if;

  select cards into v_cards
  from public.player_cards where id = v_pc_id for update;
  if v_cards is null then
    raise exception 'Player cards not found';
  end if;

  select ord - 1 into v_idx
  from jsonb_array_elements(v_cards) with ordinality as t(value, ord)
  where value ->> 'type' = 'action'
    and value ->> 'id' = p_card_id
    and (
      case p_mode
        when 'banked' then coalesce((value ->> 'banked')::boolean, false)
          and not coalesce((value ->> 'pendingBank')::boolean, false)
        when 'pending' then coalesce((value ->> 'pendingBank')::boolean, false)
        else true
      end
    )
    and (
      p_mode = 'any'
      or coalesce((value ->> 'hole')::int, -1) = p_card_hole
    )
  order by ord
  limit 1;

  if v_idx is null then
    -- retry ignoring the hole (client does the same fallback)
    select ord - 1 into v_idx
    from jsonb_array_elements(v_cards) with ordinality as t(value, ord)
    where value ->> 'type' = 'action'
      and value ->> 'id' = p_card_id
      and (
        case p_mode
          when 'banked' then coalesce((value ->> 'banked')::boolean, false)
            and not coalesce((value ->> 'pendingBank')::boolean, false)
          when 'pending' then coalesce((value ->> 'pendingBank')::boolean, false)
          else true
        end
      )
    order by ord
    limit 1;
  end if;

  if v_idx is null then
    raise exception '%', p_not_found_msg;
  end if;

  update public.player_cards
  set cards = v_cards - v_idx, updated_at = now()
  where id = v_pc_id;
end;
$$;

create or replace function public.discard_banked_action_card(
  p_game_id uuid, p_player_id text, p_card_id text, p_card_hole int
) returns void language sql security definer set search_path = public as $$
  select public._discard_action_card(
    p_game_id, p_player_id, p_card_id, p_card_hole, 'banked',
    'Saved action not found'
  );
$$;

create or replace function public.discard_pending_action_card(
  p_game_id uuid, p_player_id text, p_card_id text, p_card_hole int
) returns void language sql security definer set search_path = public as $$
  select public._discard_action_card(
    p_game_id, p_player_id, p_card_id, p_card_hole, 'pending',
    'Pending saved action not found'
  );
$$;

create or replace function public.remove_action_card(
  p_game_id uuid, p_player_id text, p_card_id text, p_card_hole int
) returns void language sql security definer set search_path = public as $$
  select public._discard_action_card(
    p_game_id, p_player_id, p_card_id, p_card_hole, 'any',
    'Action card not found'
  );
$$;

grant execute on function public.discard_banked_action_card(uuid, text, text, int) to anon, authenticated;
grant execute on function public.discard_pending_action_card(uuid, text, text, int) to anon, authenticated;
grant execute on function public.remove_action_card(uuid, text, text, int) to anon, authenticated;

-- ── resolve_attack ───────────────────────────────────────────────────────
create or replace function public.resolve_attack(
  p_game_id uuid,
  p_attacker_id text,
  p_attacker_name text,
  p_target_id text,
  p_target_name text,
  p_card jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := coalesce(p_card ->> 'id', '');
  v_title text := coalesce(p_card ->> 'title', 'Attack');
  v_outcome jsonb;
  v_hole int;
  v_target_pc text := p_game_id::text || '_' || p_target_id;
  v_thief_pc text := p_game_id::text || '_' || p_attacker_id;
  v_tcards jsonb;
  v_cand int[];
  v_idx int;
  v_removed jsonb;
  v_pp jsonb;
  v_tbal int;
  v_take int;
  v_raw jsonb;
begin
  if not public.is_game_member(p_game_id, p_attacker_id) then
    raise exception 'You are not in this game' using errcode = '42501';
  end if;

  if v_id in ('action_022', 'action_023') then
    select cards into v_tcards
    from public.player_cards where id = v_target_pc for update;
    if v_tcards is null then
      raise exception 'Player cards not found';
    end if;

    select array_agg((ord - 1) order by ord) into v_cand
    from jsonb_array_elements(v_tcards) with ordinality as t(value, ord)
    where value ->> 'type' = 'action'
      and coalesce((value ->> 'inventoryUsed')::boolean, false) = false
      and not (
        coalesce((value ->> 'offerConsumed')::boolean, false)
        and not coalesce((value ->> 'banked')::boolean, false)
        and not coalesce((value ->> 'pendingBank')::boolean, false)
      );

    if v_cand is null or coalesce(array_length(v_cand, 1), 0) = 0 then
      v_outcome := jsonb_build_object(
        'kind',
        case when v_id = 'action_022'
          then 'no_stealable_cards' else 'nothing_to_destroy' end
      );
    else
      v_idx := v_cand[1 + floor(random() * array_length(v_cand, 1))::int];
      v_removed := (v_tcards -> v_idx)
        - 'pendingBank' - 'inventoryUsed' - 'offerConsumed';
      v_tcards := v_tcards - v_idx;
      update public.player_cards
      set cards = v_tcards, updated_at = now() where id = v_target_pc;

      if v_id = 'action_022' then
        v_removed := v_removed || jsonb_build_object('banked', true);
        update public.player_cards
        set cards = coalesce(cards, '[]'::jsonb) || jsonb_build_array(v_removed),
            updated_at = now()
        where id = v_thief_pc;
        v_outcome := jsonb_build_object(
          'kind', 'stole_card',
          'cardTitle', coalesce(v_removed ->> 'title', 'Action card')
        );
      else
        v_outcome := jsonb_build_object(
          'kind', 'destroyed_card',
          'cardTitle', coalesce(v_removed ->> 'title', 'action')
        );
      end if;
    end if;

  elsif v_id = 'action_024' then
    select current_hole, action_buy_locked_until_hole
      into v_hole, v_raw
    from public.games where id = p_game_id for update;
    update public.games
    set action_buy_locked_until_hole =
          coalesce(v_raw, '{}'::jsonb)
          || jsonb_build_object(p_target_id, v_hole),
        updated_at = now()
    where id = p_game_id;
    v_outcome := jsonb_build_object('kind', 'market_locked');

  elsif v_id = 'action_025' then
    select player_points into v_pp
    from public.games where id = p_game_id for update;
    v_tbal := greatest(0, floor(
      coalesce((coalesce(v_pp, '{}'::jsonb) ->> p_target_id)::numeric, 0)
    ))::int;
    if v_tbal <= 0 then
      v_outcome := jsonb_build_object('kind', 'no_points_to_steal');
    else
      v_take := least(1 + floor(random() * 5)::int, v_tbal);
      v_pp := jsonb_set(
        coalesce(v_pp, '{}'::jsonb), array[p_target_id],
        to_jsonb(v_tbal - v_take), true
      );
      v_pp := jsonb_set(
        v_pp, array[p_attacker_id],
        to_jsonb(greatest(0, floor(
          coalesce((v_pp ->> p_attacker_id)::numeric, 0)
        ))::int + v_take),
        true
      );
      update public.games
      set player_points = v_pp, updated_at = now() where id = p_game_id;
      v_outcome := jsonb_build_object('kind', 'stole_points', 'amount', v_take);
    end if;

  elsif v_id = 'action_030' then
    select action_steal_armed into v_raw
    from public.games where id = p_game_id for update;
    update public.games
    set action_steal_armed =
          coalesce(v_raw, '{}'::jsonb)
          || jsonb_build_object(p_attacker_id, true),
        updated_at = now()
    where id = p_game_id;
    v_outcome := jsonb_build_object('kind', 'action_steal_armed');

  else
    v_outcome := jsonb_build_object('kind', 'tabletop', 'cardTitle', v_title);
  end if;

  insert into public.game_events (
    game_id, player_id, player_name, event_type, event_data, timestamp
  )
  values (
    p_game_id, p_attacker_id,
    coalesce(nullif(btrim(p_attacker_name), ''), 'Someone'),
    'attack_resolved',
    jsonb_build_object(
      'targetPlayerId', p_target_id,
      'targetPlayerName', coalesce(nullif(btrim(p_target_name), ''), 'Player'),
      'attackCardId', v_id,
      'attackCardTitle', v_title,
      'outcome', v_outcome
    ),
    now()
  );

  return v_outcome;
end;
$$;

grant execute on function public.resolve_attack(
  uuid, text, text, text, text, jsonb
) to anon, authenticated;

-- ── resolve_action_steal_copies ──────────────────────────────────────────
create or replace function public.resolve_action_steal_copies(
  p_game_id uuid,
  p_source_player_id text,
  p_card jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_armed jsonb;
  v_pid text;
  v_orig_id text;
  v_copy jsonb;
begin
  if lower(btrim(coalesce(p_card ->> 'title', ''))) = 'action steal' then
    return;
  end if;
  if coalesce(p_card ->> 'type', '') <> 'action' then
    return;
  end if;

  select action_steal_armed into v_armed
  from public.games where id = p_game_id for update;
  v_armed := coalesce(v_armed, '{}'::jsonb);
  if v_armed = '{}'::jsonb then
    return;
  end if;

  v_orig_id := coalesce(p_card ->> 'id', 'action_copy');

  for v_pid in
    select key from jsonb_each(v_armed) where value = 'true'::jsonb
  loop
    v_copy := (p_card - 'pendingBank' - 'inventoryUsed' - 'offerConsumed')
      || jsonb_build_object(
           'id', v_orig_id || '_copy_' || gen_random_uuid()::text,
           'copiedCardId', v_orig_id,
           'copiedFromPlayerId', p_source_player_id,
           'banked', true
         );
    update public.player_cards
    set cards = coalesce(cards, '[]'::jsonb) || jsonb_build_array(v_copy),
        updated_at = now()
    where id = p_game_id::text || '_' || v_pid;
  end loop;

  update public.games
  set action_steal_armed = '{}'::jsonb, updated_at = now()
  where id = p_game_id;
end;
$$;

grant execute on function public.resolve_action_steal_copies(uuid, text, jsonb)
  to anon, authenticated;
