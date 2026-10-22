-- ============================================================
-- Phase 6 : unités, fournisseurs, matières premières, mouvements de stock
-- ============================================================

-- ---------- UNITÉS ET CONVERSIONS ----------
-- Chaque unité est rattachée à une unité de base (ml, g ou unit).
-- cl est volontairement absent, pour ne jamais confondre ml et cl.
create table public.units (
  code       text primary key,
  label      text not null,
  base_unit  text not null check (base_unit in ('ml', 'g', 'unit')),
  factor     numeric(14, 6) not null check (factor > 0)
);
insert into public.units (code, label, base_unit, factor) values
  ('ml',   'Millilitre',  'ml',   1),
  ('l',    'Litre',       'ml',   1000),
  ('g',    'Gramme',      'g',    1),
  ('kg',   'Kilogramme',  'g',    1000),
  ('unit', 'Unité',       'unit', 1);

alter table public.units enable row level security;
revoke all on public.units from anon, authenticated;
grant select on public.units to authenticated;
create policy units_select on public.units for select to authenticated using (true);

-- Conversion : refuse volume <-> masse (aucune densité n'est définie).
create or replace function public.convert_quantity(p_qty numeric, p_from text, p_to text)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  v_from public.units;
  v_to   public.units;
begin
  select * into v_from from public.units where code = p_from;
  if not found then raise exception 'Unité inconnue : %', p_from; end if;
  select * into v_to from public.units where code = p_to;
  if not found then raise exception 'Unité inconnue : %', p_to; end if;
  if v_from.base_unit <> v_to.base_unit then
    raise exception 'Conversion impossible entre % et % (aucune densité définie)', p_from, p_to;
  end if;
  return p_qty * v_from.factor / v_to.factor;
end;
$$;

-- ---------- FOURNISSEURS ----------
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  phone       text,
  address     text,
  notes       text,
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, company_id)
);
create index suppliers_company_idx on public.suppliers (company_id);

-- ---------- MATIÈRES PREMIÈRES ----------
-- quantity_on_hand et avg_cost sont exprimés dans l'unité de base de la matière (unit).
-- Ils ne changent QUE par un mouvement de stock.
create table public.raw_materials (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id),
  name              text not null check (char_length(btrim(name)) between 2 and 120),
  reference         text,
  material_type     text not null check (material_type in
                      ('extract','alcohol','fixative','bottle','cap','label','box','consumable','other')),
  unit              text not null check (unit in ('ml', 'g', 'unit')),
  description       text,
  supplier_id       uuid,
  min_stock         numeric(14, 3) not null default 0 check (min_stock >= 0),
  quantity_on_hand  numeric(14, 3) not null default 0 check (quantity_on_hand >= 0),
  avg_cost          numeric(14, 4) not null default 0 check (avg_cost >= 0),
  notes             text,
  status            text not null default 'active' check (status in ('active', 'archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, company_id),
  -- Le fournisseur doit appartenir à la même entreprise
  foreign key (supplier_id, company_id) references public.suppliers (id, company_id)
);
create index raw_materials_company_idx on public.raw_materials (company_id);
create unique index raw_materials_reference_uq
  on public.raw_materials (company_id, lower(reference)) where reference is not null;

-- ---------- MOUVEMENTS DE STOCK (journal sans modification) ----------
create table public.stock_movements (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id),
  material_id      uuid not null,
  movement_type    text not null check (movement_type in
                     ('opening','purchase','production_use','adjustment','loss','supplier_return')),
  quantity_delta   numeric(14, 3) not null check (quantity_delta <> 0),
  unit_cost        numeric(14, 4) not null check (unit_cost >= 0),
  quantity_after   numeric(14, 3) not null check (quantity_after >= 0),
  reason           text,
  notes            text,
  ref_type         text,
  ref_id           uuid,
  idempotency_key  text,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  foreign key (material_id, company_id) references public.raw_materials (id, company_id)
);
create index stock_movements_material_idx
  on public.stock_movements (company_id, material_id, created_at desc);
-- Protection contre les doublons : une même clé ne peut servir qu'une fois par entreprise
create unique index stock_movements_idem_uq
  on public.stock_movements (company_id, idempotency_key) where idempotency_key is not null;

create or replace function public.prevent_stock_movement_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Les mouvements de stock ne peuvent être ni modifiés ni supprimés : créez un mouvement de correction';
end;
$$;
create trigger stock_movements_immutable
  before update or delete on public.stock_movements
  for each row execute function public.prevent_stock_movement_change();

create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
create trigger raw_materials_updated_at before update on public.raw_materials
  for each row execute function public.set_updated_at();

-- ---------- SÉCURITÉ : droits et politiques ----------
alter table public.suppliers       enable row level security;
alter table public.raw_materials   enable row level security;
alter table public.stock_movements enable row level security;

revoke all on public.suppliers, public.raw_materials, public.stock_movements
  from anon, authenticated;

grant select on public.suppliers, public.raw_materials, public.stock_movements to authenticated;

-- Colonnes modifiables directement (pas de quantité, de coût, d'unité ni d'entreprise)
grant insert (company_id, name, phone, address, notes) on public.suppliers to authenticated;
grant update (name, phone, address, notes, status)     on public.suppliers to authenticated;
grant insert (company_id, name, reference, material_type, unit, description,
              supplier_id, min_stock, notes) on public.raw_materials to authenticated;
grant update (name, reference, material_type, description,
              supplier_id, min_stock, notes, status) on public.raw_materials to authenticated;
-- stock_movements : aucune écriture directe, tout passe par les fonctions

create policy suppliers_select on public.suppliers for select to authenticated
  using (public.is_company_member(company_id));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (public.has_company_role(company_id, array['admin','manager']));
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.has_company_role(company_id, array['admin','manager']))
  with check (public.has_company_role(company_id, array['admin','manager']));

create policy materials_select on public.raw_materials for select to authenticated
  using (public.is_company_member(company_id));
create policy materials_insert on public.raw_materials for insert to authenticated
  with check (public.has_company_role(company_id, array['admin','manager']));
create policy materials_update on public.raw_materials for update to authenticated
  using (public.has_company_role(company_id, array['admin','manager']))
  with check (public.has_company_role(company_id, array['admin','manager']));

create policy movements_select on public.stock_movements for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager','reader']));

-- ---------- NOYAU : appliquer un mouvement (usage interne, non appelable par l'application) ----------
-- Verrouille la matière, empêche le stock négatif et les doublons, recalcule le coût moyen pondéré.
create or replace function public.apply_stock_movement(
  p_company        uuid,
  p_material       uuid,
  p_type           text,
  p_delta_base     numeric,
  p_unit_cost_base numeric,
  p_reason         text,
  p_notes          text,
  p_key            text,
  p_user           uuid,
  p_ref_type       text,
  p_ref_id         uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mat      public.raw_materials;
  v_existing uuid;
  v_new_qty  numeric;
  v_new_avg  numeric;
  v_cost     numeric;
  v_id       uuid;
begin
  select * into v_mat
  from public.raw_materials
  where id = p_material and company_id = p_company
  for update;
  if not found then
    raise exception 'Matière introuvable';
  end if;

  -- Double envoi : on renvoie le mouvement déjà enregistré, sans rien refaire
  if p_key is not null then
    select id into v_existing
    from public.stock_movements
    where company_id = p_company and idempotency_key = p_key;
    if found then
      return v_existing;
    end if;
  end if;

  p_delta_base := round(p_delta_base, 3);
  if p_delta_base = 0 then
    raise exception 'Quantité nulle après arrondi';
  end if;

  v_new_qty := v_mat.quantity_on_hand + p_delta_base;
  if v_new_qty < 0 then
