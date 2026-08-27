create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  registered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Users can update their profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Users can create their profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.reports (
  id text primary key,
  kind text not null check (kind in ('Missing', 'Found')),
  name text not null,
  age text not null,
  gender text not null,
  district text not null,
  province text not null,
  location text not null,
  report_date date not null,
  status text not null default 'Active' check (status in ('Active', 'Under review', 'Reconnected')),
  verification text not null default 'Approved' check (verification in ('Approved', 'Pending', 'Rejected')),
  description text not null,
  reporter text not null,
  phone text not null,
  email text not null,
  photo text,
  owner text not null,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "Public can read approved reports"
  on public.reports for select
  using (verification = 'Approved' or owner = auth.uid()::text);

drop policy if exists "Public can create reports" on public.reports;
drop policy if exists "Authenticated users can create their reports" on public.reports;
create policy "Authenticated users can create their reports"
  on public.reports for insert
  to authenticated
  with check (owner = auth.uid()::text);

drop policy if exists "Public can update reports" on public.reports;
drop policy if exists "Users can update their reports" on public.reports;
create policy "Users can update their reports"
  on public.reports for update
  to authenticated
  using (owner = auth.uid()::text)
  with check (owner = auth.uid()::text);

drop policy if exists "Users can delete their reports" on public.reports;
create policy "Users can delete their reports"
  on public.reports for delete
  to authenticated
  using (owner = auth.uid()::text);

insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

create policy "Public can view report photos"
  on storage.objects for select
  using (bucket_id = 'report-photos');

create policy "Public can upload report photos"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'report-photos');
