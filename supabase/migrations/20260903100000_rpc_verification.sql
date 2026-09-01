-- Server-authoritative mutations, slice 2: challenge verification.
--
-- request_challenge_verification  — opens a verification, marks the card pending
-- resolve_challenge_verification  — confirms/fails it: settles the card, moves
--                                   points, writes the feed events
--
-- Same shape as slice 1: is_game_member gate, row locks, all guards in plpgsql.
-- The "free reroll once all three challenges are claimed" side effect stays in
-- the client for now (it calls the reroll path, which becomes an RPC in slice
-- 3); resolve_* returns { claimant_id, all_claimed } so the client can trigger
-- it. The client falls back to its old logic when a function is absent.

-- ── request_challenge_verification ─────────────────────────────────────────
create or replace function public.request_challenge_verification(
  p_game_id uuid,
  p_claimant_id text,
  p_claimant_name text,
  p_card_id text,
  p_card_hole int,
  p_points_to_award int,
  p_title text,
  p_description text,
  p_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pc_id text := p_game_id::text || '_' || p_claimant_id;
  v_cards jsonb;
  v_idx int;
  v_card jsonb;
  v_deputy_id text;
  v_deputy_name text;
  v_has_deputy boolean;
  v_vid uuid := gen_random_uuid();
  v_cleared jsonb;
begin
  if not public.is_game_member(p_game_id, p_claimant_id) then
    raise exception 'You are not in this game' using errcode = '42501';
  end if;

  select cards into v_cards
  from public.player_cards where id = v_pc_id for update;
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

  v_deputy_id := nullif(btrim(coalesce(v_card ->> 'trialCombatDeputyId', '')), '');
  v_deputy_name := nullif(btrim(coalesce(v_card ->> 'trialCombatDeputyName', '')), '');
  v_has_deputy := v_deputy_id is not null or v_deputy_name is not null;

  insert into public.challenge_verifications (
    id, game_id, claimant_id, claimant_name, card_id, hole, points_to_award,
    challenge_title, challenge_description, challenge_type, status, created_at,
    deputy_id, deputy_name
  )
  values (
    v_vid, p_game_id, p_claimant_id, p_claimant_name, p_card_id, p_card_hole,
    p_points_to_award, p_title, p_description, coalesce(p_type, ''), 'pending',
    now(),
    case when v_has_deputy then v_deputy_id end,
    case when v_has_deputy then v_deputy_name end
  );

  v_cleared := (v_card - 'trialCombatDeputyId' - 'trialCombatDeputyName')
    || jsonb_build_object(
         'verificationPending', true,
         'verificationRequestId', v_vid::text
       );
  v_cards := jsonb_set(v_cards, array[v_idx::text], v_cleared, true);
  update public.player_cards
  set cards = v_cards, updated_at = now()
  where id = v_pc_id;

  insert into public.game_events (
    game_id, player_id, player_name, event_type, event_data, timestamp
  )
  values (
    p_game_id, p_claimant_id, p_claimant_name,
    'challenge_verification_requested',
    jsonb_build_object(
      'verificationId', v_vid::text, 'cardId', p_card_id, 'hole', p_card_hole,
      'pointsToAward', p_points_to_award, 'title', p_title,
      'description', p_description
    )
    || case
         when v_deputy_id is not null
         then jsonb_build_object(
                'deputyId', v_deputy_id,
                'deputyName', coalesce(v_deputy_name, '')
              )
         else '{}'::jsonb
       end,
    now()
  );

  return v_vid;
end;
$$;

grant execute on function public.request_challenge_verification(
  uuid, text, text, text, int, int, text, text, text
) to anon, authenticated;

-- ── resolve_challenge_verification ─────────────────────────────────────────
create or replace function public.resolve_challenge_verification(
  p_game_id uuid,
  p_verification_id uuid,
  p_verifier_id text,
  p_verifier_name text,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.challenge_verifications;
  v_pc_id text;
  v_cards jsonb;
  v_idx int;
  v_card jsonb;
  v_claimant_id text;
  v_card_id text;
  v_hole int;
  v_pts int;
  v_deputy_id text;
  v_has_deputy boolean;
  v_succeeded boolean := p_outcome = 'succeeded';
  v_now timestamptz := now();
  v_pp jsonb;
  v_hole_total int;
  v_hole_claimed int;
begin
  select * into v_row
  from public.challenge_verifications
  where id = p_verification_id and game_id = p_game_id
  for update;

  if v_row.id is null or v_row.status <> 'pending' then
    raise exception 'Verification is no longer pending';
  end if;

  v_claimant_id := coalesce(v_row.claimant_id, '');
  if v_claimant_id = p_verifier_id then
    raise exception 'You cannot verify your own challenge';
  end if;
  v_card_id := coalesce(v_row.card_id, '');
  v_hole := coalesce(v_row.hole, 1);
  v_pts := coalesce(v_row.points_to_award, 0);
  v_deputy_id := btrim(coalesce(v_row.deputy_id, ''));
  v_has_deputy := length(v_deputy_id) > 0;

  v_pc_id := p_game_id::text || '_' || v_claimant_id;
  select cards into v_cards
  from public.player_cards where id = v_pc_id for update;
  if v_cards is null then
    raise exception 'Player cards not found';
  end if;

  select (ord - 1), value
  into v_idx, v_card
  from jsonb_array_elements(v_cards) with ordinality as t(value, ord)
  where value ->> 'id' = v_card_id
    and coalesce((value ->> 'hole')::int, -1) = v_hole
    and value ->> 'type' in ('challenge', 'passive')
  order by ord
  limit 1;

  if v_idx is null then
    raise exception 'Challenge card not found';
  end if;
  if coalesce(v_card ->> 'verificationRequestId', '') <> p_verification_id::text then
    raise exception 'Challenge no longer matches this verification';
  end if;

  v_cards := jsonb_set(
    v_cards,
    array[v_idx::text],
    (v_card - 'verificationPending' - 'verificationRequestId')
      || jsonb_build_object('claimed', true),
    true
  );

  update public.challenge_verifications set
    status = case when v_succeeded then 'confirmed' else 'failed' end,
    verifier_id = p_verifier_id,
    verifier_name = p_verifier_name,
    resolved_at = v_now,
    confirmation = case
      when v_succeeded then jsonb_build_object(
        'byPlayerId', p_verifier_id, 'byPlayerName', p_verifier_name,
        'confirmedAt', v_now
      )
      else jsonb_build_object(
        'byPlayerId', p_verifier_id, 'byPlayerName', p_verifier_name,
        'resolvedAt', v_now, 'outcome', 'failed'
      )
    end
  where id = p_verification_id;

  if v_succeeded and v_pts > 0 then
    select player_points into v_pp
    from public.games where id = p_game_id for update;
    v_pp := jsonb_set(
      v_pp, array[v_claimant_id],
      to_jsonb(greatest(0, floor(
        coalesce((v_pp ->> v_claimant_id)::numeric, 0) + v_pts
      ))::int),
      true
    );
    if v_has_deputy then
      v_pp := jsonb_set(
        v_pp, array[v_deputy_id],
        to_jsonb(greatest(0, floor(
          coalesce((v_pp ->> v_deputy_id)::numeric, 0) + v_pts
        ))::int),
        true
      );
    end if;
    update public.games
    set player_points = v_pp, updated_at = now() where id = p_game_id;
  elsif not v_succeeded and v_has_deputy then
    select player_points into v_pp
    from public.games where id = p_game_id for update;
    v_pp := jsonb_set(
      v_pp, array[v_claimant_id],
      to_jsonb(greatest(0, floor(
        coalesce((v_pp ->> v_claimant_id)::numeric, 0) - 1
      ))::int),
      true
    );
    update public.games
    set player_points = v_pp, updated_at = now() where id = p_game_id;
  end if;

  update public.player_cards
  set cards = v_cards, updated_at = now() where id = v_pc_id;

  if v_succeeded then
    insert into public.game_events (
      game_id, player_id, player_name, event_type, event_data, timestamp
    )
    values (
      p_game_id, v_claimant_id, coalesce(v_row.claimant_name, 'Player'),
      'challenge_claimed',
      jsonb_build_object(
        'id', v_card_id, 'pointsAwarded', v_pts, 'verifiedBy', p_verifier_name,
        'verifierId', p_verifier_id, 'verificationId', p_verification_id::text
      )
      || case
           when v_has_deputy
           then jsonb_build_object('trialCombatDeputyId', v_deputy_id)
           else '{}'::jsonb
         end,
      now()
    ),
    (
      p_game_id, p_verifier_id, p_verifier_name,
      'challenge_verification_confirmed',
      jsonb_build_object(
        'verificationId', p_verification_id::text, 'claimantId', v_claimant_id,
        'claimantName', v_row.claimant_name, 'title', v_row.challenge_title
      ),
      now()
    );
  else
    insert into public.game_events (
      game_id, player_id, player_name, event_type, event_data, timestamp
    )
    values (
      p_game_id, p_verifier_id, p_verifier_name,
      'challenge_verification_failed',
      jsonb_build_object(
        'verificationId', p_verification_id::text, 'claimantId', v_claimant_id,
        'claimantName', v_row.claimant_name, 'title', v_row.challenge_title
      ),
      now()
    );
  end if;

  select
    count(*) filter (
      where value ->> 'type' in ('challenge', 'passive')
        and coalesce((value ->> 'hole')::int, v_hole) = v_hole
    ),
    count(*) filter (
      where value ->> 'type' in ('challenge', 'passive')
        and coalesce((value ->> 'hole')::int, v_hole) = v_hole
        and coalesce((value ->> 'claimed')::boolean, false)
    )
  into v_hole_total, v_hole_claimed
  from jsonb_array_elements(v_cards) as t(value);

  return jsonb_build_object(
    'claimant_id', v_claimant_id,
    'all_claimed', (v_hole_total = 3 and v_hole_claimed = 3)
  );
end;
$$;

grant execute on function public.resolve_challenge_verification(
  uuid, uuid, text, text, text
) to anon, authenticated;
