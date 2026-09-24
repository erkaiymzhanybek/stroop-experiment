create table if not exists public.participants (
  session_id uuid primary key,
  participant_id text not null,
  preferred_language text not null check (preferred_language in ('ru','ky')),
  age integer not null check (age between 18 and 25),
  gender text not null,
  grew_up_place text not null,
  university text not null,
  study_year text not null,
  blp_responses jsonb not null,
  history_kyrgyz numeric not null,
  history_russian numeric not null,
  use_kyrgyz numeric not null,
  use_russian numeric not null,
  proficiency_kyrgyz numeric not null,
  proficiency_russian numeric not null,
  attitudes_kyrgyz numeric not null,
  attitudes_russian numeric not null,
  global_kyrgyz numeric not null,
  global_russian numeric not null,
  dominance_index numeric not null,
  dominance_category text not null check (dominance_category in ('kyrgyz_dominant','russian_dominant','balanced')),
  counterbalance_group integer,
  first_language text,
  second_language text,
  experiment_version text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.trials (
  trial_id uuid primary key,
  session_id uuid not null references public.participants(session_id) on delete cascade,
  participant_id text not null,
  language text not null check (language in ('kyrgyz','russian')),
  block text not null check (block in ('practice','main')),
  trial_number integer not null,
  condition text not null check (condition in ('congruent','incongruent')),
  rt_ms numeric,
  accuracy boolean,
  response text,
  timeout boolean not null,
  word text not null,
  ink_color text not null,
  timestamp timestamptz not null,
  experiment_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists trials_session_idx on public.trials(session_id);
create index if not exists trials_participant_idx on public.trials(participant_id);
alter table public.participants enable row level security;
alter table public.trials enable row level security;
revoke all on table public.participants from anon, authenticated;
revoke all on table public.trials from anon, authenticated;
grant insert on table public.participants to anon;
grant insert on table public.trials to anon;
drop policy if exists anon_insert_participants on public.participants;
create policy anon_insert_participants on public.participants for insert to anon
with check (age between 18 and 25 and preferred_language in ('ru','ky'));
drop policy if exists anon_insert_trials on public.trials;
create policy anon_insert_trials on public.trials for insert to anon
with check (language in ('kyrgyz','russian') and block in ('practice','main') and condition in ('congruent','incongruent') and trial_number > 0);


-- Exact 30/30 counterbalancing allocation for eligible (non-balanced) participants.
create table if not exists public.counterbalance_allocations (
  slot_no integer primary key check (slot_no between 1 and 60),
  session_id uuid not null unique,
  participant_id text not null,
  group_no integer not null check (group_no in (1,2)),
  created_at timestamptz not null default now()
);

alter table public.counterbalance_allocations enable row level security;
revoke all on table public.counterbalance_allocations from anon, authenticated;

create or replace function public.claim_counterbalance_group(p_session_id uuid, p_participant_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_group integer;
  next_slot integer;
  assigned_group integer;
begin
  select group_no into existing_group
  from public.counterbalance_allocations
  where session_id = p_session_id;

  if existing_group is not null then
    return existing_group;
  end if;

  -- Serialize allocation so two participants cannot receive the same slot.
  perform pg_advisory_xact_lock(73482915);

  select coalesce(max(slot_no), 0) + 1 into next_slot
  from public.counterbalance_allocations;

  if next_slot > 60 then
    return null;
  end if;

  assigned_group := case when next_slot <= 30 then 1 else 2 end;

  insert into public.counterbalance_allocations(slot_no, session_id, participant_id, group_no)
  values (next_slot, p_session_id, p_participant_id, assigned_group);

  return assigned_group;
end;
$$;

revoke all on function public.claim_counterbalance_group(uuid, text) from public;
grant execute on function public.claim_counterbalance_group(uuid, text) to anon, authenticated;
