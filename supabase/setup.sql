begin;

create table if not exists public.naka_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.naka_workspace (
  id text primary key check (id = 'main'),
  revision integer not null default 0 check (revision >= 0),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint naka_payload_shape check (
    (jsonb_typeof(payload) = 'object'
    and payload ->> 'version' = '1'
    and jsonb_typeof(payload -> 'activities') = 'array'
    and jsonb_typeof(payload -> 'templateImports') = 'array'
    and payload ->> 'catalogRevision' = '2'
    and jsonb_typeof(payload -> 'management') = 'object'
    and payload -> 'management' ->> 'version' = '1'
    and jsonb_typeof(payload -> 'management' -> 'agms') = 'array'
    and jsonb_typeof(payload -> 'management' -> 'resolutions') = 'array'
    and jsonb_typeof(payload -> 'management' -> 'meetings') = 'array'
    and octet_length(payload::text) <= 5242880) is true
  )
);

alter table public.naka_members enable row level security;
alter table public.naka_workspace enable row level security;

revoke all on public.naka_members from anon, authenticated;
revoke all on public.naka_workspace from anon, authenticated;
grant select on public.naka_members to authenticated;
grant select on public.naka_workspace to authenticated;
grant update (payload, revision) on public.naka_workspace to authenticated;

drop policy if exists naka_own_membership on public.naka_members;
create policy naka_own_membership on public.naka_members
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists naka_team_read on public.naka_workspace;
create policy naka_team_read on public.naka_workspace
  for select to authenticated using (
    exists (select 1 from public.naka_members where user_id = (select auth.uid()))
  );

drop policy if exists naka_team_write on public.naka_workspace;
create policy naka_team_write on public.naka_workspace
  for update to authenticated
  using (exists (select 1 from public.naka_members where user_id = (select auth.uid())))
  with check (exists (select 1 from public.naka_members where user_id = (select auth.uid())));

create or replace function public.naka_guard_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'Revision must increase by exactly one';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.naka_guard_update() from public, anon, authenticated;
drop trigger if exists naka_guard_update on public.naka_workspace;
create trigger naka_guard_update before update on public.naka_workspace
  for each row execute function public.naka_guard_update();

insert into public.naka_workspace (id, payload)
values ('main', '{"version":1,"activities":[],"templateImports":[],"catalogRevision":2,"management":{"version":1,"agms":[],"resolutions":[],"meetings":[]}}'::jsonb)
on conflict (id) do nothing;

commit;
