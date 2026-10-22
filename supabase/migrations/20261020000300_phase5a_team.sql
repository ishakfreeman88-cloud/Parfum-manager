-- ============================================================
-- Phase 5a : invitations, changement de rôle, révocation, audit
-- ============================================================

-- ---------- INVITATIONS ----------
create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id),
  code         text not null unique,
  role         text not null check (role in ('admin', 'manager', 'seller', 'reader')),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  invited_by   uuid not null references public.profiles (id),
  accepted_by  uuid references public.profiles (id),
  accepted_at  timestamptz,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  created_at   timestamptz not null default now()
);
create index invitations_company_idx on public.invitations (company_id);

-- ---------- JOURNAL D'AUDIT (jamais modifié ni supprimé) ----------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id),
  actor_id    uuid references public.profiles (id),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_company_idx on public.audit_logs (company_id, created_at desc);

-- ---------- SÉCURITÉ ----------
alter table public.invitations enable row level security;
alter table public.audit_logs  enable row level security;

revoke all on public.invitations, public.audit_logs from anon, authenticated;
grant select on public.invitations, public.audit_logs to authenticated;
-- Aucune écriture directe : tout passe par les fonctions ci-dessous.

create policy invitations_select_admin
  on public.invitations for select to authenticated
  using (public.has_company_role(company_id, array['admin']));

create policy audit_select_admin
  on public.audit_logs for select to authenticated
  using (public.has_company_role(company_id, array['admin']));

-- ---------- CRÉER UNE INVITATION (administrateur) ----------
create or replace function public.create_invitation(p_company uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'Utilisateur non connecté';
  end if;
  if not public.has_company_role(p_company, array['admin']) then
    raise exception 'Action réservée aux administrateurs';
  end if;
  if p_role is null or p_role not in ('admin', 'manager', 'seller', 'reader') then
    raise exception 'Rôle invalide';
  end if;

  v_code := upper(
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)
  );

  insert into public.invitations (company_id, code, role, invited_by)
  values (p_company, v_code, p_role, v_uid)
  returning id into v_id;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, v_uid, 'invitation_created', 'invitation', v_id,
          jsonb_build_object('role', p_role));

  return v_code;
end;
$$;

-- ---------- ANNULER UNE INVITATION (administrateur) ----------
create or replace function public.cancel_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations;
begin
  if v_uid is null then
    raise exception 'Utilisateur non connecté';
  end if;

  select * into v_inv from public.invitations where id = p_id for update;
  if not found or not public.has_company_role(v_inv.company_id, array['admin']) then
    raise exception 'Invitation introuvable';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Cette invitation n''est plus en attente';
  end if;

  update public.invitations set status = 'cancelled' where id = p_id;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id)
  values (v_inv.company_id, v_uid, 'invitation_cancelled', 'invitation', p_id);
end;
$$;

-- ---------- ACCEPTER UNE INVITATION (utilisateur invité) ----------
-- Le verrouillage "for update" empêche qu'un même code serve deux fois.
create or replace function public.accept_invitation(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv  public.invitations;
begin
  if v_uid is null then
    raise exception 'Utilisateur non connecté';
  end if;

  if exists (
    select 1 from public.company_members
    where user_id = v_uid and status = 'active'
  ) then
    raise exception 'Vous appartenez déjà à une entreprise';
  end if;

  select * into v_inv from public.invitations where code = v_code for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at < now() then
    raise exception 'Code d''invitation invalide ou expiré';
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (v_inv.company_id, v_uid, v_inv.role)
  on conflict (company_id, user_id)
  do update set role = excluded.role, status = 'active', revoked_at = null;

  update public.invitations
  set status = 'accepted', accepted_by = v_uid, accepted_at = now()
  where id = v_inv.id;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (v_inv.company_id, v_uid, 'invitation_accepted', 'invitation', v_inv.id,
          jsonb_build_object('role', v_inv.role));

  return v_inv.company_id;
end;
$$;

-- ---------- CHANGER LE RÔLE D'UN MEMBRE (administrateur) ----------
create or replace function public.set_member_role(p_company uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
begin
  if v_uid is null then
    raise exception 'Utilisateur non connecté';
  end if;
  if not public.has_company_role(p_company, array['admin']) then
    raise exception 'Action réservée aux administrateurs';
  end if;
  if p_role is null or p_role not in ('admin', 'manager', 'seller', 'reader') then
    raise exception 'Rôle invalide';
  end if;

  -- Verrou sur l'entreprise : deux changements simultanés ne peuvent pas retirer tous les admins
  perform 1 from public.companies where id = p_company for update;

  select role into v_old
  from public.company_members
  where company_id = p_company and user_id = p_user and status = 'active';
  if not found then
    raise exception 'Membre introuvable';
  end if;

  if v_old = 'admin' and p_role <> 'admin' and (
    select count(*) from public.company_members
    where company_id = p_company and status = 'active' and role = 'admin'
  ) <= 1 then
    raise exception 'Impossible : ce membre est le dernier administrateur';
  end if;

  update public.company_members
  set role = p_role
  where company_id = p_company and user_id = p_user;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, v_uid, 'member_role_changed', 'member', p_user,
          jsonb_build_object('from', v_old, 'to', p_role));
end;
$$;

-- ---------- RÉVOQUER UN MEMBRE (administrateur) ----------
-- Le membre n'est pas supprimé : son statut passe à 'revoked' (historique conservé).
create or replace function public.revoke_member(p_company uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
begin
  if v_uid is null then
    raise exception 'Utilisateur non connecté';
  end if;
  if not public.has_company_role(p_company, array['admin']) then
    raise exception 'Action réservée aux administrateurs';
  end if;

  perform 1 from public.companies where id = p_company for update;

  select role into v_old
  from public.company_members
  where company_id = p_company and user_id = p_user and status = 'active';
  if not found then
    raise exception 'Membre introuvable';
  end if;

  if v_old = 'admin' and (
    select count(*) from public.company_members
    where company_id = p_company and status = 'active' and role = 'admin'
  ) <= 1 then
    raise exception 'Impossible : ce membre est le dernier administrateur';
  end if;

  update public.company_members
  set status = 'revoked', revoked_at = now()
  where company_id = p_company and user_id = p_user;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, v_uid, 'member_revoked', 'member', p_user,
          jsonb_build_object('role', v_old));
end;
$$;

-- ---------- CRÉER UNE ENTREPRISE : une seule par utilisateur ----------
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
  if exists (
    select 1 from public.company_members
    where user_id = v_uid and status = 'active'
  ) then
    raise exception 'Vous appartenez déjà à une entreprise';
  end if;

  insert into public.companies (name, created_by)
  values (btrim(p_name), v_uid)
  returning id into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company, v_uid, 'admin');

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id)
  values (v_company, v_uid, 'company_created', 'company', v_company);

  return v_company;
end;
$$;

-- ---------- DROITS D'EXÉCUTION ----------
revoke all on function public.create_invitation(uuid, text)         from public, anon;
revoke all on function public.cancel_invitation(uuid)               from public, anon;
revoke all on function public.accept_invitation(text)               from public, anon;
revoke all on function public.set_member_role(uuid, uuid, text)     from public, anon;
revoke all on function public.revoke_member(uuid, uuid)             from public, anon;
grant execute on function public.create_invitation(uuid, text)      to authenticated;
grant execute on function public.cancel_invitation(uuid)            to authenticated;
grant execute on function public.accept_invitation(text)            to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text)  to authenticated;
grant execute on function public.revoke_member(uuid, uuid)          to authenticated;
