-- Two-player Jamb matches with realtime sync
create table if not exists public.jamb_matches (
  id uuid primary key default gen_random_uuid(),
  player1 uuid not null references auth.users(id) on delete cascade,
  player2 uuid references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','active','finished','abandoned')),
  turn uuid,
  winner uuid,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.jamb_matches enable row level security;

create policy "jamb_matches_select_participant" on public.jamb_matches
  for select using ((select auth.uid()) in (player1, player2));
create policy "jamb_matches_update_participant" on public.jamb_matches
  for update using ((select auth.uid()) in (player1, player2))
  with check ((select auth.uid()) in (player1, player2));
-- no insert policy: matches are created/paired only through jamb_find_match()
-- no delete policy: matches are abandoned, never deleted

create index if not exists jamb_matches_waiting_idx
  on public.jamb_matches (created_at) where status = 'waiting';

-- Pair with the oldest waiting opponent, or create a waiting match.
create or replace function public.jamb_find_match()
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
  if me is null then
    raise exception 'authentication required';
  end if;
  select display_name into myname from public.jamb_profiles where id = me;
  if myname is null then
    raise exception 'profile required';
  end if;

  -- already in a running match? resume it (also makes repeated calls idempotent)
  select * into m from public.jamb_matches
    where status = 'active' and me in (player1, player2)
    order by updated_at desc
    limit 1;
  if found then return m; end if;

  select * into m from public.jamb_matches
    where player1 = me and status = 'waiting'
    limit 1;
  if found then return m; end if;

  select * into m from public.jamb_matches
    where status = 'waiting' and player1 <> me
    order by created_at
    limit 1
    for update skip locked;
  if found then
    update public.jamb_matches
      set player2 = me,
          status = 'active',
          turn = player1,
          state = state || jsonb_build_object(
            'names', coalesce(state->'names', '{}'::jsonb) || jsonb_build_object(me::text, myname)),
          updated_at = now()
      where id = m.id
      returning * into m;
    return m;
  end if;

  insert into public.jamb_matches (player1, state)
    values (me, jsonb_build_object('names', jsonb_build_object(me::text, myname)))
    returning * into m;
  return m;
end;
$$;

revoke all on function public.jamb_find_match() from public;
revoke all on function public.jamb_find_match() from anon;
grant execute on function public.jamb_find_match() to authenticated;

-- keep updated_at fresh on every move
create or replace function public.jamb_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists jamb_matches_touch on public.jamb_matches;
create trigger jamb_matches_touch
  before update on public.jamb_matches
  for each row execute function public.jamb_touch_updated_at();

-- realtime change feed (RLS still applies to subscribers)
alter publication supabase_realtime add table public.jamb_matches;
