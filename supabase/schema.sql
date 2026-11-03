-- =====================================================================
-- Ascendant guild server for Supabase (Postgres 15+).
-- STATUS: written against the Supabase REST/RPC contract used by www/js/ui.js (GuildAPI),
-- but NOT yet run against a live project. Test on a staging project first.
--
-- Setup:
--   1. Create a Supabase project. SQL editor: run this whole file.
--   2. Authentication > Providers > enable "Anonymous sign-ins".
--   3. Add each partner gym:
--        insert into public.guilds (code, name, city) values ('YODHA-24', 'Yodha Gym', 'Your city');
--   4. Put the project URL and anon key in www/js/config.js and rebuild the app.
--
-- Privacy model: members share only a nickname and four 0-100 scores. Workout logs,
-- photos and bodyweight never leave the phone.
-- Known limit: scores are computed on the phone and submitted, so a modified client
-- could submit false numbers. The server checks ranges, the overall formula and that
-- only the current period is written, but full anti-cheat needs server-side
-- recomputation from synced logs, which this version does not do.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.guilds (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code = upper(code) and length(code) between 4 and 24),
  name        text not null check (length(name) between 2 and 60),
  city        text,
  created_at  timestamptz not null default now()
);

create table if not exists public.guild_members (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  guild_id    uuid not null references public.guilds(id) on delete cascade,
  nickname    text not null check (length(nickname) between 2 and 20),
  joined_at   timestamptz not null default now()
);
create unique index if not exists guild_members_nick on public.guild_members (guild_id, lower(nickname));

create table if not exists public.guild_scores (
  user_id     uuid not null references public.guild_members(user_id) on delete cascade,
  guild_id    uuid not null references public.guilds(id) on delete cascade,
  period      text not null check (period in ('week', 'month', 'all')),
  period_key  text not null,
  consistency smallint not null check (consistency between 0 and 100),
  strength    smallint not null check (strength between 0 and 100),
  progress    smallint not null check (progress between 0 and 100),
  overall     smallint not null check (overall between 0 and 100),
  updated_at  timestamptz not null default now(),
  primary key (user_id, period, period_key)
);
create index if not exists guild_scores_board on public.guild_scores (guild_id, period, period_key);

-- No direct table access from the app. Everything goes through the functions below.
alter table public.guilds        enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_scores  enable row level security;
revoke all on public.guilds, public.guild_members, public.guild_scores from anon, authenticated;

-- Current period keys. Weeks start on Monday, matching the app. Time zone: India.
create or replace function public._period_key(p_period text)
returns text language sql stable as $$
  select case p_period
    when 'week'  then to_char(date_trunc('week', now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD')
    when 'month' then to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM')
    when 'all'   then 'all'
  end
$$;

-- Join (or switch) guild with a gym code. Nicknames are unique per guild, case-insensitive.
create or replace function public.join_guild(p_code text, p_nickname text)
returns json language plpgsql security definer set search_path = public as $$
declare
  g   public.guilds;
  uid uuid := auth.uid();
  nick text := btrim(p_nickname);
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if length(nick) < 2 or length(nick) > 20 then raise exception 'Nickname must be 2 to 20 characters'; end if;
  select * into g from public.guilds where code = upper(btrim(p_code));
  if not found then raise exception 'Unknown gym code'; end if;
  if exists (select 1 from public.guild_members where guild_id = g.id and lower(nickname) = lower(nick) and user_id <> uid) then
    raise exception 'That nickname is taken in this guild';
  end if;
  insert into public.guild_members (user_id, guild_id, nickname) values (uid, g.id, nick)
  on conflict (user_id) do update set guild_id = excluded.guild_id, nickname = excluded.nickname;
  delete from public.guild_scores where user_id = uid and guild_id <> g.id;  -- switching guild starts fresh
  return json_build_object('guild_id', g.id, 'guild_name', g.name);
end $$;

-- Submit the caller's scores for the CURRENT period only. Closed periods are frozen.
create or replace function public.submit_scores(p_period text, p_period_key text,
  p_consistency int, p_strength int, p_progress int, p_overall int)
returns void language plpgsql security definer set search_path = public as $$
declare
  m   public.guild_members;
  uid uuid := auth.uid();
begin
  select * into m from public.guild_members where user_id = uid;
  if not found then raise exception 'Not in a guild'; end if;
  if p_period not in ('week', 'month', 'all') or p_period_key is distinct from public._period_key(p_period) then
    raise exception 'Period is closed or invalid';
  end if;
  if least(p_consistency, p_strength, p_progress, p_overall) < 0 or greatest(p_consistency, p_strength, p_progress, p_overall) > 100 then
    raise exception 'Scores must be between 0 and 100';
  end if;
  if abs(p_overall - (0.4 * p_consistency + 0.3 * p_progress + 0.3 * p_strength)) > 1 then
    raise exception 'Overall score does not match the published formula';
  end if;
  insert into public.guild_scores (user_id, guild_id, period, period_key, consistency, strength, progress, overall, updated_at)
  values (uid, m.guild_id, p_period, p_period_key, p_consistency, p_strength, p_progress, p_overall, now())
  on conflict (user_id, period, period_key) do update
    set guild_id = excluded.guild_id, consistency = excluded.consistency, strength = excluded.strength,
        progress = excluded.progress, overall = excluded.overall, updated_at = now();
end $$;

-- Leaderboard for the caller's guild. Ties share a rank.
create or replace function public.guild_leaderboard(p_category text, p_period text, p_period_key text)
returns table (rank int, nickname text, score int, is_me boolean, member_count int)
language sql stable security definer set search_path = public as $$
  with me as (select guild_id from public.guild_members where user_id = auth.uid()),
  members as (select count(*)::int as n from public.guild_members where guild_id = (select guild_id from me)),
  s as (
    select gm.nickname as nick, gs.user_id as uid,
      (case p_category when 'consistency' then gs.consistency when 'strength' then gs.strength
                       when 'progress' then gs.progress else gs.overall end)::int as val
    from public.guild_scores gs
    join public.guild_members gm on gm.user_id = gs.user_id
    where gs.guild_id = (select guild_id from me) and gs.period = p_period and gs.period_key = p_period_key
  )
  select (rank() over (order by val desc))::int, nick, val, uid = auth.uid(), (select n from members)
  from s order by 1, 2 limit 200
$$;

-- Caller's final positions in finished weeks and months, per category.
create or replace function public.my_competition_history()
returns table (period text, period_key text, category text, rank int, member_count int)
language sql stable security definer set search_path = public as $$
  with me as (select guild_id from public.guild_members where user_id = auth.uid()),
  closed as (
    select gs.* from public.guild_scores gs
    where gs.guild_id = (select guild_id from me) and gs.period in ('week', 'month')
      and gs.period_key <> public._period_key(gs.period)
  ),
  flat as (
    select c.period, c.period_key, c.user_id, cat.name as category,
      case cat.name when 'consistency' then c.consistency when 'strength' then c.strength
                    when 'progress' then c.progress else c.overall end as val
    from closed c cross join (values ('overall'), ('consistency'), ('strength'), ('progress')) as cat(name)
  ),
  ranked as (
    select f.*, rank() over (partition by f.period, f.period_key, f.category order by f.val desc)::int as r,
      count(*) over (partition by f.period, f.period_key, f.category)::int as n
    from flat f
  )
  select period, period_key, category, r, n from ranked
  where user_id = auth.uid()
  order by period_key desc, period, category
$$;

-- Leave and erase: removes membership, all scores, and the anonymous account itself.
create or replace function public.leave_guild_and_delete()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from public.guild_members where user_id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.join_guild(text, text), public.submit_scores(text, text, int, int, int, int),
  public.guild_leaderboard(text, text, text), public.my_competition_history(), public.leave_guild_and_delete(),
  public._period_key(text) from public, anon;
grant execute on function public.join_guild(text, text), public.submit_scores(text, text, int, int, int, int),
  public.guild_leaderboard(text, text, text), public.my_competition_history(), public.leave_guild_and_delete()
  to authenticated;
