-- Run once in Supabase → SQL Editor. Creates the pilot events table, usernames and backups.
-- The app's public (anon) key may only INSERT events. Nobody can read rows with it.
-- The team reads the data in the Supabase dashboard (Table Editor or SQL Editor), which uses the owner's login.

create table if not exists public.events (
  id          uuid primary key,
  anon_id     text not null,                 -- random per phone
  username    text,                          -- the student's username once they pick one
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  at          timestamptz not null,          -- when it happened on the phone
  received_at timestamptz not null default now(),
  app_version text
);

create index if not exists events_anon_at on public.events (anon_id, at);
create index if not exists events_name on public.events (name);
create index if not exists events_username on public.events (username);

alter table public.events enable row level security;

drop policy if exists "app can insert events" on public.events;
create policy "app can insert events"
  on public.events for insert
  to anon
  with check (
    char_length(name) <= 64
    and char_length(anon_id) <= 64
    and pg_column_size(props) <= 4000
    and (username is null or char_length(username) <= 20)
  );

grant insert on public.events to anon;
revoke select, update, delete on public.events from anon;

-- Usernames with no password. A username links a student's events across phones and holds a backup of their
-- data (without purchase notes), so logging in on a wiped phone brings it back. RLS with no policies: the app
-- reaches this table only through the three functions below, which anon may call.
create table if not exists public.pilot_users (
  username   text primary key check (username ~ '^[a-z0-9_.]{3,20}$'),
  created_at timestamptz not null default now(),
  backup     jsonb,
  backup_at  timestamptz
);
alter table public.pilot_users enable row level security;

-- true if the username was free and is now theirs, false if it's taken
create or replace function public.pilot_signup(p_username text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pilot_users (username) values (lower(trim(p_username)));
  return true;
exception when unique_violation then
  return false;
end $$;

-- {backup, backup_at} for a username, or null if it doesn't exist
create or replace function public.pilot_login(p_username text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('backup', u.backup, 'backup_at', u.backup_at)
  from public.pilot_users u where u.username = lower(trim(p_username));
$$;

create or replace function public.pilot_backup(p_username text, p_backup jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if pg_column_size(p_backup) > 200000 then return false; end if;
  update public.pilot_users set backup = p_backup, backup_at = now()
  where username = lower(trim(p_username));
  return found;
end $$;

grant execute on function public.pilot_signup(text) to anon;
grant execute on function public.pilot_login(text) to anon;
grant execute on function public.pilot_backup(text, jsonb) to anon;

-- Events with one `student` per person: the username, also filled in for events a phone sent before the
-- student picked it, else the phone's random ID. security_invoker keeps it closed to the anon key.
create or replace view public.student_events with (security_invoker = true) as
select e.*, coalesce(e.username, m.username, e.anon_id) as student
from public.events e
left join (
  select distinct on (anon_id) anon_id, username
  from public.events where username is not null
  order by anon_id, at desc
) m using (anon_id);
