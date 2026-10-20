-- ============================================================
-- Phase 2 : profils, entreprises, membres, rôles
-- ============================================================

-- Met à jour automatiquement la colonne updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- PROFILS ----------
create table public.profiles (
  id          uuid primary key references auth.users (id),
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- ENTREPRISES ----------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  currency    text not null default 'DZD',
  timezone    text not null default 'Africa/Algiers',
  language    text not null default 'fr',
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- MEMBRES ET RÔLES ----------
-- Pas de suppression : un accès retiré passe en statut 'revoked' (historique conservé).
create table public.company_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id),
  user_id     uuid not null references public.profiles (id),
  role        text not null check (role in ('admin', 'manager', 'seller', 'reader')),
  status      text not null default 'active' check (status in ('active', 'revoked')),
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_members_user_idx on public.company_members (user_id);

-- ---------- updated_at automatique ----------
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger company_members_updated_at before update on public.company_members
  for each row execute function public.set_updated_at();

-- ---------- Profil créé automatiquement à l'inscription ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Création d'une entreprise (atomique) ----------
-- L'entreprise et le membre administrateur sont créés ensemble, ou pas du tout.
create or replace function public.create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
begin
  if v_uid is null then
    raise exception 'Utilisateur non connecté';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 then
    raise exception 'Nom d''entreprise invalide';
  end if;

  insert into public.companies (name, created_by)
  values (btrim(p_name), v_uid)
  returning id into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company, v_uid, 'admin');

  return v_company;
end;
$$;

revoke all on function public.create_company(text) from public, anon;
grant execute on function public.create_company(text) to authenticated;

-- ---------- SÉCURITÉ : RLS activé, aucune politique = accès refusé ----------
-- Les politiques d'accès seront ajoutées en phase 3.
alter table public.profiles        enable row level security;
alter table public.companies       enable row level security;
alter table public.company_members enable row level security;

revoke all on public.profiles, public.companies, public.company_members from anon;
