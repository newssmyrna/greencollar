-- GreenCollar initial staging schema; not deployed by this commit.
-- Membership and business onboarding must use a privileged, authenticated server operation.
create extension if not exists pgcrypto;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table public.memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','admin','worker')),
  primary key (business_id,user_id)
);
-- SECURITY DEFINER functions owned by migration role; bypass membership RLS to avoid recursion.
-- Fix search_path and schema-qualify relations, never accept a claimed user ID from callers.
create function public.is_business_member(target_business uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.memberships m
    where m.business_id=target_business and m.user_id=(select auth.uid())
  )
$$;
create function public.can_manage_business(target_business uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.memberships m
    where m.business_id=target_business
      and m.user_id=(select auth.uid()) and m.role in ('owner','admin')
  )
$$;
revoke all on function public.is_business_member(uuid) from public, anon;
revoke all on function public.can_manage_business(uuid) from public, anon;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.can_manage_business(uuid) to authenticated;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null, email text, phone text, notes text,
  created_at timestamptz not null default now(),
  unique (business_id,id)
);
create table public.service_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  address text not null,
  latitude double precision check(latitude between -90 and 90),
  longitude double precision check(longitude between -180 and 180),
  access_notes text, preferences text,
  unique(business_id,id),
  unique(business_id,customer_id,id),
  foreign key (business_id,customer_id)
    references public.customers(business_id,id) on delete cascade
);
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  location_id uuid not null,
  service_name text not null,
  rate_cents integer not null default 0 check(rate_cents>=0),
  expected_minutes integer not null default 60 check(expected_minutes>0),
  scheduled_for timestamptz,
  status text not null default 'pending' check
    (status in ('pending','planned','in_progress','completed','cancelled')),
  notes text, created_at timestamptz not null default now(),
  unique(business_id,id),
  foreign key(business_id,customer_id)
    references public.customers(business_id,id),
  foreign key(business_id,customer_id,location_id)
    references public.service_locations(business_id,customer_id,id)
);
create table public.visit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null,
  event_type text not null check(event_type in
    ('arrived','started','paused','resumed','finished','departed','corrected')),
  occurred_at timestamptz not null,
  source text not null check(source in ('manual','gps','system')),
  created_at timestamptz not null default now(),
  foreign key(business_id,job_id) references public.jobs(business_id,id) on delete cascade
);
create index customers_business_idx on public.customers(business_id);
create index locations_business_idx on public.service_locations(business_id);
create index jobs_business_schedule_idx on public.jobs(business_id,scheduled_for);
create index events_job_time_idx on public.visit_events(business_id,job_id,occurred_at);

alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.customers enable row level security;
alter table public.service_locations enable row level security;
alter table public.jobs enable row level security;
alter table public.visit_events enable row level security;

create policy businesses_select on public.businesses for select to authenticated
  using(public.is_business_member(id));
create policy businesses_update on public.businesses for update to authenticated
  using(public.can_manage_business(id)) with check(public.can_manage_business(id));
-- Intentionally no direct client INSERT/DELETE on businesses or memberships.
-- Create the business and initial owner membership atomically on a trusted server.
create policy memberships_select on public.memberships for select to authenticated
  using(public.is_business_member(business_id));
create policy customers_select on public.customers for select to authenticated
  using(public.is_business_member(business_id));
create policy customers_insert on public.customers for insert to authenticated
  with check(public.can_manage_business(business_id));
create policy customers_update on public.customers for update to authenticated
  using(public.can_manage_business(business_id))
  with check(public.can_manage_business(business_id));
create policy customers_delete on public.customers for delete to authenticated
  using(public.can_manage_business(business_id));
create policy locations_select on public.service_locations for select to authenticated
  using(public.is_business_member(business_id));
create policy locations_insert on public.service_locations for insert to authenticated
  with check(public.can_manage_business(business_id));
create policy locations_update on public.service_locations for update to authenticated
  using(public.can_manage_business(business_id))
  with check(public.can_manage_business(business_id));
create policy locations_delete on public.service_locations for delete to authenticated
  using(public.can_manage_business(business_id));
create policy jobs_select on public.jobs for select to authenticated
  using(public.is_business_member(business_id));
create policy jobs_insert on public.jobs for insert to authenticated
  with check(public.can_manage_business(business_id));
create policy jobs_update on public.jobs for update to authenticated
  using(public.can_manage_business(business_id))
  with check(public.can_manage_business(business_id));
create policy jobs_delete on public.jobs for delete to authenticated
  using(public.can_manage_business(business_id));
create policy events_select on public.visit_events for select to authenticated
  using(public.is_business_member(business_id));
create policy events_insert on public.visit_events for insert to authenticated
  with check(public.is_business_member(business_id));
-- Event log is append-only for authenticated members; corrections are new events.
