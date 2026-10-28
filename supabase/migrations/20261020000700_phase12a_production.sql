-- ============================================================
-- Phase 12a (1/2) : lots de fabrication et consommations
-- ============================================================
alter table public.companies add column batch_seq integer not null default 0;

create table public.production_batches (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies (id),
  batch_no              integer not null,
  recipe_id             uuid not null,
  version_id            uuid not null,
  perfume_id            uuid not null,
  produced_date         date not null,
  planned_volume_ml     numeric(12, 3) not null check (planned_volume_ml > 0),
  theoretical_yield_ml  numeric(12, 3) not null check (theoretical_yield_ml > 0),
  actual_volume_ml      numeric(12, 3) not null check (actual_volume_ml > 0),
  volume_variance_ml    numeric(12, 3) generated always as (actual_volume_ml - theoretical_yield_ml) stored,
  bulk_remaining_ml     numeric(12, 3) not null check (bulk_remaining_ml >= 0),
  total_cost            numeric(14, 2) not null default 0 check (total_cost >= 0),
  cost_per_ml           numeric(14, 4) not null default 0 check (cost_per_ml >= 0),
  notes                 text,
  idempotency_key       text not null,
  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, batch_no),
  unique (company_id, idempotency_key),
  check (bulk_remaining_ml <= actual_volume_ml),
  foreign key (recipe_id, company_id)  references public.recipes (id, company_id),
  foreign key (version_id, company_id) references public.recipe_versions (id, company_id),
  foreign key (perfume_id, company_id) references public.perfumes (id, company_id)
);
create index production_batches_company_idx
  on public.production_batches (company_id, produced_date desc);

create table public.production_consumptions (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id),
  batch_id          uuid not null,
  line_no           integer not null,
  material_id       uuid not null,
  planned_qty_base  numeric(14, 3) not null check (planned_qty_base > 0),
  actual_qty_base   numeric(14, 3) not null check (actual_qty_base > 0),
  unit_cost         numeric(14, 4) not null check (unit_cost >= 0),
  line_cost         numeric(14, 2) not null check (line_cost >= 0),
  movement_id       uuid references public.stock_movements (id),
  created_at        timestamptz not null default now(),
  unique (batch_id, line_no),
  unique (batch_id, material_id),
  foreign key (batch_id, company_id)    references public.production_batches (id, company_id),
  foreign key (material_id, company_id) references public.raw_materials (id, company_id)
);
create index production_consumptions_batch_idx on public.production_consumptions (batch_id);
create index production_consumptions_material_idx
  on public.production_consumptions (company_id, material_id);

-- Consommations : jamais modifiées ni supprimées
create trigger production_consumptions_immutable
  before update or delete on public.production_consumptions
  for each row execute function public.prevent_row_change();

-- Sécurité : lecture seule pour l'application, écritures par la fonction uniquement
alter table public.production_batches      enable row level security;
alter table public.production_consumptions enable row level security;
revoke all on public.production_batches, public.production_consumptions from anon, authenticated;
grant select on public.production_batches, public.production_consumptions to authenticated;

create policy production_batches_select on public.production_batches
  for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager']));
create policy production_consumptions_select on public.production_consumptions
  for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager']));

-- ============================================================
-- Phase 12a (2/2) : create_production_batch
-- ============================================================
create or replace function public.create_production_batch(
  p_company    uuid,
  p_version    uuid,
  p_planned_ml numeric,
  p_actual_ml  numeric,
  p_date       date,
  p_notes      text,
  p_key        text,
  p_overrides  jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing uuid;
  v_ver      public.recipe_versions;
  v_recipe   public.recipes;
  v_mat      public.raw_materials;
  v_planned  numeric := round(coalesce(p_planned_ml, 0), 3);
  v_actual   numeric := round(coalesce(p_actual_ml, 0), 3);
  v_factor   numeric;
  v_theory   numeric;
  v_no       integer;
  v_id       uuid;
  v_unit     text;
  v_pq       numeric;
  v_aq       numeric;
  v_ov       numeric;
  v_mv       uuid;
  v_cost     numeric;
  v_line     numeric;
  v_total    numeric := 0;
  r          record;
begin
  if v_uid is null then
    raise exception 'Utilisateur non connecté';
  end if;
  if not public.has_company_role(p_company, array['admin', 'manager']) then
    raise exception 'Action réservée aux administrateurs et gestionnaires';
  end if;
  if p_key is null or btrim(p_key) = '' then
    raise exception 'Clé de protection manquante';
  end if;
  if p_date is null then
    raise exception 'Date invalide';
  end if;
  if v_planned <= 0 or v_planned > 1000000 then
    raise exception 'Le volume à fabriquer doit être compris entre 0 et 1 000 000 ml';
  end if;
  if v_actual <= 0 or v_actual > 1000000 then
    raise exception 'Le volume obtenu doit être compris entre 0 et 1 000 000 ml';
  end if;
  if p_overrides is not null
     and (jsonb_typeof(p_overrides) <> 'array' or jsonb_array_length(p_overrides) > 50) then
    raise exception 'Quantités réelles invalides';
  end if;

  -- Verrou de l'entreprise : sérialise les fabrications et bloque les doubles envois
  perform 1 from public.companies where id = p_company for update;
  select id into v_existing from public.production_batches
  where company_id = p_company and idempotency_key = p_key;
  if found then
    return v_existing;
  end if;

  select * into v_ver from public.recipe_versions
  where id = p_version and company_id = p_company;
  if not found then
    raise exception 'Version de recette introuvable';
  end if;
  select * into v_recipe from public.recipes
  where id = v_ver.recipe_id and company_id = p_company and status = 'active';
  if not found then
    raise exception 'Recette archivée ou introuvable';
  end if;
  if not exists (select 1 from public.perfumes
                 where id = v_recipe.perfume_id and company_id = p_company and status = 'active') then
    raise exception 'Le parfum de cette recette est archivé';
  end if;

  v_factor := v_planned / v_ver.target_volume_ml;
  v_theory := round(v_ver.expected_yield_ml * v_factor, 3);
  if v_theory <= 0 then
    raise exception 'Rendement théorique nul pour ce volume';
  end if;

  -- Validation des quantités réelles saisies
  if p_overrides is not null then
    for r in
      select (e.item ->> 'material_id')::uuid as material_id,
             (e.item ->> 'quantity')::numeric  as qty,
             e.item ->> 'unit'                 as unit,
             e.idx
      from jsonb_array_elements(p_overrides) with ordinality as e(item, idx)
    loop
      if not exists (select 1 from public.recipe_ingredients
                     where version_id = p_version and material_id = r.material_id) then
        raise exception 'Ligne % : cette matière ne fait pas partie de la recette', r.idx;
      end if;
      if r.qty is null or r.qty <= 0 then
        raise exception 'Ligne % : quantité invalide', r.idx;
      end if;
      select unit into v_unit from public.raw_materials
      where id = r.material_id and company_id = p_company;
      perform public.convert_quantity(r.qty, r.unit, v_unit);
    end loop;
    if (select count(distinct e.item ->> 'material_id')
        from jsonb_array_elements(p_overrides) as e(item)) <> jsonb_array_length(p_overrides) then
      raise exception 'Une matière apparaît deux fois dans les quantités réelles';
    end if;
  end if;

  update public.companies set batch_seq = batch_seq + 1
  where id = p_company returning batch_seq into v_no;

  insert into public.production_batches
    (company_id, batch_no, recipe_id, version_id, perfume_id, produced_date, planned_volume_ml,
     theoretical_yield_ml, actual_volume_ml, bulk_remaining_ml, notes, idempotency_key, created_by)
  values
    (p_company, v_no, v_recipe.id, v_ver.id, v_recipe.perfume_id, p_date, v_planned,
     v_theory, v_actual, v_actual, nullif(btrim(coalesce(p_notes, '')), ''), p_key, v_uid)
  returning id into v_id;

  -- Consommation des matières, dans l'ordre des identifiants (évite les blocages croisés)
  for r in
    select i.line_no, i.material_id, i.quantity_base
    from public.recipe_ingredients i
    where i.version_id = p_version and i.company_id = p_company
    order by i.material_id
  loop
    select * into v_mat from public.raw_materials
    where id = r.material_id and company_id = p_company for update;
    if v_mat.status <> 'active' then
      raise exception '% est archivée : restaurez-la avant de fabriquer', v_mat.name;
    end if;

    v_pq := round(r.quantity_base * v_factor, 3);
    if v_pq <= 0 then
      raise exception '% : quantité prévue trop petite pour ce volume', v_mat.name;
    end if;

    v_aq := v_pq;
    if p_overrides is not null then
      select round(public.convert_quantity((e.item ->> 'quantity')::numeric, e.item ->> 'unit', v_mat.unit), 3)
      into v_ov
      from jsonb_array_elements(p_overrides) as e(item)
      where (e.item ->> 'material_id')::uuid = r.material_id;
      if found then
        v_aq := v_ov;
      end if;
    end if;
    if v_aq <= 0 then
      raise exception '% : quantité réelle trop petite', v_mat.name;
    end if;

    if v_mat.quantity_on_hand < v_aq then
      raise exception 'Stock insuffisant pour % : disponible % %, nécessaire % %',
        v_mat.name, v_mat.quantity_on_hand, v_mat.unit, v_aq, v_mat.unit;
    end if;

    v_mv := public.apply_stock_movement(
      p_company, r.material_id, 'production_use', -v_aq, null,
      'Fabrication lot n° ' || v_no, null,
      'prod:' || p_key || ':' || r.line_no, v_uid, 'production', v_id);

    select unit_cost into v_cost from public.stock_movements where id = v_mv;
    v_line  := round(v_aq * v_cost, 2);
    v_total := v_total + v_line;

    insert into public.production_consumptions
      (company_id, batch_id, line_no, material_id, planned_qty_base, actual_qty_base,
       unit_cost, line_cost, movement_id)
    values
      (p_company, v_id, r.line_no, r.material_id, v_pq, v_aq, v_cost, v_line, v_mv);
  end loop;

  update public.production_batches
  set total_cost = v_total, cost_per_ml = round(v_total / v_actual, 4)
  where id = v_id;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, v_uid, 'production_batch_created', 'production_batch', v_id,
          jsonb_build_object('batch_no', v_no, 'actual_ml', v_actual, 'cost', v_total));

  return v_id;
end;
$$;

revoke all on function public.create_production_batch(uuid, uuid, numeric, numeric, date, text, text, jsonb)
  from public, anon;
grant execute on function public.create_production_batch(uuid, uuid, numeric, numeric, date, text, text, jsonb)
  to authenticated;
