-- Server-authoritative dice and scoring.
--
-- Before this, the browser rolled the dice, computed the score and sent it
-- in: jamb_play_move only bounds-checked p_score, single-player scores were
-- inserted straight into jamb_games, and participants could UPDATE
-- jamb_matches directly. Any of those let a client post whatever it liked.
--
-- Now the database rolls (pgcrypto, rejection-sampled), keeps the current
-- turn's dice, enforces the 3-roll limit, the column order, announcements
-- and the counter obligation, and computes every score itself. The client
-- only says which dice to hold and which cell to write.
--
-- This migration is additive: the old paths keep working until
-- 20261101_jamb_lockdown.sql is applied after the new client is live.

------------------------------------------------------------------------
-- Rules (ports of src/game/rules.ts — keep the two in sync)
------------------------------------------------------------------------

create or replace function public.jamb_rows()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['ones','twos','threes','fours','fives','sixes',
               'max','min','tris','kenta','full','poker','jamb'];
$$;

-- scoreFor(): score a row for six dice; at most five dice count anywhere.
create or replace function public.jamb_score(p_row text, p_dice int[])
returns int
language plpgsql
immutable
set search_path = public
as $$
declare
  c int[] := array[0,0,0,0,0,0];
  d int; v int; two int; best int := 0; s int[]; idx int;
begin
  if p_dice is null or cardinality(p_dice) <> 6 then
    raise exception 'invalid dice';
  end if;
  foreach d in array p_dice loop
    if d is null or d < 1 or d > 6 then raise exception 'invalid dice'; end if;
    c[d] := c[d] + 1;
  end loop;

  idx := array_position(array['ones','twos','threes','fours','fives','sixes'], p_row);
  if idx is not null then
    return least(c[idx], 5) * idx;
  end if;

  select array_agg(x order by x) into s from unnest(p_dice) x;

  case p_row
    when 'max' then return s[2] + s[3] + s[4] + s[5] + s[6];
    when 'min' then return s[1] + s[2] + s[3] + s[4] + s[5];
    when 'tris' then
      for v in reverse 6..1 loop
        if c[v] >= 3 then return 3 * v + 10; end if;
      end loop;
      return 0;
    when 'kenta' then
      if c[2] > 0 and c[3] > 0 and c[4] > 0 and c[5] > 0 and c[6] > 0 then return 45; end if;
      if c[1] > 0 and c[2] > 0 and c[3] > 0 and c[4] > 0 and c[5] > 0 then return 35; end if;
      return 0;
    when 'full' then
      for v in reverse 6..1 loop
        if c[v] >= 3 then
          for two in reverse 6..1 loop
            if two <> v and c[two] >= 2 then
              best := greatest(best, 3 * v + 2 * two + 30);
            end if;
          end loop;
        end if;
      end loop;
      return best;
    when 'poker' then
      for v in reverse 6..1 loop
        if c[v] >= 4 then return 4 * v + 40; end if;
      end loop;
      return 0;
    when 'jamb' then
      for v in reverse 6..1 loop
        if c[v] >= 5 then return 5 * v + 50; end if;
      end loop;
      return 0;
    else
      raise exception 'invalid row';
  end case;
end $$;

-- Empty rows of a column, in sheet order.
create or replace function public.jamb_empty_rows(p_sheet jsonb, p_col text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(r order by ord), '{}')
  from unnest(public.jamb_rows()) with ordinality u(r, ord)
  where not (coalesce(p_sheet->p_col, '{}'::jsonb) ? r);
$$;

-- Game.tsx scorableIn(): may this cell be written right now?
create or replace function public.jamb_can_write(
  p_sheet jsonb, p_cols text[], p_col text, p_row text,
  p_announced text, p_forced text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  ordinary boolean;
  e text[];
begin
  if not (p_col = any(p_cols)) or not (p_row = any(public.jamb_rows())) then
    return false;
  end if;
  if coalesce(p_sheet->p_col, '{}'::jsonb) ? p_row then
    return false;
  end if;
  -- the opponent announced: that counter cell is the only legal move
  if p_forced is not null then
    return p_col = 'counter' and p_row = p_forced;
  end if;
  -- we announced: only that announce cell
  if p_announced is not null then
    return p_col = 'announce' and p_row = p_announced;
  end if;

  ordinary := cardinality(public.jamb_empty_rows(p_sheet, 'down')) > 0
           or cardinality(public.jamb_empty_rows(p_sheet, 'up')) > 0
           or cardinality(public.jamb_empty_rows(p_sheet, 'free')) > 0;

  case p_col
    when 'down' then
      return p_row = (public.jamb_empty_rows(p_sheet, 'down'))[1];
    when 'up' then
      e := public.jamb_empty_rows(p_sheet, 'up');
      return p_row = e[cardinality(e)];
    when 'free' then
      return true;
    when 'announce' then
      -- unannounced only in the endgame, so the game can't stall
      return not ordinary;
    when 'counter' then
      return not ordinary
         and cardinality(public.jamb_empty_rows(p_sheet, 'announce')) = 0;
    else
      return false;
  end case;
end $$;

create or replace function public.jamb_filled_cells(p_sheet jsonb)
returns int
language sql
immutable
set search_path = public
as $$
  select count(*)::int
  from unnest(array['down','up','free','announce','counter']) c
  cross join lateral jsonb_object_keys(coalesce(p_sheet->c, '{}'::jsonb));
$$;

-- existing function: pin its search_path (advisor hygiene)
alter function public.jamb_sheet_total(jsonb) set search_path = public;

------------------------------------------------------------------------
-- Dice
------------------------------------------------------------------------

-- Uniform 1..6 from a CSPRNG: bytes >= 252 are rejected so each face is
-- exactly equally likely.
create or replace function public.jamb_roll_die()
returns int
language plpgsql
volatile
set search_path = public, extensions
as $$
declare b int;
begin
  loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 252 then return b % 6 + 1; end if;
  end loop;
end $$;

-- Apply one roll to a turn: {dice, rolls, held, announced}.
-- p_hold lists die indexes (0..5) to keep; ignored on the first roll.
create or replace function public.jamb_next_roll(p_cur jsonb, p_hold int[])
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  cur jsonb := coalesce(p_cur, '{}'::jsonb);
  rolls int := coalesce((cur->>'rolls')::int, 0);
  hold int[] := coalesce(p_hold, '{}');
  dice int[] := '{}';
  h int; i int;
begin
  if rolls >= 3 then raise exception 'no rolls left'; end if;
  foreach h in array hold loop
    if h is null or h < 0 or h > 5 then raise exception 'invalid hold'; end if;
  end loop;
  if rolls = 0 then hold := '{}'; end if;
  for i in 0..5 loop
    if i = any(hold) then
      dice := dice || (cur->'dice'->>i)::int;
    else
      dice := dice || public.jamb_roll_die();
    end if;
  end loop;
  return cur || jsonb_build_object(
    'dice', to_jsonb(dice),
    'rolls', rolls + 1,
    'held', to_jsonb(hold));
end $$;

create or replace function public.jamb_cur_dice(p_cur jsonb)
returns int[]
language sql
immutable
set search_path = public
as $$
  select array_agg(v::int order by ord)
  from jsonb_array_elements_text(coalesce(p_cur->'dice', '[]'::jsonb)) with ordinality t(v, ord);
$$;

------------------------------------------------------------------------
-- Two-player: the turn lives in state->'cur'
------------------------------------------------------------------------

-- Lock the match and check it is the caller's turn.
create or replace function public.jamb_lock_turn(p_match uuid)
returns public.jamb_matches
language plpgsql
volatile
set search_path = public
as $$
declare me uuid := auth.uid(); m public.jamb_matches;
begin
  if me is null then raise exception 'authentication required'; end if;
  select * into m from public.jamb_matches where id = p_match for update;
  if not found then raise exception 'match not found'; end if;
  if m.player1 <> me and (m.player2 is null or m.player2 <> me) then
    raise exception 'not a participant';
  end if;
  if m.status <> 'active' then raise exception 'match not active'; end if;
  if m.turn is distinct from me then raise exception 'not your turn'; end if;
  return m;
end $$;

-- The counter cell the caller is forced into by the opponent's announce.
create or replace function public.jamb_forced_row(p_state jsonb, p_me uuid, p_opp uuid)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_state->'lastMove'->>'by' = p_opp::text
     and p_state->'lastMove'->>'col' = 'announce'
     and not (coalesce(p_state->'sheets'->(p_me::text)->'counter', '{}'::jsonb)
              ? (p_state->'lastMove'->>'row'))
    then p_state->'lastMove'->>'row'
  end;
$$;

create or replace function public.jamb_roll(p_match uuid, p_hold int[] default '{}')
returns public.jamb_matches
language plpgsql
security definer
set search_path = public
as $$
declare m public.jamb_matches;
begin
  m := public.jamb_lock_turn(p_match);
  update public.jamb_matches
     set state = state || jsonb_build_object('cur', public.jamb_next_roll(state->'cur', p_hold))
   where id = p_match
  returning * into m;
  return m;
end $$;

create or replace function public.jamb_announce(p_match uuid, p_row text)
returns public.jamb_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  m public.jamb_matches; opp uuid; cur jsonb;
begin
  m := public.jamb_lock_turn(p_match);
  opp := case when m.player1 = me then m.player2 else m.player1 end;
  cur := coalesce(m.state->'cur', '{}'::jsonb);
  if coalesce((cur->>'rolls')::int, 0) <> 1 then raise exception 'announce right after the first roll'; end if;
  if cur->>'announced' is not null then raise exception 'already announced'; end if;
  if public.jamb_forced_row(m.state, me, opp) is not null then raise exception 'counter-announce pending'; end if;
  if not (p_row = any(public.jamb_rows())) then raise exception 'invalid row'; end if;
  if coalesce(m.state->'sheets'->(me::text)->'announce', '{}'::jsonb) ? p_row then
    raise exception 'cell already filled';
  end if;
  update public.jamb_matches
     set state = state || jsonb_build_object('cur', cur || jsonb_build_object('announced', p_row))
   where id = p_match
  returning * into m;
  return m;
end $$;

-- New signature: no score from the client. (The old 4-argument version is
-- dropped by the lockdown migration.)
create or replace function public.jamb_play_move(p_match uuid, p_col text, p_row text)
returns public.jamb_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  m public.jamb_matches; opp uuid;
  cur jsonb; my_sheet jsonb; opp_sheet jsonb; new_state jsonb;
  v_score int; st text; win uuid; my_total int; opp_total int;
begin
  m := public.jamb_lock_turn(p_match);
  opp := case when m.player1 = me then m.player2 else m.player1 end;
  cur := coalesce(m.state->'cur', '{}'::jsonb);
  if coalesce((cur->>'rolls')::int, 0) < 1 then raise exception 'roll first'; end if;

  my_sheet := coalesce(m.state->'sheets'->(me::text), '{}'::jsonb);
  opp_sheet := coalesce(m.state->'sheets'->(opp::text), '{}'::jsonb);

  if not public.jamb_can_write(
       my_sheet, array['down','up','free','announce','counter'], p_col, p_row,
       cur->>'announced', public.jamb_forced_row(m.state, me, opp)) then
    raise exception 'move not allowed';
  end if;

  v_score := public.jamb_score(p_row, public.jamb_cur_dice(cur));
  my_sheet := my_sheet || jsonb_build_object(
    p_col, coalesce(my_sheet->p_col, '{}'::jsonb) || jsonb_build_object(p_row, v_score));

  new_state := (m.state - 'cur')
    || jsonb_build_object('sheets',
         coalesce(m.state->'sheets', '{}'::jsonb)
         || jsonb_build_object(me::text, my_sheet, opp::text, opp_sheet))
    || jsonb_build_object('lastMove',
         jsonb_build_object('by', me::text, 'col', p_col, 'row', p_row, 'score', v_score));

  if public.jamb_filled_cells(my_sheet) >= 65 and public.jamb_filled_cells(opp_sheet) >= 65 then
    st := 'finished';
    my_total := public.jamb_sheet_total(my_sheet);
    opp_total := public.jamb_sheet_total(opp_sheet);
    win := case when my_total > opp_total then me when my_total < opp_total then opp end;
    -- both scores are recorded by the database, never by a client
    insert into public.jamb_games (user_id, score) values (me, my_total), (opp, opp_total);
  else
    st := 'active';
  end if;

  update public.jamb_matches
     set state = new_state, turn = opp, status = st, winner = win
   where id = p_match
  returning * into m;
  return m;
end $$;

-- Leave a match / cancel a search or challenge (replaces direct UPDATEs).
create or replace function public.jamb_abandon(p_match uuid)
returns public.jamb_matches
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); m public.jamb_matches;
begin
  if me is null then raise exception 'authentication required'; end if;
  select * into m from public.jamb_matches where id = p_match for update;
  if not found or (m.player1 <> me and m.player2 is distinct from me) then
    raise exception 'match not found';
  end if;
  if m.status = 'active' then
    update public.jamb_matches
       set status = 'abandoned',
           winner = case when player1 = me then player2 else player1 end
     where id = p_match returning * into m;
  elsif m.status = 'waiting' and m.player1 = me then
    update public.jamb_matches set status = 'abandoned' where id = p_match returning * into m;
  elsif m.status = 'challenge' and m.player1 = me then
    update public.jamb_matches set status = 'declined' where id = p_match returning * into m;
  end if;
  return m;
end $$;

------------------------------------------------------------------------
-- Single player: games live in jamb_solo, scores are written on completion
------------------------------------------------------------------------

create table if not exists public.jamb_solo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','finished','abandoned')),
  throw_mode text not null default 'manual' check (throw_mode in ('manual','automatic')),
  sheet jsonb not null default '{}'::jsonb,
  cur jsonb not null default '{}'::jsonb,
  score int,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.jamb_solo enable row level security;

drop policy if exists "jamb_solo_select_own" on public.jamb_solo;
create policy "jamb_solo_select_own" on public.jamb_solo
  for select using ((select auth.uid()) = user_id);
-- no insert/update/delete policies: only the RPCs below write here

create index if not exists jamb_solo_user_active_idx
  on public.jamb_solo (user_id) where status = 'active';

drop trigger if exists jamb_solo_touch on public.jamb_solo;
create trigger jamb_solo_touch
  before update on public.jamb_solo
  for each row execute function public.jamb_touch_updated_at();

create or replace function public.jamb_solo_lock(p_game uuid)
returns public.jamb_solo
language plpgsql
volatile
set search_path = public
as $$
declare g public.jamb_solo;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into g from public.jamb_solo where id = p_game for update;
  if not found or g.user_id <> auth.uid() then raise exception 'game not found'; end if;
  if g.status <> 'active' then raise exception 'game not active'; end if;
  return g;
end $$;

-- Start a fresh game (any unfinished one is abandoned).
create or replace function public.jamb_solo_start(p_throw_mode text default 'manual')
returns public.jamb_solo
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); g public.jamb_solo;
begin
  if me is null then raise exception 'authentication required'; end if;
  update public.jamb_solo set status = 'abandoned'
   where user_id = me and status = 'active';
  insert into public.jamb_solo (user_id, throw_mode)
    values (me, case when p_throw_mode = 'automatic' then 'automatic' else 'manual' end)
  returning * into g;
  return g;
end $$;

create or replace function public.jamb_solo_roll(p_game uuid, p_hold int[] default '{}')
returns public.jamb_solo
language plpgsql
security definer
set search_path = public
as $$
declare g public.jamb_solo;
begin
  g := public.jamb_solo_lock(p_game);
  update public.jamb_solo set cur = public.jamb_next_roll(cur, p_hold)
   where id = p_game returning * into g;
  return g;
end $$;

create or replace function public.jamb_solo_announce(p_game uuid, p_row text)
returns public.jamb_solo
language plpgsql
security definer
set search_path = public
as $$
declare g public.jamb_solo;
begin
  g := public.jamb_solo_lock(p_game);
  if coalesce((g.cur->>'rolls')::int, 0) <> 1 then raise exception 'announce right after the first roll'; end if;
  if g.cur->>'announced' is not null then raise exception 'already announced'; end if;
  if not (p_row = any(public.jamb_rows())) then raise exception 'invalid row'; end if;
  if coalesce(g.sheet->'announce', '{}'::jsonb) ? p_row then raise exception 'cell already filled'; end if;
  update public.jamb_solo set cur = cur || jsonb_build_object('announced', p_row)
   where id = p_game returning * into g;
  return g;
end $$;

create or replace function public.jamb_solo_move(p_game uuid, p_col text, p_row text)
returns public.jamb_solo
language plpgsql
security definer
set search_path = public
as $$
declare g public.jamb_solo; v_sheet jsonb; v_score int; v_total int;
begin
  g := public.jamb_solo_lock(p_game);
  if coalesce((g.cur->>'rolls')::int, 0) < 1 then raise exception 'roll first'; end if;
  if not public.jamb_can_write(
       g.sheet, array['down','up','free','announce'], p_col, p_row,
       g.cur->>'announced', null) then
    raise exception 'move not allowed';
  end if;

  v_score := public.jamb_score(p_row, public.jamb_cur_dice(g.cur));
  v_sheet := g.sheet || jsonb_build_object(
    p_col, coalesce(g.sheet->p_col, '{}'::jsonb) || jsonb_build_object(p_row, v_score));

  if public.jamb_filled_cells(v_sheet) >= 52 then
    v_total := public.jamb_sheet_total(v_sheet);
    update public.jamb_solo
       set sheet = v_sheet, cur = '{}'::jsonb, status = 'finished',
           score = v_total, finished_at = now()
     where id = p_game returning * into g;
    insert into public.jamb_games (user_id, score, dice_count, throw_mode, duration_seconds)
      values (g.user_id, v_total, 6, g.throw_mode,
              least(86400, greatest(0, extract(epoch from now() - g.started_at)::int)));
  else
    update public.jamb_solo set sheet = v_sheet, cur = '{}'::jsonb
     where id = p_game returning * into g;
  end if;
  return g;
end $$;

------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------

do $$
declare f text;
begin
  foreach f in array array[
    'jamb_roll(uuid, int[])',
    'jamb_announce(uuid, text)',
    'jamb_play_move(uuid, text, text)',
    'jamb_abandon(uuid)',
    'jamb_solo_start(text)',
    'jamb_solo_roll(uuid, int[])',
    'jamb_solo_announce(uuid, text)',
    'jamb_solo_move(uuid, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- internal helpers: callable only from the definer functions above
  foreach f in array array[
    'jamb_roll_die()',
    'jamb_next_roll(jsonb, int[])',
    'jamb_lock_turn(uuid)',
    'jamb_solo_lock(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
