-- GreenCollar core database foundation (not deployed).
-- Requires Supabase auth; all business-scoped records protected by RLS.
create extension if not exists pgcrypto;
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','worker')),
  primary key (business_id,user_id)
);
create or replace function public.is_business_member(target_business uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships
    where business_id=target_business and user_id=(select auth.uid()))
$$;
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null, email text, phone text, notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.service_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  address text not null, latitude double precision, longitude double precision,
  access_notes text, preferences text
);
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  location_id uuid not null references public.service_locations(id),
  service_name text not null, rate_cents integer not null default 0 check (rate_cents>=0),
  expected_minutes integer not null default 60 check(expected_minutes>0),
  scheduled_for timestamptz, status text not null default 'pending'
    check(status in ('pending','planned','in_progress','completed','cancelled')),
  notes text, created_at timestamptz not null default now()
);
create table if not exists public.visit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  event_type text not null check(event_type in ('arrived','started','paused','resumed','finished','departed','corrected')),
  occurred_at timestamptz not null, source text not null check(source in ('manual','gps','system')),
  created_at timestamptz not null default now()
);
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.customers enable row level security;
alter table public.service_locations enable row level security;
alter table public.jobs enable row level security;
alter table public.visit_events enable row level security;
create policy businesses_read on public.businesses for select to authenticated using (public.is_business_member(id));
create policy memberships_read on public.memberships for select to authenticated using (public.is_business_member(business_id));
create policy customers_access on public.customers for all to authenticated using (public.is_business_member(business_id)) with check(public.is_business_member(business_id));
create policy locations_access on public.service_locations for all to authenticated using (public.is_business_member(business_id)) with check(public.is_business_member(business_id));
create policy jobs_access on public.jobs for all to authenticated using (public.is_business_member(business_id)) with check(public.is_business_member(business_id));
create policy events_access on public.visit_events for all to authenticated using (public.is_business_member(business_id)) with check(public.is_business_member(business_id));
-- Before applying: add DB-level validation ensuring referenced customer/location/job belong
-- to the same business, provision business creation via an authenticated server action,
-- and add write restrictions on owner/admin-only tables. This migration is a draft foundation.
