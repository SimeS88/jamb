-- Jamb dice game: profiles, games, leaderboard
-- (Applied to the Supabase project; kept here for reference/reproducibility.)
create table if not exists public.jamb_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  created_at timestamptz not null default now()
);

alter table public.jamb_profiles enable row level security;

create policy "jamb_profiles_select_own" on public.jamb_profiles
  for select using ((select auth.uid()) = id);
create policy "jamb_profiles_insert_own" on public.jamb_profiles
  for insert with check ((select auth.uid()) = id);
create policy "jamb_profiles_update_own" on public.jamb_profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create table if not exists public.jamb_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 2500),
  dice_count smallint not null default 6 check (dice_count = 6),
  throw_mode text not null default 'manual' check (throw_mode in ('manual','automatic')),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  created_at timestamptz not null default now()
);

alter table public.jamb_games enable row level security;

create policy "jamb_games_select_own" on public.jamb_games
  for select using ((select auth.uid()) = user_id);
create policy "jamb_games_insert_own" on public.jamb_games
  for insert with check ((select auth.uid()) = user_id);
-- intentionally no update/delete policies: finished scores are immutable

create index if not exists jamb_games_score_idx on public.jamb_games (score desc);
create index if not exists jamb_games_user_idx on public.jamb_games (user_id, created_at desc);

-- Leaderboard exposes only display_name + aggregate scores (never user ids/emails)
create or replace function public.jamb_leaderboard(limit_count int default 20)
returns table (display_name text, best_score int, games_played bigint)
language sql
security definer
set search_path = public
stable
as $$
  select p.display_name, max(g.score)::int as best_score, count(*) as games_played
  from public.jamb_games g
  join public.jamb_profiles p on p.id = g.user_id
  group by p.id, p.display_name
  order by best_score desc
  limit least(greatest(limit_count, 1), 100);
$$;

revoke all on function public.jamb_leaderboard(int) from public;
grant execute on function public.jamb_leaderboard(int) to authenticated, anon;
