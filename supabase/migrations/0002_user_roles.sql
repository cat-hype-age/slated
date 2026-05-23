-- 0002_user_roles.sql
-- Application roles. Follows the Supabase best-practice pattern:
-- - user_roles separate from any future profiles table (prevents
--   client-side role escalation by editing the user's own profile)
-- - has_role() is SECURITY DEFINER so RLS policies on other tables
--   can call it without recursion into user_roles' own RLS

create type app_role as enum ('admin', 'user');

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  granted_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table user_roles enable row level security;

-- Users can read their own role rows (so the UI can branch on them).
-- Role grants only come from admin SQL or service-role inserts.
create policy "users read own roles"
  on user_roles for select
  using (auth.uid() = user_id);

create or replace function has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- Seed Cat Varnell as admin (idempotent — runs on every apply but
-- only affects rows when the user exists and the role isn't already
-- granted).
insert into user_roles (user_id, role)
select id, 'admin'::app_role from auth.users
where email = 'cat.varnell@hypeage.com'
on conflict (user_id, role) do nothing;
