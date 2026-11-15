-- Ascendant 3.4.0 database update. Safe to run more than once.

-- 3.4: global ranking choice (null = not asked yet, false = guild only, true = shown on the global board)
alter table public.memberships add column if not exists global boolean;
create index if not exists memberships_global on public.memberships (status, global);

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
      'active', public._guild_active(g), 'global', m.global, 'approved_at', m.decided_at,
      'lock_until', case when m.status = 'approved' and p.role = 'participant' and m.decided_at > now() - interval '30 days'
                         then m.decided_at + interval '30 days' end) end,
    'master_guild', case when mg.id is null then null else json_build_object(
      'id', mg.id, 'name', mg.name, 'city', mg.city, 'logo_url', mg.logo_url, 'join_code', mg.join_code,
      'status', mg.status, 'paid_until', mg.paid_until, 'active', public._guild_active(mg),
      'members', (select count(*) from public.memberships where guild_id = mg.id and status = 'approved'),
      'pending', (select count(*) from public.memberships where guild_id = mg.id and status = 'pending')) end,
    'wallet', json_build_object('bought', coalesce(w.bought, 0), 'pass', coalesce(w.pass, false) or p.role = 'owner'),
    'server_time', now());
end $$;

create or replace function public.leave_guild()
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles := public._me(); m public.memberships; g public.guilds;
begin
  if exists (select 1 from public.guilds where master_id = p.id) then raise exception 'A guild master cannot leave his own guild'; end if;
  select * into m from public.memberships where user_id = p.id;
  if not found then return; end if;
  -- 3.4: an approved member stays at least 30 days. Pending requests can always be cancelled.
  -- The lock ends early if the guild is no longer active; the guild master or the owner can still remove anyone.
  if m.status = 'approved' and p.role = 'participant' and m.decided_at > now() - interval '30 days' then
    select * into g from public.guilds where id = m.guild_id;
    if public._guild_active(g) then
      raise exception 'You can leave this guild from %', to_char((m.decided_at + interval '30 days') at time zone 'Asia/Kolkata', 'DD Mon YYYY');
    end if;
  end if;
  delete from public.memberships where user_id = p.id;
end $$;

create or replace function public.guild_leaderboard(p_category text, p_period text, p_guild uuid default null)
returns table (rank int, user_id uuid, username text, display_name text, score int, is_me boolean, member_count int, avatar text, level int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare p public.profiles := public._me(); gid uuid; g public.guilds; pk text := public._period_key(p_period); observer boolean := false;
begin
  if p_guild is not null and p.role = 'owner' then gid := p_guild; observer := true;
  else select guild_id into gid from public.memberships where user_id = p.id and status = 'approved'; end if;
  if gid is null then raise exception 'You are not an approved member of a guild'; end if;
  select * into g from public.guilds where id = gid;
  if not public._guild_active(g) and p.role <> 'owner' then raise exception 'This guild is inactive. The gym needs to renew with Ascendant.'; end if;
  -- 3.4: members see the top 10 plus their own row; the owner observing a guild sees everyone
  return query
    with members as (
      select m.user_id from public.memberships m where m.guild_id = gid and m.status = 'approved'),
    s as (
      select mb.user_id as uid, pr.username as un, pr.display_name as dn, pr.avatar as av, pr.level as lv,
        coalesce((case p_category when 'consistency' then sc.consistency when 'strength' then sc.strength
                                  when 'progress' then sc.progress else sc.overall end)::int, 0) as val
      from members mb join public.profiles pr on pr.id = mb.user_id
      left join public.user_scores sc on sc.user_id = mb.user_id and sc.period = p_period and sc.period_key = pk),
    r as (select (rank() over (order by s.val desc))::int as rk, s.* from s)
    select r.rk, r.uid, r.un, r.dn, r.val, r.uid = p.id, (select count(*)::int from members), r.av, r.lv
    from r where observer or r.rk <= 10 or r.uid = p.id order by 1, 3 limit 300;
end $$;

create or replace function public.owner_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_owner();
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'active_7d', (select count(*) from public.profiles where last_seen > now() - interval '7 days'),
    'active_30d', (select count(*) from public.profiles where last_seen > now() - interval '30 days'),
    'signups_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'members', (select count(*) from public.memberships where status = 'approved'),
    'global_on', (select count(*) from public.memberships where status = 'approved' and global),
    'guilds', (select count(*) from public.guilds),
    'active_guilds', (select count(*) from public.guilds g where public._guild_active(g)),
    'weekly', (select coalesce(json_agg(json_build_object('week', to_char(w, 'YYYY-MM-DD'), 'n', n) order by w), '[]'::json) from (
        select gs::date as w, (select count(*) from public.profiles pr
          where (pr.created_at at time zone 'Asia/Kolkata')::date >= gs::date and (pr.created_at at time zone 'Asia/Kolkata')::date < gs::date + 7) as n
        from generate_series(date_trunc('week', (now() at time zone 'Asia/Kolkata')) - interval '7 weeks',
                             date_trunc('week', (now() at time zone 'Asia/Kolkata')), interval '1 week') gs) t),
    'revenue_paise', (select coalesce(sum(amount_paise), 0) from public.purchases where status = 'paid'),
    'purchases', (select count(*) from public.purchases where status = 'paid'));
end $$;

-- ---------------------------------------------------------------- 3.4: global ranking, guild pages, owner tools
create or replace function public.set_global(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles := public._me();
begin
  update public.memberships set global = coalesce(p_on, false) where user_id = p.id;
  if not found then raise exception 'Join a guild first'; end if;
end $$;

-- every member of every active guild who chose to be shown. Top 10 plus the caller's own row.
create or replace function public.global_leaderboard(p_category text, p_period text)
returns table (rank int, user_id uuid, username text, display_name text, score int, is_me boolean, avatar text, level int,
               guild_id uuid, guild_name text, total int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare p public.profiles := public._me(); pk text := public._period_key(p_period);
begin
  return query
    with pool as (
      select m.user_id as uid, g.id as gid, g.name as gname from public.memberships m join public.guilds g on g.id = m.guild_id
      where m.status = 'approved' and m.global and public._guild_active(g)),
    s as (
      select pl.uid, pl.gid, pl.gname, pr.username as un, pr.display_name as dn, pr.avatar as av, pr.level as lv,
        coalesce((case p_category when 'consistency' then sc.consistency when 'strength' then sc.strength
                                  when 'progress' then sc.progress else sc.overall end)::int, 0) as val
      from pool pl join public.profiles pr on pr.id = pl.uid
      left join public.user_scores sc on sc.user_id = pl.uid and sc.period = p_period and sc.period_key = pk),
    r as (select (rank() over (order by s.val desc))::int as rk, s.* from s)
    select r.rk, r.uid, r.un, r.dn, r.val, r.uid = p.id, r.av, r.lv, r.gid, r.gname, (select count(*)::int from pool)
    from r where r.rk <= 10 or r.uid = p.id order by 1, 3 limit 20;
end $$;

-- a guild's public page: who it is, and its top 10 among members who chose the global ranking.
-- Members of that guild see their normal guild board instead; the owner sees everyone.
create or replace function public.guild_page(p_guild uuid, p_category text, p_period text)
returns json language plpgsql stable security definer set search_path = public as $$
declare p public.profiles := public._me(); g public.guilds; pk text := public._period_key(p_period); mine boolean;
begin
  select * into g from public.guilds where id = p_guild;
  if not found then raise exception 'This guild no longer exists'; end if;
  mine := exists (select 1 from public.memberships where user_id = p.id and guild_id = g.id and status = 'approved');
  return json_build_object('id', g.id, 'name', g.name, 'city', g.city, 'logo_url', g.logo_url, 'active', public._guild_active(g),
    'members', (select count(*) from public.memberships where guild_id = g.id and status = 'approved'),
    'shown', (select count(*) from public.memberships where guild_id = g.id and status = 'approved' and global),
    'rows', (select coalesce(json_agg(x order by x.rank, x.username), '[]'::json) from (
      select (rank() over (order by v.val desc))::int as rank, v.username, v.display_name, v.avatar, v.level, v.val as score, v.uid = p.id as is_me
      from (select pr.id as uid, pr.username, pr.display_name, pr.avatar, pr.level,
              coalesce((case p_category when 'consistency' then sc.consistency when 'strength' then sc.strength
                                        when 'progress' then sc.progress else sc.overall end)::int, 0) as val
            from public.memberships m join public.profiles pr on pr.id = m.user_id
            left join public.user_scores sc on sc.user_id = m.user_id and sc.period = p_period and sc.period_key = pk
            where m.guild_id = g.id and m.status = 'approved' and (m.global or mine or p.role = 'owner')) v
      order by 1 limit 10) x));
end $$;

-- owner: guilds with their member join codes
drop function if exists public.owner_guilds();
create or replace function public.owner_guilds()
returns table (id uuid, name text, city text, logo_url text, master_username text, status text, paid_until date, active boolean, members int, pending int, created_at timestamptz, join_code text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_owner();
  return query select g.id, g.name, g.city, g.logo_url, p.username, g.status, g.paid_until, public._guild_active(g),
    (select count(*)::int from public.memberships m where m.guild_id = g.id and m.status = 'approved'),
    (select count(*)::int from public.memberships m where m.guild_id = g.id and m.status = 'pending'), g.created_at, g.join_code
    from public.guilds g left join public.profiles p on p.id = g.master_id order by g.created_at desc;
end $$;

create or replace function public.owner_regen_join_code(p_guild uuid)
returns text language plpgsql security definer set search_path = public as $$
declare jc text;
begin
  perform public._require_owner();
  loop jc := public._random_code(6); exit when not exists (select 1 from public.guilds where join_code = jc); end loop;
  update public.guilds set join_code = jc where id = p_guild;
  if not found then raise exception 'Guild not found'; end if;
  return jc;
end $$;

-- owner: release a member from a guild (ends the 30-day lock). A guild master is never released from his own guild.
create or replace function public.owner_release_member(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_owner();
  if exists (select 1 from public.guilds where master_id = p_user) then raise exception 'This user is a guild master. Delete or reassign the guild instead.'; end if;
  delete from public.memberships where user_id = p_user;
end $$;

-- owner: every signed-up user, for the CSV download
create or replace function public.owner_export_users()
returns table (username text, display_name text, role text, guild text, membership text, global boolean, level int, joined timestamptz, last_active timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_owner();
  return query select p.username, p.display_name, p.role, g.name, m.status, m.global, p.level, p.created_at, p.last_seen
    from public.profiles p left join public.memberships m on m.user_id = p.id left join public.guilds g on g.id = m.guild_id
    order by p.created_at limit 20000;
end $$;

revoke all on function public.set_global(boolean), public.global_leaderboard(text, text), public.guild_page(uuid, text, text),
  public.owner_guilds(), public.owner_regen_join_code(uuid), public.owner_release_member(uuid), public.owner_export_users() from public, anon;
grant execute on function public.set_global(boolean), public.global_leaderboard(text, text), public.guild_page(uuid, text, text),
  public.owner_guilds(), public.owner_regen_join_code(uuid), public.owner_release_member(uuid), public.owner_export_users() to authenticated;
