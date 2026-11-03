-- Read It! — server for student progress.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Students never log in: each has a secret code (in their personal link).
-- They can only call the functions below with their own code.
-- The teacher logs in with email + password (Authentication → Users → Add user)
-- and can read everything.

create table if not exists students (
  code        text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists progress (
  code        text primary key references students(code) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists events (
  id          bigint generated always as identity primary key,
  code        text not null references students(code) on delete cascade,
  kind        text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists events_code_time on events (code, created_at desc);

create table if not exists assignments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references students(code) on delete cascade,
  unit        text not null,          -- e.g. 'phonics:l1'
  mode        text not null,          -- 'practice' | 'test' | 'review'
  note        text,
  due         date,
  created_at  timestamptz not null default now()
);

alter table students    enable row level security;
alter table progress    enable row level security;
alter table events      enable row level security;
alter table assignments enable row level security;

-- Teacher (any logged-in user of this project) sees and edits everything.
do $$ begin
  create policy teacher_all on students    for all to authenticated using (true) with check (true);
  create policy teacher_all on progress    for all to authenticated using (true) with check (true);
  create policy teacher_all on events      for all to authenticated using (true) with check (true);
  create policy teacher_all on assignments for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Student functions (anonymous key). Each checks the code first.

create or replace function join_student(p_code text)
returns json language sql security definer set search_path = public as $$
  select json_build_object('name', name) from students where code = p_code;
$$;

create or replace function get_progress(p_code text)
returns jsonb language sql security definer set search_path = public as $$
  select data from progress where code = p_code;
$$;

create or replace function save_progress(p_code text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from students where code = p_code) then raise exception 'unknown student'; end if;
  insert into progress (code, data, updated_at) values (p_code, p_data, now())
  on conflict (code) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function log_event(p_code text, p_kind text, p_payload jsonb, p_at timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from students where code = p_code) then raise exception 'unknown student'; end if;
  insert into events (code, kind, payload, created_at) values (p_code, p_kind, p_payload, coalesce(p_at, now()));
end $$;

create or replace function get_assignments(p_code text)
returns setof assignments language sql security definer set search_path = public as $$
  select * from assignments where code = p_code order by created_at desc limit 20;
$$;

grant execute on function join_student, get_progress, save_progress, log_event, get_assignments to anon;
