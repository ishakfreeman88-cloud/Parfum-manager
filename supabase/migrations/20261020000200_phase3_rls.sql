-- ============================================================
-- Phase 3 : fonctions d'aide et politiques RLS
-- ============================================================

-- ---------- Fonctions d'aide (security definer = évite les boucles RLS) ----------

-- L'utilisateur connecté est-il membre ACTIF de cette entreprise ?
create or replace function public.is_company_member(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- L'utilisateur connecté a-t-il l'un de ces rôles dans cette entreprise ?
create or replace function public.has_company_role(p_company uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

-- Cet utilisateur partage-t-il une entreprise active avec moi ?
create or replace function public.shares_company_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members a
    join public.company_members b on b.company_id = a.company_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = p_user      and b.status = 'active'
  );
$$;

revoke all on function public.is_company_member(uuid)        from public, anon;
revoke all on function public.has_company_role(uuid, text[]) from public, anon;
revoke all on function public.shares_company_with(uuid)      from public, anon;
grant execute on function public.is_company_member(uuid)        to authenticated;
grant execute on function public.has_company_role(uuid, text[]) to authenticated;
grant execute on function public.shares_company_with(uuid)      to authenticated;

-- ---------- Droits de base : on retire tout, puis on donne le strict nécessaire ----------
revoke all on public.profiles, public.companies, public.company_members
  from anon, authenticated;

grant select on public.profiles        to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

grant select on public.companies       to authenticated;
grant update (name, currency, timezone, language) on public.companies to authenticated;

grant select on public.company_members to authenticated;
-- Pas d'insert/update/delete direct sur company_members :
-- les invitations et changements de rôle passeront par des fonctions sécurisées (phase 5).

-- ---------- Politiques : PROFILS ----------
create policy profiles_select
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_company_with(id));

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- Politiques : ENTREPRISES ----------
create policy companies_select_members
  on public.companies for select to authenticated
  using (public.is_company_member(id));

create policy companies_update_admin
  on public.companies for update to authenticated
  using (public.has_company_role(id, array['admin']))
  with check (public.has_company_role(id, array['admin']));

-- ---------- Politiques : MEMBRES ----------
create policy members_select_same_company
  on public.company_members for select to authenticated
  using (public.is_company_member(company_id));
