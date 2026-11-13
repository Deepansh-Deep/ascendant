-- One-off patch for a live database that already has the 3.3 schema.
-- Paste into Supabase > SQL Editor > Run. Safe to run more than once.

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

revoke all on function public.owner_delete_code(text), public.owner_purge_codes() from public, anon;
grant execute on function public.owner_delete_code(text), public.owner_purge_codes() to authenticated;
