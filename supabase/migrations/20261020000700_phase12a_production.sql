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
