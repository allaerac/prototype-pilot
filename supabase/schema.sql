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
    and (username is null or char_length(username) <= 43)
  );

grant insert on public.events to anon;
revoke select, update, delete on public.events from anon;

-- Usernames with no password: first name + last name + 2 numbers the student picks (austin.allaer27).
-- A username links a student's events across phones and holds a backup of their data (without purchase
-- notes), so logging in on a wiped phone brings it back. RLS with no policies: the app reaches this table
-- only through the three functions below, which anon may call.
create table if not exists public.pilot_users (
  username   text primary key,
  created_at timestamptz not null default now(),
  backup     jsonb,
  backup_at  timestamptz
);
alter table public.pilot_users drop constraint if exists pilot_users_username_check;   -- the old nickname rule
alter table public.pilot_users drop constraint if exists pilot_users_username_format;
alter table public.pilot_users add constraint pilot_users_username_format
  check (username ~ '^[a-z]{1,20}\.[a-z]{1,20}[0-9]{2}$') not valid;   -- not valid: older test rows are left alone
alter table public.pilot_users enable row level security;

-- true if the username is now theirs, false if it's taken, null if it isn't first.last + 2 numbers
create or replace function public.pilot_signup(p_username text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pilot_users (username) values (lower(trim(p_username)));
  return true;
exception
  when unique_violation then return false;
  when check_violation then return null;
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

-- ===== Metrics for the team (Table Editor → each view). Times are Oxford time (America/New_York). =====
-- "Opens" counts every time the app comes on screen, including switching back to it. A "visit" is an open at
-- least 30 minutes after that student's previous one, so flipping between apps doesn't inflate the numbers.

-- Every open, one row each, with whether it counts as a new visit
create or replace view public.metric_opens with (security_invoker = true) as
select student,
       at at time zone 'America/New_York' as opened_at,
       (props->>'standalone')::boolean as from_home_screen,
       (lag(at) over (partition by student order by at) is null
        or at - lag(at) over (partition by student order by at) >= interval '30 minutes') as new_visit
from public.student_events
where name in ('app_open', 'consent_given', 'login');   -- agreeing (first visit) and logging in on a phone count too

-- Each day: how many students opened the app, their visits, and raw opens
create or replace view public.metric_daily_active with (security_invoker = true) as
select opened_at::date as day,
       count(distinct student) as students,
       count(*) filter (where new_visit) as visits,
       count(*) as opens
from public.metric_opens
group by 1 order by 1;

-- When people open it: visits by weekday and hour
create or replace view public.metric_open_times with (security_invoker = true) as
select extract(isodow from opened_at)::int as weekday_no,
       to_char(opened_at, 'Dy') as weekday,
       extract(hour from opened_at)::int as hour,
       count(*) as visits,
       count(distinct student) as students
from public.metric_opens
where new_visit
group by 1, 2, 3 order by 1, 3;

-- One row per student: when they started, finished setup, last opened, and how much they've used it
create or replace view public.metric_students with (security_invoker = true) as
select student,
       min(at) at time zone 'America/New_York' as first_seen,
       min(at) filter (where name = 'setup_complete') at time zone 'America/New_York' as setup_done,
       max(at) filter (where name in ('app_open', 'consent_given', 'login')) at time zone 'America/New_York' as last_open,
       count(*) filter (where name in ('app_open', 'consent_given', 'login')) as opens,
       count(distinct (at at time zone 'America/New_York')::date) filter (where name in ('app_open', 'consent_given', 'login')) as days_active,
       count(*) filter (where name = 'tx_add') as purchases_logged
from public.student_events
group by student
order by last_open desc nulls last;
