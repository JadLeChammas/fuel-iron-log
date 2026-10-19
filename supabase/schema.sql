-- Fuel & Iron Log — run this once in Supabase: SQL Editor → New query → paste → Run.
-- Every row belongs to the signed-in user; row-level security makes sure nobody else can read or change it.

create table if not exists public.days (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date     date not null,
  meals    jsonb not null default '[]'::jsonb,   -- [{id, name, kcal, protein, meal}]
  workout  jsonb not null default '{"type":"rest"}'::jsonb, -- {type, planName, exercises:[{name,sets,reps,weight}], activity, minutes, notes}
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.weighins (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date     date not null,
  kg       numeric(5,1) not null check (kg > 0),
  primary key (user_id, date)
);

create table if not exists public.settings (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kcal_target    integer,
  protein_target integer,
  goal_weight    numeric(5,1),
  plan           jsonb not null default '[]'::jsonb -- [{id, name, exercises:[{name,sets,reps,weight}]}]
);

alter table public.days     enable row level security;
alter table public.weighins enable row level security;
alter table public.settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['days','weighins','settings'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists days_touch on public.days;
create trigger days_touch before update on public.days
  for each row execute function public.touch_updated_at();
