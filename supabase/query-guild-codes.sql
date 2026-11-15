-- Read-only: lists each gym's name, member join code and status. Run with the "Apply database patch" workflow.
select g.name, g.city, g.join_code, g.status, g.paid_until,
  (select count(*) from public.memberships m where m.guild_id = g.id and m.status = 'approved') as members
from public.guilds g order by g.created_at;
