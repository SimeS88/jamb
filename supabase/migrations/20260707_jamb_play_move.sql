-- Server-side move application: atomic, turn-validated, visible errors.
-- (Applied to the Supabase project as jamb_play_move_and_hardening; also
-- includes the find_match self-heal and the raised score bound.)

create or replace function public.jamb_sheet_total(sheet jsonb)
returns int
language plpgsql
immutable
as $$
declare
  c text; col jsonb; total int := 0; up_sum int; mid int; low int;
begin
  foreach c in array array['down','up','free','announce','counter'] loop
    col := coalesce(sheet->c, '{}'::jsonb);
    up_sum := coalesce((col->>'ones')::int,0) + coalesce((col->>'twos')::int,0)
            + coalesce((col->>'threes')::int,0) + coalesce((col->>'fours')::int,0)
            + coalesce((col->>'fives')::int,0) + coalesce((col->>'sixes')::int,0);
    if (col ?& array['ones','twos','threes','fours','fives','sixes']) and up_sum >= 60 then
      up_sum := up_sum + 30;
    end if;
    if col ?& array['max','min','ones'] then
      mid := greatest(0, (col->>'max')::int - (col->>'min')::int) * (col->>'ones')::int;
    else
      mid := 0;
    end if;
    low := coalesce((col->>'tris')::int,0) + coalesce((col->>'kenta')::int,0)
         + coalesce((col->>'full')::int,0) + coalesce((col->>'poker')::int,0)
         + coalesce((col->>'jamb')::int,0);
    total := total + up_sum + mid + low;
  end loop;
  return total;
end $$;

create or replace function public.jamb_play_move(p_match uuid, p_col text, p_row text, p_score int)
returns public.jamb_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  m public.jamb_matches;
  opp uuid; my_sheet jsonb; opp_sheet jsonb; new_state jsonb;
  my_cells int; opp_cells int; st text; win uuid;
begin
  if me is null then raise exception 'authentication required'; end if;
  if p_col not in ('down','up','free','announce','counter') then raise exception 'invalid column'; end if;
  if p_row not in ('ones','twos','threes','fours','fives','sixes','max','min','tris','kenta','full','poker','jamb') then
    raise exception 'invalid row';
  end if;
  if p_score < 0 or p_score > 100 then raise exception 'invalid score'; end if;

  select * into m from public.jamb_matches where id = p_match for update;
  if not found then raise exception 'match not found'; end if;
  if m.player1 <> me and (m.player2 is null or m.player2 <> me) then raise exception 'not a participant'; end if;
  if m.status <> 'active' then raise exception 'match not active'; end if;
  if m.turn is distinct from me then raise exception 'not your turn'; end if;

  opp := case when m.player1 = me then m.player2 else m.player1 end;
  my_sheet := coalesce(m.state->'sheets'->(me::text), '{}'::jsonb);
  opp_sheet := coalesce(m.state->'sheets'->(opp::text), '{}'::jsonb);
  if coalesce(my_sheet->p_col, '{}'::jsonb) ? p_row then raise exception 'cell already filled'; end if;

  my_sheet := my_sheet || jsonb_build_object(
    p_col, coalesce(my_sheet->p_col, '{}'::jsonb) || jsonb_build_object(p_row, p_score));

  new_state := m.state
    || jsonb_build_object('sheets',
         coalesce(m.state->'sheets', '{}'::jsonb)
         || jsonb_build_object(me::text, my_sheet, opp::text, opp_sheet))
    || jsonb_build_object('lastMove', jsonb_build_object('by', me::text, 'col', p_col, 'row', p_row));

  select count(*) into my_cells from unnest(array['down','up','free','announce','counter']) c
    cross join lateral jsonb_object_keys(coalesce(my_sheet->c, '{}'::jsonb));
  select count(*) into opp_cells from unnest(array['down','up','free','announce','counter']) c
    cross join lateral jsonb_object_keys(coalesce(opp_sheet->c, '{}'::jsonb));

  if my_cells >= 65 and opp_cells >= 65 then
    st := 'finished';
    win := case
      when public.jamb_sheet_total(my_sheet) > public.jamb_sheet_total(opp_sheet) then me
      when public.jamb_sheet_total(my_sheet) < public.jamb_sheet_total(opp_sheet) then opp
      else null end;
  else
    st := 'active'; win := null;
  end if;

  update public.jamb_matches
    set state = new_state, turn = opp, status = st, winner = win
    where id = p_match
    returning * into m;
  return m;
end $$;

revoke all on function public.jamb_play_move(uuid, text, text, int) from public;
revoke all on function public.jamb_play_move(uuid, text, text, int) from anon;
grant execute on function public.jamb_play_move(uuid, text, text, int) to authenticated;

alter table public.jamb_games drop constraint if exists jamb_games_score_check;
alter table public.jamb_games add constraint jamb_games_score_check check (score >= 0 and score <= 4000);
