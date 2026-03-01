create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  destination text not null,
  start_date date,
  end_date date,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  cover_title text not null default '',
  cover_subtitle text not null default '',
  cover_image_path text not null default '',
  theme jsonb not null default '{}'::jsonb
);

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  date date,
  start_time text,
  end_time text,
  title text not null,
  place text not null default '',
  notes text not null default '',
  owner_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guide_sections (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  content text not null default '',
  order_index integer not null default 1,
  style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  date date,
  title text not null,
  content text not null,
  image_paths text[] not null default '{}',
  author_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'itinerary_items_set_updated_at'
  ) then
    create trigger itinerary_items_set_updated_at
      before update on public.itinerary_items
      for each row
      execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'guide_sections_set_updated_at'
  ) then
    create trigger guide_sections_set_updated_at
      before update on public.guide_sections
      for each row
      execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'memories_set_updated_at'
  ) then
    create trigger memories_set_updated_at
      before update on public.memories
      for each row
      execute function public.set_updated_at();
  end if;
end
$$;

create or replace function public.path_trip_id(path text)
returns uuid
language plpgsql
immutable
as $$
declare
  first_segment text;
begin
  first_segment := split_part(path, '/', 1);
  if first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return first_segment::uuid;
  end if;
  return null;
end;
$$;

create or replace function public.is_trip_member(target_trip uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip
      and tm.user_id = auth.uid()
  );
$$;

grant execute on function public.is_trip_member(uuid) to authenticated;

grant execute on function public.path_trip_id(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.guide_sections enable row level security;
alter table public.memories enable row level security;

drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists trips_select_member on public.trips;
create policy trips_select_member
  on public.trips
  for select
  to authenticated
  using (public.is_trip_member(id));

drop policy if exists trips_insert_creator on public.trips;
create policy trips_insert_creator
  on public.trips
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists trips_update_member on public.trips;
create policy trips_update_member
  on public.trips
  for update
  to authenticated
  using (public.is_trip_member(id))
  with check (public.is_trip_member(id));

drop policy if exists trip_members_select_member on public.trip_members;
create policy trip_members_select_member
  on public.trip_members
  for select
  to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists trip_members_insert_self on public.trip_members;
create policy trip_members_insert_self
  on public.trip_members
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists itinerary_select_member on public.itinerary_items;
create policy itinerary_select_member
  on public.itinerary_items
  for select
  to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists itinerary_insert_member on public.itinerary_items;
create policy itinerary_insert_member
  on public.itinerary_items
  for insert
  to authenticated
  with check (public.is_trip_member(trip_id));

drop policy if exists itinerary_update_member on public.itinerary_items;
create policy itinerary_update_member
  on public.itinerary_items
  for update
  to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists itinerary_delete_member on public.itinerary_items;
create policy itinerary_delete_member
  on public.itinerary_items
  for delete
  to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists guide_select_member on public.guide_sections;
create policy guide_select_member
  on public.guide_sections
  for select
  to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists guide_insert_member on public.guide_sections;
create policy guide_insert_member
  on public.guide_sections
  for insert
  to authenticated
  with check (public.is_trip_member(trip_id));

drop policy if exists guide_update_member on public.guide_sections;
create policy guide_update_member
  on public.guide_sections
  for update
  to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists guide_delete_member on public.guide_sections;
create policy guide_delete_member
  on public.guide_sections
  for delete
  to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists memories_select_member on public.memories;
create policy memories_select_member
  on public.memories
  for select
  to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists memories_insert_member on public.memories;
create policy memories_insert_member
  on public.memories
  for insert
  to authenticated
  with check (public.is_trip_member(trip_id));

drop policy if exists memories_update_member on public.memories;
create policy memories_update_member
  on public.memories
  for update
  to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists memories_delete_member on public.memories;
create policy memories_delete_member
  on public.memories
  for delete
  to authenticated
  using (public.is_trip_member(trip_id));

insert into storage.buckets (id, name, public)
values ('trip-covers', 'trip-covers', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('memory-images', 'memory-images', true)
on conflict (id) do nothing;

drop policy if exists storage_trip_select on storage.objects;
create policy storage_trip_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id in ('trip-covers', 'memory-images')
      and public.path_trip_id(name) is not null
      and public.is_trip_member(public.path_trip_id(name))
  );

drop policy if exists storage_trip_insert on storage.objects;
create policy storage_trip_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('trip-covers', 'memory-images')
      and public.path_trip_id(name) is not null
      and public.is_trip_member(public.path_trip_id(name))
  );

drop policy if exists storage_trip_update on storage.objects;
create policy storage_trip_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('trip-covers', 'memory-images')
      and public.path_trip_id(name) is not null
      and public.is_trip_member(public.path_trip_id(name))
  )
  with check (
    bucket_id in ('trip-covers', 'memory-images')
      and public.path_trip_id(name) is not null
      and public.is_trip_member(public.path_trip_id(name))
  );

drop policy if exists storage_trip_delete on storage.objects;
create policy storage_trip_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('trip-covers', 'memory-images')
      and public.path_trip_id(name) is not null
      and public.is_trip_member(public.path_trip_id(name))
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trips'
  ) then
    alter publication supabase_realtime add table public.trips;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trip_members'
  ) then
    alter publication supabase_realtime add table public.trip_members;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'itinerary_items'
  ) then
    alter publication supabase_realtime add table public.itinerary_items;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'guide_sections'
  ) then
    alter publication supabase_realtime add table public.guide_sections;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'memories'
  ) then
    alter publication supabase_realtime add table public.memories;
  end if;
end
$$;
