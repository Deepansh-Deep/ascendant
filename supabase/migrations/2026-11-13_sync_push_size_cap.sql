-- Ascendant: cap the size of one day of training synced to the server.
-- Run once in Supabase > SQL Editor. Safe to re-run. Changes nothing else.
-- Why: without a cap, any logged-in user could push huge JSON and fill your database.
-- A normal day of training is a few KB; the cap is 100 KB per day.

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

-- keep the same permissions as before (the schema revokes everything, then grants to signed-in users)
revoke all on function public.sync_push(jsonb, jsonb) from public, anon;
grant execute on function public.sync_push(jsonb, jsonb) to authenticated;
