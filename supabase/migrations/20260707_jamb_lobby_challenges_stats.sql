-- Lobby: competitor list, direct challenges with confirmation, match history

-- signed-in players may see who's registered (display names only are stored)
create policy "jamb_profiles_select_authenticated" on public.jamb_profiles
  for select to authenticated using (true);

alter table public.jamb_matches drop constraint if exists jamb_matches_status_check;
alter table public.jamb_matches add constraint jamb_matches_status_check
  check (status in ('waiting','challenge','active','finished','abandoned','declined'));

-- Challenge a specific opponent (they must accept before the match starts)
create or replace function public.jamb_challenge(p_opponent uuid)
returns public.jamb_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  myname text;
  m public.jamb_matches;
begin
  if me is null then raise exception 'authentication required'; end if;
  if p_opponent = me then raise exception 'cannot challenge yourself'; end if;
  select display_name into myname from public.jamb_profiles where id = me;
  if myname is null then raise exception 'profile required'; end if;
  if not exists (select 1 from public.jamb_profiles where id = p_opponent) then
    raise exception 'player not found';
  end if;
  if exists (select 1 from public.jamb_matches where status = 'active' and me in (player1, player2)) then
    raise exception 'already in an active match';
  end if;

  -- same challenge already pending? return it
  select * into m from public.jamb_matches
    where status = 'challenge' and player1 = me and player2 = p_opponent
    limit 1;
  if found then return m; end if;

  -- they already challenged us? mutual intent = start the match
  select * into m from public.jamb_matches
    where status = 'challenge' and player1 = p_opponent and player2 = me
    limit 1
    for update;
  if found then
    update public.jamb_matches
      set status = 'active', turn = player1,
          state = state || jsonb_build_object(
            'names', coalesce(state->'names', '{}'::jsonb) || jsonb_build_object(me::text, myname))
      where id = m.id
      returning * into m;
    return m;
  end if;

  insert into public.jamb_matches (player1, player2, status, state)
    values (me, p_opponent, 'challenge',
            jsonb_build_object('names', jsonb_build_object(me::text, myname)))
    returning * into m;
  return m;
end $$;

revoke all on function public.jamb_challenge(uuid) from public;
revoke all on function public.jamb_challenge(uuid) from anon;
grant execute on function public.jamb_challenge(uuid) to authenticated;

create or replace function public.jamb_respond_challenge(p_match uuid, p_accept boolean)
returns public.jamb_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  myname text;
  m public.jamb_matches;
begin
  if me is null then raise exception 'authentication required'; end if;
  select * into m from public.jamb_matches where id = p_match for update;
  if not found or m.player2 is distinct from me or m.status <> 'challenge' then
    raise exception 'challenge not found';
  end if;

  if not p_accept then
    update public.jamb_matches set status = 'declined' where id = p_match returning * into m;
    return m;
  end if;

  if exists (select 1 from public.jamb_matches where status = 'active' and me in (player1, player2)) then
    raise exception 'already in an active match';
  end if;
  if exists (select 1 from public.jamb_matches x
             where x.status = 'active' and m.player1 in (x.player1, x.player2)) then
    raise exception 'opponent is already in a game';
  end if;

  select display_name into myname from public.jamb_profiles where id = me;
  update public.jamb_matches
    set status = 'active', turn = player1,
        state = state || jsonb_build_object(
          'names', coalesce(state->'names', '{}'::jsonb)
                   || jsonb_build_object(me::text, coalesce(myname, 'player')))
    where id = p_match
    returning * into m;
  return m;
end $$;

revoke all on function public.jamb_respond_challenge(uuid, boolean) from public;
revoke all on function public.jamb_respond_challenge(uuid, boolean) from anon;
grant execute on function public.jamb_respond_challenge(uuid, boolean) to authenticated;

-- Personal match history with computed totals (forfeits from abandoned games count)
create or replace function public.jamb_history()
returns table (
  match_id uuid, opponent_id uuid, opponent_name text,
  my_score int, opp_score int, result text, played_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id,
         case when m.player1 = auth.uid() then m.player2 else m.player1 end,
         coalesce(p.display_name, '?'),
         public.jamb_sheet_total(m.state->'sheets'->(auth.uid()::text)),
         public.jamb_sheet_total(m.state->'sheets'->
           ((case when m.player1 = auth.uid() then m.player2 else m.player1 end)::text)),
         case when m.winner = auth.uid() then 'win'
              when m.winner is not null then 'loss'
              else 'draw' end,
         m.updated_at
  from public.jamb_matches m
  left join public.jamb_profiles p
    on p.id = case when m.player1 = auth.uid() then m.player2 else m.player1 end
  where auth.uid() in (m.player1, m.player2)
    and m.player2 is not null
    and (m.status = 'finished' or (m.status = 'abandoned' and m.winner is not null))
  order by m.updated_at desc
  limit 100;
$$;

revoke all on function public.jamb_history() from public;
revoke all on function public.jamb_history() from anon;
grant execute on function public.jamb_history() to authenticated;

-- Leaderboard now includes match wins/losses
drop function if exists public.jamb_leaderboard(int);
create or replace function public.jamb_leaderboard(limit_count int default 20)
returns table (display_name text, best_score int, games_played bigint, wins bigint, losses bigint)
language sql
security definer
set search_path = public
stable
as $$
  with mstats as (
    select u as pid,
           count(*) filter (where winner = u) as wins,
           count(*) filter (where winner is not null and winner <> u) as losses
    from (
      select player1 as u, winner from public.jamb_matches
        where player2 is not null and (status = 'finished' or (status = 'abandoned' and winner is not null))
      union all
      select player2, winner from public.jamb_matches
        where player2 is not null and (status = 'finished' or (status = 'abandoned' and winner is not null))
    ) x
    group by u
  ),
  gstats as (
    select user_id, max(score) as best, count(*) as games from public.jamb_games group by user_id
  )
  select p.display_name,
         coalesce(g.best, 0)::int,
         coalesce(g.games, 0),
         coalesce(ms.wins, 0),
         coalesce(ms.losses, 0)
  from public.jamb_profiles p
  left join gstats g on g.user_id = p.id
  left join mstats ms on ms.pid = p.id
  where g.user_id is not null or ms.pid is not null
  order by coalesce(g.best, 0) desc, coalesce(ms.wins, 0) desc
  limit least(greatest(limit_count, 1), 100);
$$;

revoke all on function public.jamb_leaderboard(int) from public;
grant execute on function public.jamb_leaderboard(int) to authenticated, anon;
