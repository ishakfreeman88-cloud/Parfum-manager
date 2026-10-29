-- ============================================================
-- Phase 14a (1/4) : produits finis et mouvements de produits finis
-- ============================================================
alter table public.companies add column run_seq integer not null default 0;

create table public.product_variants (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id),
  perfume_id          uuid not null,
  format_id           uuid not null,
  name                text not null check (char_length(btrim(name)) between 2 and 160),
  bottle_material_id  uuid not null,
  cap_material_id     uuid,
  label_material_id   uuid,
  box_material_id     uuid,
  sale_price          numeric(14, 2) check (sale_price is null or sale_price >= 0),
  quantity_on_hand    integer not null default 0 check (quantity_on_hand >= 0),
  avg_cost            numeric(14, 4) not null default 0 check (avg_cost >= 0),
  status              text not null default 'active' check (status in ('active', 'archived')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, company_id),
  foreign key (perfume_id, company_id) references public.perfumes (id, company_id),
  foreign key (format_id, company_id)  references public.product_formats (id, company_id),
  foreign key (bottle_material_id, company_id) references public.raw_materials (id, company_id),
  foreign key (cap_material_id, company_id)    references public.raw_materials (id, company_id),
  foreign key (label_material_id, company_id)  references public.raw_materials (id, company_id),
  foreign key (box_material_id, company_id)    references public.raw_materials (id, company_id)
);
create unique index product_variants_combo_uq on public.product_variants (
  company_id, perfume_id, format_id, bottle_material_id,
  coalesce(cap_material_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(label_material_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(box_material_id,   '00000000-0000-0000-0000-000000000000'::uuid));
create index product_variants_company_idx on public.product_variants (company_id, perfume_id);

create table public.finished_movements (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id),
  variant_id       uuid not null,
  movement_type    text not null check (movement_type in
                     ('opening','packaging','sale','sale_return','adjustment','loss','sample')),
  quantity_delta   integer not null check (quantity_delta <> 0),
  unit_cost        numeric(14, 4) not null check (unit_cost >= 0),
  quantity_after   integer not null check (quantity_after >= 0),
  reason           text,
  notes            text,
  ref_type         text,
  ref_id           uuid,
  idempotency_key  text,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  foreign key (variant_id, company_id) references public.product_variants (id, company_id)
);
create index finished_movements_variant_idx
  on public.finished_movements (company_id, variant_id, created_at desc);
create unique index finished_movements_idem_uq
  on public.finished_movements (company_id, idempotency_key) where idempotency_key is not null;

create trigger finished_movements_immutable before update or delete on public.finished_movements
  for each row execute function public.prevent_row_change();
create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- Sécurité : la quantité et le coût ne se modifient jamais directement
alter table public.product_variants  enable row level security;
alter table public.finished_movements enable row level security;
revoke all on public.product_variants, public.finished_movements from anon, authenticated;
grant select on public.product_variants, public.finished_movements to authenticated;
grant update (name, sale_price, status) on public.product_variants to authenticated;

create policy variants_select on public.product_variants for select to authenticated
  using (public.is_company_member(company_id));
create policy variants_update on public.product_variants for update to authenticated
  using (public.has_company_role(company_id, array['admin','manager']))
  with check (public.has_company_role(company_id, array['admin','manager']));
create policy finished_movements_select on public.finished_movements for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager','reader']));

-- ============================================================
-- Phase 14a (2/4) : conditionnements et apply_finished_movement
-- ============================================================
create table public.packaging_runs (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id),
  run_no              integer not null,
  batch_id            uuid not null,
  variant_id          uuid not null,
  run_date            date not null,
  units_filled        integer not null check (units_filled > 0),
  volume_per_unit_ml  numeric(10, 3) not null check (volume_per_unit_ml > 0),
  extra_loss_ml       numeric(12, 3) not null default 0 check (extra_loss_ml >= 0),
  bulk_used_ml        numeric(12, 3) not null check (bulk_used_ml > 0),
  bulk_cost           numeric(14, 2) not null check (bulk_cost >= 0),
  components_cost     numeric(14, 2) not null default 0 check (components_cost >= 0),
  total_cost          numeric(14, 2) not null check (total_cost >= 0),
  cost_per_unit       numeric(14, 4) not null check (cost_per_unit >= 0),
  notes               text,
  idempotency_key     text not null,
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, run_no),
  unique (company_id, idempotency_key),
  foreign key (batch_id, company_id)   references public.production_batches (id, company_id),
  foreign key (variant_id, company_id) references public.product_variants (id, company_id)
);
create index packaging_runs_company_idx on public.packaging_runs (company_id, run_date desc);

create table public.packaging_consumptions (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id),
  run_id         uuid not null,
  line_no        integer not null,
  component      text not null check (component in ('bottle', 'cap', 'label', 'box')),
  material_id    uuid not null,
  quantity_base  numeric(14, 3) not null check (quantity_base > 0),
  unit_cost      numeric(14, 4) not null check (unit_cost >= 0),
  line_cost      numeric(14, 2) not null check (line_cost >= 0),
  movement_id    uuid references public.stock_movements (id),
  created_at     timestamptz not null default now(),
  unique (run_id, line_no),
  foreign key (run_id, company_id)      references public.packaging_runs (id, company_id),
  foreign key (material_id, company_id) references public.raw_materials (id, company_id)
);
create index packaging_consumptions_run_idx on public.packaging_consumptions (run_id);

create trigger packaging_runs_immutable before update or delete on public.packaging_runs
  for each row execute function public.prevent_row_change();
create trigger packaging_consumptions_immutable before update or delete on public.packaging_consumptions
  for each row execute function public.prevent_row_change();

alter table public.packaging_runs         enable row level security;
alter table public.packaging_consumptions enable row level security;
revoke all on public.packaging_runs, public.packaging_consumptions from anon, authenticated;
grant select on public.packaging_runs, public.packaging_consumptions to authenticated;
create policy packaging_runs_select on public.packaging_runs for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager']));
create policy packaging_consumptions_select on public.packaging_consumptions for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager']));

-- Mouvement de produits finis (usage interne : conditionnement maintenant, ventes plus tard)
create or replace function public.apply_finished_movement(
  p_company uuid, p_variant uuid, p_type text, p_delta integer, p_unit_cost numeric,
  p_reason text, p_notes text, p_key text, p_user uuid, p_ref_type text, p_ref_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_var      public.product_variants;
  v_existing uuid;
  v_new_qty  integer;
  v_new_avg  numeric;
  v_cost     numeric;
  v_id       uuid;
begin
  select * into v_var from public.product_variants
  where id = p_variant and company_id = p_company for update;
  if not found then
    raise exception 'Produit fini introuvable';
  end if;
  if p_key is not null then
    select id into v_existing from public.finished_movements
    where company_id = p_company and idempotency_key = p_key;
    if found then
      return v_existing;
    end if;
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'Quantité nulle';
  end if;
  v_new_qty := v_var.quantity_on_hand + p_delta;
  if v_new_qty < 0 then
    raise exception 'Stock de produits finis insuffisant : disponible %, demandé %',
      v_var.quantity_on_hand, abs(p_delta);
  end if;
  if p_delta > 0 then
    v_cost    := coalesce(p_unit_cost, v_var.avg_cost);
    v_new_avg := round((v_var.quantity_on_hand * v_var.avg_cost + p_delta * v_cost) / v_new_qty, 4);
  else
    v_cost    := v_var.avg_cost;
    v_new_avg := v_var.avg_cost;
  end if;
  insert into public.finished_movements
    (company_id, variant_id, movement_type, quantity_delta, unit_cost, quantity_after,
     reason, notes, ref_type, ref_id, idempotency_key, created_by)
  values
    (p_company, p_variant, p_type, p_delta, v_cost, v_new_qty,
     nullif(btrim(coalesce(p_reason, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''),
     p_ref_type, p_ref_id, p_key, p_user)
  returning id into v_id;
  update public.product_variants
  set quantity_on_hand = v_new_qty, avg_cost = v_new_avg where id = p_variant;
  return v_id;
end;
$$;
revoke all on function public.apply_finished_movement(uuid, uuid, text, integer, numeric, text, text, text, uuid, text, uuid)
  from public, anon, authenticated;

-- ============================================================
-- Phase 14a (3/4) : create_product_variant
-- ============================================================
create or replace function public.create_product_variant(
  p_company uuid, p_perfume uuid, p_format uuid,
  p_bottle uuid, p_cap uuid, p_label uuid, p_box uuid,
  p_name text, p_price numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_perfume text;
  v_format  text;
  v_name    text;
  v_id      uuid;
  v_ids     uuid[];
  v_mat     public.raw_materials;
  r         record;
begin
  if v_uid is null then
    raise exception 'Utilisateur non connecté';
  end if;
  if not public.has_company_role(p_company, array['admin', 'manager']) then
    raise exception 'Action réservée aux administrateurs et gestionnaires';
  end if;
  if p_bottle is null then
    raise exception 'Le flacon est obligatoire';
  end if;
  if p_price is not null and p_price < 0 then
    raise exception 'Prix de vente invalide';
  end if;

  select name into v_perfume from public.perfumes
  where id = p_perfume and company_id = p_company and status = 'active';
  if not found then
    raise exception 'Parfum introuvable ou archivé';
  end if;
  select name into v_format from public.product_formats
  where id = p_format and company_id = p_company and status = 'active';
  if not found then
    raise exception 'Format introuvable ou archivé';
  end if;

  v_ids := array_remove(array[p_bottle, p_cap, p_label, p_box], null);
  if (select count(distinct x) from unnest(v_ids) as x) <> cardinality(v_ids) then
    raise exception 'Un même article ne peut pas servir deux fois';
  end if;

  for r in
    select t.comp, t.mid
    from (values ('bottle', p_bottle), ('cap', p_cap), ('label', p_label), ('box', p_box)) as t(comp, mid)
    where t.mid is not null
  loop
    select * into v_mat from public.raw_materials
    where id = r.mid and company_id = p_company;
    if not found then
      raise exception 'Composant introuvable (%)', r.comp;
    end if;
    if v_mat.status <> 'active' then
      raise exception '% est archivé', v_mat.name;
    end if;
    if v_mat.material_type <> r.comp then
      raise exception '% n''est pas du type attendu (%)', v_mat.name, r.comp;
    end if;
    if v_mat.unit <> 'unit' then
      raise exception '% doit être suivi à l''unité', v_mat.name;
    end if;
  end loop;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    v_name := v_perfume || ' ' || v_format;
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 160 then
    raise exception 'Nom de produit invalide';
  end if;

  begin
    insert into public.product_variants
      (company_id, perfume_id, format_id, name, bottle_material_id, cap_material_id,
       label_material_id, box_material_id, sale_price)
    values
      (p_company, p_perfume, p_format, v_name, p_bottle, p_cap, p_label, p_box, round(p_price, 2))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ce produit existe déjà';
  end;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, v_uid, 'product_variant_created', 'product_variant', v_id,
          jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

revoke all on function public.create_product_variant(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, numeric)
  from public, anon;
grant execute on function public.create_product_variant(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, numeric)
  to authenticated;

-- ============================================================
-- Phase 14a (4/4) : create_packaging_run
-- ============================================================
create or replace function public.create_packaging_run(
  p_company uuid, p_batch uuid, p_variant uuid, p_units integer,
  p_extra_loss_ml numeric, p_date date, p_notes text, p_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_existing  uuid;
  v_batch     public.production_batches;
  v_var       public.product_variants;
  v_mat       public.raw_materials;
  v_vol       numeric;
  v_loss      numeric := round(coalesce(p_extra_loss_ml, 0), 3);
  v_bulk      numeric;
  v_bulk_cost numeric;
  v_comp_cost numeric := 0;
  v_total     numeric;
  v_unit_cost numeric;
  v_no        integer;
  v_id        uuid;
  v_line      integer := 0;
  v_mv        uuid;
  v_cost      numeric;
  r           record;
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
  if p_units is null or p_units < 1 or p_units > 100000 then
    raise exception 'Le nombre de flacons doit être compris entre 1 et 100 000';
  end if;
  if v_loss < 0 or v_loss > 1000000 then
    raise exception 'Perte au remplissage invalide';
  end if;

  perform 1 from public.companies where id = p_company for update;
  select id into v_existing from public.packaging_runs
  where company_id = p_company and idempotency_key = p_key;
  if found then
    return v_existing;
  end if;

  select * into v_batch from public.production_batches
  where id = p_batch and company_id = p_company for update;
  if not found then
    raise exception 'Lot de fabrication introuvable';
  end if;
  select * into v_var from public.product_variants
  where id = p_variant and company_id = p_company for update;
  if not found then
    raise exception 'Produit fini introuvable';
  end if;
  if v_var.status <> 'active' then
    raise exception 'Ce produit est archivé';
  end if;
  if v_var.perfume_id <> v_batch.perfume_id then
    raise exception 'Ce produit n''est pas du même parfum que le lot';
  end if;
  select volume_ml into v_vol from public.product_formats
  where id = v_var.format_id and company_id = p_company;
  if not found then
    raise exception 'Format introuvable';
  end if;

  v_bulk := round(p_units * v_vol + v_loss, 3);
  if v_batch.bulk_remaining_ml < v_bulk then
    raise exception 'Vrac insuffisant dans ce lot : disponible % ml, nécessaire % ml',
      v_batch.bulk_remaining_ml, v_bulk;
  end if;

  -- Passe 1 : verrouille et vérifie chaque composant, calcule leur coût
  for r in
    select t.comp, t.mid
    from (values ('bottle', v_var.bottle_material_id), ('cap', v_var.cap_material_id),
                 ('label', v_var.label_material_id), ('box', v_var.box_material_id)) as t(comp, mid)
    where t.mid is not null
    order by t.mid
  loop
    select * into v_mat from public.raw_materials
    where id = r.mid and company_id = p_company for update;
    if v_mat.status <> 'active' then
      raise exception '% est archivé : restaurez-le avant de conditionner', v_mat.name;
    end if;
    if v_mat.quantity_on_hand < p_units then
      raise exception 'Stock insuffisant pour % : disponible % %, nécessaire % %',
        v_mat.name, v_mat.quantity_on_hand, v_mat.unit, p_units, v_mat.unit;
    end if;
    v_comp_cost := v_comp_cost + round(p_units * v_mat.avg_cost, 2);
  end loop;

  v_bulk_cost := round(v_bulk * v_batch.total_cost / v_batch.actual_volume_ml, 2);
  v_total     := v_bulk_cost + v_comp_cost;
  v_unit_cost := round(v_total / p_units, 4);

  update public.companies set run_seq = run_seq + 1
  where id = p_company returning run_seq into v_no;

  insert into public.packaging_runs
    (company_id, run_no, batch_id, variant_id, run_date, units_filled, volume_per_unit_ml,
     extra_loss_ml, bulk_used_ml, bulk_cost, components_cost, total_cost, cost_per_unit,
     notes, idempotency_key, created_by)
  values
    (p_company, v_no, p_batch, p_variant, p_date, p_units, v_vol,
     v_loss, v_bulk, v_bulk_cost, v_comp_cost, v_total, v_unit_cost,
     nullif(btrim(coalesce(p_notes, '')), ''), p_key, v_uid)
  returning id into v_id;

  update public.production_batches
  set bulk_remaining_ml = bulk_remaining_ml - v_bulk where id = p_batch;

  -- Passe 2 : consommation des composants
  for r in
    select t.comp, t.mid
    from (values ('bottle', v_var.bottle_material_id), ('cap', v_var.cap_material_id),
                 ('label', v_var.label_material_id), ('box', v_var.box_material_id)) as t(comp, mid)
    where t.mid is not null
    order by t.mid
  loop
    v_line := v_line + 1;
    v_mv := public.apply_stock_movement(
      p_company, r.mid, 'production_use', -p_units, null,
      'Conditionnement n° ' || v_no, null,
      'pack:' || p_key || ':' || r.comp, v_uid, 'packaging', v_id);
    select unit_cost into v_cost from public.stock_movements where id = v_mv;
    insert into public.packaging_consumptions
      (company_id, run_id, line_no, component, material_id, quantity_base, unit_cost, line_cost, movement_id)
    values
      (p_company, v_id, v_line, r.comp, r.mid, p_units, v_cost, round(p_units * v_cost, 2), v_mv);
  end loop;

  perform public.apply_finished_movement(
    p_company, p_variant, 'packaging', p_units, v_unit_cost,
    'Conditionnement n° ' || v_no, null, 'pack:' || p_key, v_uid, 'packaging', v_id);

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, v_uid, 'packaging_run_created', 'packaging_run', v_id,
          jsonb_build_object('run_no', v_no, 'units', p_units, 'cost', v_total));
  return v_id;
end;
$$;

revoke all on function public.create_packaging_run(uuid, uuid, uuid, integer, numeric, date, text, text)
  from public, anon;
grant execute on function public.create_packaging_run(uuid, uuid, uuid, integer, numeric, date, text, text)
  to authenticated;
