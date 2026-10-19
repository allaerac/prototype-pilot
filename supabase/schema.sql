-- Run once in Supabase → SQL Editor. Creates the pilot events table.
-- The app's public (anon) key may only INSERT. Nobody can read rows with it.
-- The team reads the data in the Supabase dashboard (Table Editor or SQL Editor), which uses the owner's login.

create table if not exists public.events (
  id          uuid primary key,
  anon_id     text not null,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  at          timestamptz not null,          -- when it happened on the phone
  received_at timestamptz not null default now(),
  app_version text
);

create index if not exists events_anon_at on public.events (anon_id, at);
create index if not exists events_name on public.events (name);

alter table public.events enable row level security;

drop policy if exists "app can insert events" on public.events;
create policy "app can insert events"
  on public.events for insert
  to anon
  with check (
    char_length(name) <= 64
    and char_length(anon_id) <= 64
    and pg_column_size(props) <= 4000
  );

grant insert on public.events to anon;
revoke select, update, delete on public.events from anon;
