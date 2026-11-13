-- =====================================================================
-- Ascendant server, version 2 (Supabase / Postgres 15+)
--
-- Accounts and roles, gym guilds with approvals, offline-first sync,
-- server-computed leaderboards, and a payment-backed wallet.
--
-- Security model: every table has row level security ON and NO policies,
-- and direct table access is revoked. The app can only call the functions
-- below. Functions check who is calling (auth.uid()) and their role.
--   anon           : check_master_code, username_available
--   authenticated  : everything a participant, guild master or owner does
--   service_role   : admin_* functions, used only by the edge functions
--
-- Run this whole file once in the Supabase SQL editor. It is idempotent
-- for functions; tables are created only if missing.
-- Then make yourself owner (after registering in the app):
--   update public.profiles set role = 'owner' where username = 'your_username';
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '' check (length(display_name) <= 40),
  role         text not null default 'participant' check (role in ('owner', 'guild_master', 'participant')),
  created_at   timestamptz not null default now(),
  last_seen    timestamptz
);
-- 3.3: optional profile photo (small JPEG data URL, about 10 KB) and level, shown with the rank ring
alter table public.profiles add column if not exists avatar text check (avatar is null or length(avatar) <= 60000);
alter table public.profiles add column if not exists level int not null default 1 check (level between 1 and 999);

create table if not exists public.guilds (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 2 and 60),
  city       text not null default '' check (length(city) <= 40),
  logo_url   text,
  join_code  text not null unique,
  master_id  uuid unique references public.profiles(id) on delete set null,
  status     text not null default 'active' check (status in ('active', 'suspended')),
  paid_until date,
  created_at timestamptz not null default now()
);

create table if not exists public.master_codes (
  code       text primary key,
  note       text not null default '',
  grant_days int  not null default 30 check (grant_days between 0 and 3660),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by    uuid references public.profiles(id) on delete set null,
  used_at    timestamptz,
  guild_id   uuid references public.guilds(id) on delete set null,
  revoked    boolean not null default false
);

create table if not exists public.memberships (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  guild_id     uuid not null references public.guilds(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'approved')),
  requested_at timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists memberships_guild on public.memberships (guild_id, status);

create table if not exists public.user_logs (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  data       jsonb,                       -- null means the day was deleted on the phone
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists user_logs_updated on public.user_logs (user_id, updated_at);

create table if not exists public.user_state (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_scores (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  period      text not null check (period in ('week', 'month', 'all')),
  period_key  text not null,
  consistency smallint not null check (consistency between 0 and 100),
  strength    smallint not null check (strength between 0 and 100),
  progress    smallint not null check (progress between 0 and 100),
  overall     smallint not null check (overall between 0 and 100),
  updated_at  timestamptz not null default now(),
  primary key (user_id, period, period_key)
);

create table if not exists public.products (
  id           text primary key,
  title        text not null,
  amount_paise int  not null check (amount_paise > 0),
  crystals     int  not null default 0,
  pass         boolean not null default false,
  active       boolean not null default true
);
insert into public.products (id, title, amount_paise, crystals, pass) values
  ('crystals_10',  '10 crystals',    1000,  10, false),
  ('crystals_55',  '55 crystals',    4900,  55, false),
  ('crystals_120', '120 crystals',   9900, 120, false),
  ('pass',         'Ascendant Pass', 14900,  0, true)
on conflict (id) do nothing;

create table if not exists public.wallets (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  bought     int not null default 0,
  pass       boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  product_id          text not null references public.products(id),
  amount_paise        int not null,
  crystals            int not null,
  pass                boolean not null,
  razorpay_order_id   text unique,
  razorpay_payment_id text,
  status              text not null default 'created' check (status in ('created', 'paid', 'failed')),
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);

alter table public.profiles     enable row level security;
alter table public.guilds       enable row level security;
alter table public.master_codes enable row level security;
alter table public.memberships  enable row level security;
alter table public.user_logs    enable row level security;
alter table public.user_state   enable row level security;
alter table public.user_scores  enable row level security;
alter table public.products     enable row level security;
alter table public.wallets      enable row level security;
alter table public.purchases    enable row level security;
revoke all on public.profiles, public.guilds, public.master_codes, public.memberships, public.user_logs,
  public.user_state, public.user_scores, public.products, public.wallets, public.purchases from anon, authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function public._period_key(p_period text)
returns text language sql stable as $$
  select case p_period
    when 'week'  then to_char(date_trunc('week', now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD')
    when 'month' then to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM')
    when 'all'   then 'all'
  end
$$;

create or replace function public._me() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'Not signed in'; end if;
  return p;
end $$;

create or replace function public._require_owner() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if (public._me()).role <> 'owner' then raise exception 'Only the app owner can do this'; end if;
end $$;

create or replace function public._master_guild() returns public.guilds
language plpgsql stable security definer set search_path = public as $$
declare g public.guilds;
begin
  select * into g from public.guilds where master_id = auth.uid();
  if not found then raise exception 'You are not a guild master'; end if;
  return g;
end $$;

create or replace function public._random_code(p_len int) returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, p_len)
$$;

create or replace function public._guild_active(g public.guilds) returns boolean
language sql stable as $$
  select g.status = 'active' and (g.paid_until is null or g.paid_until + 7 >= (now() at time zone 'Asia/Kolkata')::date)
$$;

-- profile row is created with the auth user; username comes from signup metadata
create or replace function public._on_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
begin
  if uname !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3 to 20 characters: letters, numbers, underscore';
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, uname, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40));
  insert into public.wallets (user_id) values (new.id);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public._on_auth_user();

-- ---------------------------------------------------------------- public (anon)
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select lower(btrim(p_username)) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(btrim(p_username)))
$$;

create or replace function public.check_master_code(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.master_codes where code = upper(btrim(p_code)) and used_by is null and not revoked
                 and (expires_at is null or expires_at > now()))
$$;

-- ---------------------------------------------------------------- account
create or replace function public.my_account()
returns json language plpgsql security definer set search_path = public as $$
declare p public.profiles := public._me(); m public.memberships; g public.guilds; w public.wallets; mg public.guilds;
begin
  update public.profiles set last_seen = now() where id = p.id;
  select * into m from public.memberships where user_id = p.id;
  if found then select * into g from public.guilds where id = m.guild_id; end if;
  select * into mg from public.guilds where master_id = p.id;
  select * into w from public.wallets where user_id = p.id;
  return json_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name, 'role', p.role, 'avatar', p.avatar, 'level', p.level,
    'membership', case when m.user_id is null then null else json_build_object(
      'status', m.status, 'guild_id', g.id, 'guild_name', g.name, 'city', g.city, 'logo_url', g.logo_url,
      'active', public._guild_active(g)) end,
    'master_guild', case when mg.id is null then null else json_build_object(
      'id', mg.id, 'name', mg.name, 'city', mg.city, 'logo_url', mg.logo_url, 'join_code', mg.join_code,
      'status', mg.status, 'paid_until', mg.paid_until, 'active', public._guild_active(mg),
      'members', (select count(*) from public.memberships where guild_id = mg.id and status = 'approved'),
      'pending', (select count(*) from public.memberships where guild_id = mg.id and status = 'pending')) end,
    'wallet', json_build_object('bought', coalesce(w.bought, 0), 'pass', coalesce(w.pass, false) or p.role = 'owner'),
    'server_time', now());
end $$;

create or replace function public.update_display_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._me();
  update public.profiles set display_name = left(btrim(coalesce(p_name, '')), 40) where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- guild master
create or replace function public.become_guild_master(p_code text, p_gym_name text, p_city text)
returns json language plpgsql security definer set search_path = public as $$
declare p public.profiles := public._me(); c public.master_codes; g public.guilds; jc text;
begin
  if p.role = 'owner' then raise exception 'The owner account cannot run a guild'; end if;
  if exists (select 1 from public.guilds where master_id = p.id) then raise exception 'You already run a guild'; end if;
  select * into c from public.master_codes where code = upper(btrim(p_code)) for update;
  if not found or c.used_by is not null or c.revoked or (c.expires_at is not null and c.expires_at <= now()) then
    raise exception 'This guild master code is invalid or already used';
  end if;
  if length(btrim(coalesce(p_gym_name, ''))) < 2 then raise exception 'Enter the gym name'; end if;
  loop jc := public._random_code(6); exit when not exists (select 1 from public.guilds where join_code = jc); end loop;
  insert into public.guilds (name, city, join_code, master_id, paid_until)
  values (btrim(p_gym_name), btrim(coalesce(p_city, '')), jc, p.id, (now() at time zone 'Asia/Kolkata')::date + c.grant_days)
  returning * into g;
  update public.master_codes set used_by = p.id, used_at = now(), guild_id = g.id where code = c.code;
  update public.profiles set role = 'guild_master' where id = p.id;
  -- the master is also a member of his own guild, so he appears on its leaderboard
  delete from public.memberships where user_id = p.id;
  insert into public.memberships (user_id, guild_id, status, decided_at) values (p.id, g.id, 'approved', now());
  return json_build_object('guild_id', g.id, 'name', g.name, 'join_code', g.join_code, 'paid_until', g.paid_until);
end $$;

create or replace function public.master_update_guild(p_name text, p_city text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.guilds := public._master_guild();
begin
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the gym name'; end if;
  update public.guilds set name = btrim(p_name), city = btrim(coalesce(p_city, '')) where id = g.id;
end $$;

create or replace function public.master_regen_join_code()
returns text language plpgsql security definer set search_path = public as $$
declare g public.guilds := public._master_guild(); jc text;
begin
  loop jc := public._random_code(6); exit when not exists (select 1 from public.guilds where join_code = jc); end loop;
  update public.guilds set join_code = jc where id = g.id;
  return jc;
end $$;

drop function if exists public.master_requests();
create or replace function public.master_requests()
returns table (user_id uuid, username text, display_name text, requested_at timestamptz, avatar text, level int)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.username, p.display_name, m.requested_at, p.avatar, p.level
  from public.memberships m join public.profiles p on p.id = m.user_id
  where m.guild_id = (public._master_guild()).id and m.status = 'pending'
  order by m.requested_at
$$;

drop function if exists public.master_members();
create or replace function public.master_members()
returns table (user_id uuid, username text, display_name text, joined_at timestamptz, week_overall int, last_seen timestamptz, avatar text, level int)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.username, p.display_name, coalesce(m.decided_at, m.requested_at),
    (select s.overall from public.user_scores s where s.user_id = m.user_id and s.period = 'week' and s.period_key = public._period_key('week'))::int,
    p.last_seen, p.avatar, p.level
  from public.memberships m join public.profiles p on p.id = m.user_id
  where m.guild_id = (public._master_guild()).id and m.status = 'approved'
  order by p.username
$$;

create or replace function public.master_decide(p_user uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare g public.guilds := public._master_guild();
begin
  if not exists (select 1 from public.memberships where user_id = p_user and guild_id = g.id and status = 'pending') then
    raise exception 'No pending request from this member';
  end if;
  if p_approve then update public.memberships set status = 'approved', decided_at = now() where user_id = p_user;
  else delete from public.memberships where user_id = p_user; end if;
end $$;

create or replace function public.master_remove(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.guilds := public._master_guild();
begin
  if p_user = auth.uid() then raise exception 'You cannot remove yourself from your own guild'; end if;
  delete from public.memberships where user_id = p_user and guild_id = g.id;
end $$;

-- ---------------------------------------------------------------- participant
create or replace function public.request_join(p_join_code text)
returns json language plpgsql security definer set search_path = public as $$
declare p public.profiles := public._me(); g public.guilds; m public.memberships;
begin
  select * into g from public.guilds where join_code = upper(btrim(p_join_code));
  if not found then raise exception 'No gym uses this join code'; end if;
  if not public._guild_active(g) then raise exception 'This gym''s guild is not active right now'; end if;
  select * into m from public.memberships where user_id = p.id;
  if found and m.guild_id <> g.id then raise exception 'Leave your current guild before joining another'; end if;
  if found then return json_build_object('guild_name', g.name, 'status', m.status); end if;
  insert into public.memberships (user_id, guild_id) values (p.id, g.id);
  return json_build_object('guild_name', g.name, 'status', 'pending');
end $$;

create or replace function public.leave_guild()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._me();
  if exists (select 1 from public.guilds where master_id = auth.uid()) then raise exception 'A guild master cannot leave his own guild'; end if;
  delete from public.memberships where user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------- sync
create or replace function public.sync_push(p_logs jsonb, p_state jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare uid uuid := (public._me()).id; r jsonb;
begin
  if p_logs is not null then
    if jsonb_array_length(p_logs) > 400 then raise exception 'Too many days in one sync'; end if;
    for r in select * from jsonb_array_elements(p_logs) loop
      if length((r -> 'data')::text) > 100000 then raise exception 'One day of training is too large'; end if;
      insert into public.user_logs (user_id, day, data, updated_at)
      values (uid, (r ->> 'day')::date, case when r -> 'data' = 'null'::jsonb then null else r -> 'data' end, now())
      on conflict (user_id, day) do update set data = excluded.data, updated_at = now();
    end loop;
  end if;
  if p_state is not null then
    if length(p_state::text) > 300000 then raise exception 'State too large'; end if;
    insert into public.user_state (user_id, data, updated_at) values (uid, p_state, now())
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
  end if;
  return now();
end $$;

create or replace function public.sync_pull(p_since timestamptz)
returns json language plpgsql stable security definer set search_path = public as $$
declare uid uuid := (public._me()).id;
begin
  return json_build_object(
    'logs', coalesce((select json_agg(json_build_object('day', to_char(day, 'YYYY-MM-DD'), 'data', data, 'updated_at', updated_at))
                      from public.user_logs where user_id = uid and (p_since is null or updated_at > p_since)), '[]'::json),
    'state', (select json_build_object('data', data, 'updated_at', updated_at) from public.user_state
              where user_id = uid and (p_since is null or updated_at > p_since)),
    'now', now());
end $$;

create or replace function public.reset_my_training()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := (public._me()).id;
begin
  delete from public.user_logs where user_id = uid;
  delete from public.user_state where user_id = uid;
  delete from public.user_scores where user_id = uid;
end $$;

-- ---------------------------------------------------------------- leaderboards
drop function if exists public.guild_leaderboard(text, text, uuid);
create or replace function public.guild_leaderboard(p_category text, p_period text, p_guild uuid default null)
returns table (rank int, user_id uuid, username text, display_name text, score int, is_me boolean, member_count int, avatar text, level int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare p public.profiles := public._me(); gid uuid; g public.guilds; pk text := public._period_key(p_period);
begin
  if p_guild is not null and p.role = 'owner' then gid := p_guild;
  else select guild_id into gid from public.memberships where user_id = p.id and status = 'approved'; end if;
  if gid is null then raise exception 'You are not an approved member of a guild'; end if;
  select * into g from public.guilds where id = gid;
  if not public._guild_active(g) and p.role <> 'owner' then raise exception 'This guild is inactive. The gym needs to renew with Ascendant.'; end if;
  return query
    with members as (
      select m.user_id from public.memberships m where m.guild_id = gid and m.status = 'approved'),
    s as (
      select mb.user_id as uid, pr.username as un, pr.display_name as dn, pr.avatar as av, pr.level as lv,
        coalesce((case p_category when 'consistency' then sc.consistency when 'strength' then sc.strength
                                  when 'progress' then sc.progress else sc.overall end)::int, 0) as val
      from members mb join public.profiles pr on pr.id = mb.user_id
      left join public.user_scores sc on sc.user_id = mb.user_id and sc.period = p_period and sc.period_key = pk)
    select (rank() over (order by s.val desc))::int, s.uid, s.un, s.dn, s.val, s.uid = p.id, (select count(*)::int from members), s.av, s.lv
    from s order by 1, 3 limit 300;
end $$;

create or replace function public.my_competition_history()
returns table (period text, period_key text, category text, rank int, member_count int)
language sql stable security definer set search_path = public as $$
  with me as (select guild_id from public.memberships where user_id = auth.uid() and status = 'approved'),
  members as (select user_id from public.memberships where guild_id = (select guild_id from me) and status = 'approved'),
  closed as (
    select sc.* from public.user_scores sc join members mb on mb.user_id = sc.user_id
    where sc.period in ('week', 'month') and sc.period_key <> public._period_key(sc.period)),
  flat as (
    select c.period, c.period_key, c.user_id, cat.name as category,
      case cat.name when 'consistency' then c.consistency when 'strength' then c.strength
                    when 'progress' then c.progress else c.overall end as val
    from closed c cross join (values ('overall'), ('consistency'), ('strength'), ('progress')) as cat(name)),
  ranked as (
    select f.*, rank() over (partition by f.period, f.period_key, f.category order by f.val desc)::int as r,
      count(*) over (partition by f.period, f.period_key, f.category)::int as n
    from flat f)
  select period, period_key, category, r, n from ranked where user_id = auth.uid()
  order by period_key desc, period, category limit 120
$$;

-- ---------------------------------------------------------------- owner
create or replace function public.owner_create_codes(p_count int, p_note text, p_grant_days int, p_valid_days int)
returns setof text language plpgsql security definer set search_path = public as $$
declare i int; c text;
begin
  perform public._require_owner();
  if p_count < 1 or p_count > 20 then raise exception 'Create 1 to 20 codes at a time'; end if;
  for i in 1..p_count loop
    loop c := 'GM-' || public._random_code(8); exit when not exists (select 1 from public.master_codes where code = c); end loop;
    insert into public.master_codes (code, note, grant_days, created_by, expires_at)
    values (c, left(coalesce(p_note, ''), 80), coalesce(p_grant_days, 30), auth.uid(),
            case when coalesce(p_valid_days, 0) > 0 then now() + make_interval(days => p_valid_days) end);
    return next c;
  end loop;
end $$;

create or replace function public.owner_codes()
returns table (code text, note text, grant_days int, created_at timestamptz, expires_at timestamptz, used_by_username text, guild_name text, revoked boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_owner();
  return query select c.code, c.note, c.grant_days, c.created_at, c.expires_at, p.username, g.name, c.revoked
    from public.master_codes c left join public.profiles p on p.id = c.used_by left join public.guilds g on g.id = c.guild_id
    order by c.created_at desc limit 200;
end $$;

create or replace function public.owner_revoke_code(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_owner();
  update public.master_codes set revoked = true where code = p_code and used_by is null;
end $$;

-- delete one code record. Unused, revoked and expired codes can always go.
-- A used code can go only when its guild no longer exists (the live guild does not depend on it, but it is kept as the record of who got it).
create or replace function public.owner_delete_code(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_owner();
  delete from public.master_codes where code = upper(btrim(p_code)) and (used_by is null or guild_id is null);
  if not found then raise exception 'This code belongs to a live guild. Delete the guild first, then the code.'; end if;
end $$;

-- clear every dead code in one go: revoked, expired, and used codes whose guild was deleted. Returns how many were removed.
create or replace function public.owner_purge_codes()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public._require_owner();
  delete from public.master_codes
    where (used_by is null and (revoked or (expires_at is not null and expires_at <= now())))
       or (used_by is not null and guild_id is null);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.owner_guilds()
returns table (id uuid, name text, city text, logo_url text, master_username text, status text, paid_until date, active boolean, members int, pending int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_owner();
  return query select g.id, g.name, g.city, g.logo_url, p.username, g.status, g.paid_until, public._guild_active(g),
    (select count(*)::int from public.memberships m where m.guild_id = g.id and m.status = 'approved'),
    (select count(*)::int from public.memberships m where m.guild_id = g.id and m.status = 'pending'), g.created_at
    from public.guilds g left join public.profiles p on p.id = g.master_id order by g.created_at desc;
end $$;

create or replace function public.owner_set_guild(p_guild uuid, p_paid_until date, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_owner();
  if p_status not in ('active', 'suspended') then raise exception 'Status must be active or suspended'; end if;
  update public.guilds set paid_until = p_paid_until, status = p_status where id = p_guild;
  if not found then raise exception 'Guild not found'; end if;
end $$;

drop function if exists public.owner_users(text);
create or replace function public.owner_users(p_search text)
returns table (id uuid, username text, display_name text, role text, guild_name text, membership text, created_at timestamptz, last_seen timestamptz, bought int, pass boolean, avatar text, level int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_owner();
  return query select p.id, p.username, p.display_name, p.role, g.name, m.status, p.created_at, p.last_seen, w.bought, w.pass, p.avatar, p.level
    from public.profiles p left join public.memberships m on m.user_id = p.id left join public.guilds g on g.id = m.guild_id
    left join public.wallets w on w.user_id = p.id
    where coalesce(p_search, '') = '' or p.username like '%' || lower(btrim(p_search)) || '%' or p.display_name ilike '%' || btrim(p_search) || '%'
    order by p.created_at desc limit 200;
end $$;

create or replace function public.owner_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_owner();
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'active_7d', (select count(*) from public.profiles where last_seen > now() - interval '7 days'),
    'guilds', (select count(*) from public.guilds),
    'active_guilds', (select count(*) from public.guilds g where public._guild_active(g)),
    'revenue_paise', (select coalesce(sum(amount_paise), 0) from public.purchases where status = 'paid'),
    'purchases', (select count(*) from public.purchases where status = 'paid'));
end $$;

create or replace function public.am_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
$$;

-- ---------------------------------------------------------------- wallet
create or replace function public.my_purchases()
returns table (product_id text, title text, amount_paise int, status text, created_at timestamptz, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select pu.product_id, pr.title, pu.amount_paise, pu.status, pu.created_at, pu.paid_at
  from public.purchases pu join public.products pr on pr.id = pu.product_id
  where pu.user_id = auth.uid() order by pu.created_at desc limit 50
$$;

create or replace function public.list_products()
returns table (id text, title text, amount_paise int, crystals int, pass boolean)
language sql stable security definer set search_path = public as $$
  select id, title, amount_paise, crystals, pass from public.products where active order by amount_paise
$$;

-- ---------------------------------------------------------------- service role (edge functions only)
create or replace function public.admin_user_data(p_user uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'state', (select data from public.user_state where user_id = p_user),
    'logs', coalesce((select json_object_agg(to_char(day, 'YYYY-MM-DD'), data) from public.user_logs where user_id = p_user and data is not null), '{}'::json))
$$;

create or replace function public.admin_write_scores(p_user uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    if r ->> 'period_key' is distinct from public._period_key(r ->> 'period') then continue; end if;  -- closed periods stay frozen
    insert into public.user_scores (user_id, period, period_key, consistency, strength, progress, overall, updated_at)
    values (p_user, r ->> 'period', r ->> 'period_key', (r ->> 'consistency')::int, (r ->> 'strength')::int,
            (r ->> 'progress')::int, (r ->> 'overall')::int, now())
    on conflict (user_id, period, period_key) do update set consistency = excluded.consistency, strength = excluded.strength,
      progress = excluded.progress, overall = excluded.overall, updated_at = now();
  end loop;
end $$;

create or replace function public.admin_master_guild(p_user uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('id', id, 'name', name) from public.guilds where master_id = p_user
$$;

create or replace function public.admin_set_logo(p_guild uuid, p_url text)
returns void language sql security definer set search_path = public as $$
  update public.guilds set logo_url = p_url where id = p_guild
$$;

create or replace function public.admin_is_owner(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_user and role = 'owner')
$$;

create or replace function public.admin_create_purchase(p_user uuid, p_product text, p_order_id text)
returns json language plpgsql security definer set search_path = public as $$
declare pr public.products;
begin
  select * into pr from public.products where id = p_product and active;
  if not found then raise exception 'Unknown product'; end if;
  insert into public.purchases (user_id, product_id, amount_paise, crystals, pass, razorpay_order_id)
  values (p_user, pr.id, pr.amount_paise, pr.crystals, pr.pass, p_order_id);
  return json_build_object('amount_paise', pr.amount_paise, 'title', pr.title);
end $$;

create or replace function public.admin_product(p_product text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('id', id, 'title', title, 'amount_paise', amount_paise) from public.products where id = p_product and active
$$;

-- idempotent: crediting happens exactly once per order, whichever path (app verify or webhook) arrives first
create or replace function public.admin_mark_paid(p_order_id text, p_payment_id text)
returns json language plpgsql security definer set search_path = public as $$
declare pu public.purchases;
begin
  select * into pu from public.purchases where razorpay_order_id = p_order_id for update;
  if not found then raise exception 'Unknown order'; end if;
  if pu.status = 'paid' then return json_build_object('credited', false, 'already', true); end if;
  update public.purchases set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now() where id = pu.id;
  insert into public.wallets (user_id) values (pu.user_id) on conflict do nothing;
  update public.wallets set bought = bought + pu.crystals, pass = pass or pu.pass, updated_at = now() where user_id = pu.user_id;
  return json_build_object('credited', true, 'crystals', pu.crystals, 'pass', pu.pass);
end $$;

-- ---------------------------------------------------------------- owner tools (v2.2)
-- Payment records survive account deletion (kept for accounting, no longer tied to a person).
do $$ begin
  alter table public.purchases alter column user_id drop not null;
  alter table public.purchases drop constraint if exists purchases_user_id_fkey;
  alter table public.purchases add constraint purchases_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;
exception when others then raise notice 'purchases fk: %', sqlerrm; end $$;

create table if not exists public.owner_log (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid,
  action      text not null,
  target_id   uuid,
  target_name text not null default '',
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.owner_log enable row level security;
revoke all on public.owner_log from anon, authenticated;

create or replace function public.owner_grant_crystals(p_user uuid, p_amount int, p_reason text)
returns json language plpgsql security definer set search_path = public as $$
declare t public.profiles; nb int;
begin
  perform public._require_owner();
  if p_amount is null or p_amount = 0 or p_amount < -5000 or p_amount > 5000 then raise exception 'Amount must be between -5000 and 5000, not zero'; end if;
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'User not found'; end if;
  insert into public.wallets (user_id) values (p_user) on conflict do nothing;
  update public.wallets set bought = greatest(0, bought + p_amount), updated_at = now() where user_id = p_user returning bought into nb;
  insert into public.owner_log (owner_id, action, target_id, target_name, detail)
    values (auth.uid(), 'grant_crystals', p_user, t.username, json_build_object('amount', p_amount, 'balance', nb, 'reason', left(coalesce(p_reason, ''), 120))::jsonb);
  return json_build_object('username', t.username, 'balance', nb);
end $$;

create or replace function public.owner_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  perform public._require_owner();
  if p_user = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'User not found'; end if;
  if t.role = 'owner' then raise exception 'An owner account cannot be deleted from the app'; end if;
  if exists (select 1 from public.guilds where master_id = p_user) then raise exception 'He runs a guild. Delete or reassign the guild first'; end if;
  insert into public.owner_log (owner_id, action, target_id, target_name, detail) values (auth.uid(), 'delete_user', p_user, t.username, '{}'::jsonb);
  delete from auth.users where id = p_user;
end $$;

create or replace function public.owner_delete_guild(p_guild uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.guilds;
begin
  perform public._require_owner();
  select * into g from public.guilds where id = p_guild;
  if not found then raise exception 'Guild not found'; end if;
  insert into public.owner_log (owner_id, action, target_id, target_name, detail)
    values (auth.uid(), 'delete_guild', p_guild, g.name, json_build_object('master_id', g.master_id)::jsonb);
  if g.master_id is not null then update public.profiles set role = 'participant' where id = g.master_id and role = 'guild_master'; end if;
  delete from public.guilds where id = p_guild;
end $$;

create or replace function public.owner_log_recent()
returns table (action text, target_name text, detail jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_owner();
  return query select l.action, l.target_name, l.detail, l.created_at from public.owner_log l order by l.created_at desc limit 50;
end $$;

-- ---------------------------------------------------------------- profile photo and level (3.3)
create or replace function public.set_my_avatar(p_avatar text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._me();
  if p_avatar is not null and p_avatar <> '' then
    if length(p_avatar) > 60000 then raise exception 'Photo is too large'; end if;
    if p_avatar !~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$' then raise exception 'Photo must be a JPEG, WebP or PNG image'; end if;
  end if;
  update public.profiles set avatar = nullif(p_avatar, '') where id = auth.uid();
end $$;

-- level is cosmetic (it only colours the rank ring); rankings come from server-computed scores
create or replace function public.set_my_level(p_level int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._me();
  update public.profiles set level = greatest(1, least(coalesce(p_level, 1), 999)) where id = auth.uid();
end $$;

create or replace function public.master_clear_avatar(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.memberships where user_id = p_user and guild_id = (public._master_guild()).id) then
    raise exception 'Not a member of your guild'; end if;
  update public.profiles set avatar = null where id = p_user;
end $$;

create or replace function public.owner_clear_avatar(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  perform public._require_owner();
  update public.profiles set avatar = null where id = p_user returning * into t;
  if found then insert into public.owner_log (owner_id, action, target_id, target_name) values (auth.uid(), 'clear_avatar', p_user, t.username); end if;
end $$;

-- ---------------------------------------------------------------- grants
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.username_available(text), public.check_master_code(text) to anon, authenticated;
grant execute on function
  public.my_account(), public.update_display_name(text), public.set_my_avatar(text), public.set_my_level(int), public.master_clear_avatar(uuid), public.owner_clear_avatar(uuid),
  public.become_guild_master(text, text, text), public.master_update_guild(text, text), public.master_regen_join_code(),
  public.master_requests(), public.master_members(), public.master_decide(uuid, boolean), public.master_remove(uuid),
  public.request_join(text), public.leave_guild(),
  public.sync_push(jsonb, jsonb), public.sync_pull(timestamptz), public.reset_my_training(),
  public.guild_leaderboard(text, text, uuid), public.my_competition_history(),
  public.owner_create_codes(int, text, int, int), public.owner_codes(), public.owner_revoke_code(text), public.owner_delete_code(text), public.owner_purge_codes(), public.owner_guilds(),
  public.owner_set_guild(uuid, date, text), public.owner_grant_crystals(uuid, int, text), public.owner_delete_user(uuid), public.owner_delete_guild(uuid), public.owner_log_recent(), public.owner_users(text), public.owner_stats(), public.am_owner(),
  public.my_purchases(), public.list_products()
to authenticated;
grant execute on function
  public.admin_user_data(uuid), public.admin_write_scores(uuid, jsonb), public.admin_master_guild(uuid), public.admin_set_logo(uuid, text),
  public.admin_is_owner(uuid), public.admin_create_purchase(uuid, text, text), public.admin_product(text), public.admin_mark_paid(text, text)
to service_role;
