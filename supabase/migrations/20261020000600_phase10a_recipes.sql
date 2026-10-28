-- ============================================================
-- Phase 10a (1/3) : parfums et formats
-- ============================================================
create table public.perfumes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  reference   text,
  description text,
  notes       text,
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, company_id)
);
create unique index perfumes_name_uq on public.perfumes (company_id, lower(btrim(name)));
create unique index perfumes_reference_uq
  on public.perfumes (company_id, lower(reference)) where reference is not null;

-- Le volume est TOUJOURS en millilitres (jamais en cl)
create table public.product_formats (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  volume_ml   numeric(10, 3) not null check (volume_ml > 0 and volume_ml <= 100000),
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, volume_ml)
);

create trigger perfumes_updated_at before update on public.perfumes
  for each row execute function public.set_updated_at();
create trigger product_formats_updated_at before update on public.product_formats
  for each row execute function public.set_updated_at();

alter table public.perfumes        enable row level security;
alter table public.product_formats enable row level security;
revoke all on public.perfumes, public.product_formats from anon, authenticated;
grant select on public.perfumes, public.product_formats to authenticated;
grant insert (company_id, name, reference, description, notes) on public.perfumes to authenticated;
grant update (name, reference, description, notes, status)     on public.perfumes to authenticated;
grant insert (company_id, name, volume_ml) on public.product_formats to authenticated;
grant update (name, status)                on public.product_formats to authenticated;

create policy perfumes_select on public.perfumes for select to authenticated
  using (public.is_company_member(company_id));
create policy perfumes_insert on public.perfumes for insert to authenticated
  with check (public.has_company_role(company_id, array['admin','manager']));
create policy perfumes_update on public.perfumes for update to authenticated
  using (public.has_company_role(company_id, array['admin','manager']))
  with check (public.has_company_role(company_id, array['admin','manager']));

create policy formats_select on public.product_formats for select to authenticated
  using (public.is_company_member(company_id));
create policy formats_insert on public.product_formats for insert to authenticated
  with check (public.has_company_role(company_id, array['admin','manager']));
create policy formats_update on public.product_formats for update to authenticated
  using (public.has_company_role(company_id, array['admin','manager']))
  with check (public.has_company_role(company_id, array['admin','manager']));

-- ============================================================
-- Phase 10a (2/3) : recettes, versions, ingrédients
-- ============================================================
create table public.recipes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id),
  perfume_id  uuid not null,
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, company_id),
  foreign key (perfume_id, company_id) references public.perfumes (id, company_id)
);
create index recipes_perfume_idx on public.recipes (company_id, perfume_id);

create table public.recipe_versions (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id),
  recipe_id          uuid not null,
  version_no         integer not null check (version_no > 0),
  target_volume_ml   numeric(12, 3) not null check (target_volume_ml > 0),
  expected_yield_ml  numeric(12, 3) not null check (expected_yield_ml > 0),
  instructions       text,
  notes              text,
  effective_date     date not null,
  idempotency_key    text not null,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  unique (id, company_id),
  unique (recipe_id, version_no),
  unique (company_id, idempotency_key),
  foreign key (recipe_id, company_id) references public.recipes (id, company_id)
);

-- Quantités exprimées pour le volume cible de la version, dans l'unité de BASE de la matière
create table public.recipe_ingredients (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id),
  version_id      uuid not null,
  line_no         integer not null,
  material_id     uuid not null,
  quantity_input  numeric(14, 3) not null check (quantity_input > 0),
  unit_input      text not null,
  quantity_base   numeric(14, 3) not null check (quantity_base > 0),
  created_at      timestamptz not null default now(),
  unique (version_id, line_no),
  unique (version_id, material_id),
  foreign key (version_id, company_id) references public.recipe_versions (id, company_id),
  foreign key (material_id, company_id) references public.raw_materials (id, company_id)
);
create index recipe_ingredients_material_idx on public.recipe_ingredients (company_id, material_id);

-- Versions et ingrédients : jamais modifiés ni supprimés (verrou créé en phase 8a)
create trigger recipe_versions_immutable before update or delete on public.recipe_versions
  for each row execute function public.prevent_row_change();
create trigger recipe_ingredients_immutable before update or delete on public.recipe_ingredients
  for each row execute function public.prevent_row_change();
create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

alter table public.recipes            enable row level security;
alter table public.recipe_versions    enable row level security;
alter table public.recipe_ingredients enable row level security;
revoke all on public.recipes, public.recipe_versions, public.recipe_ingredients
  from anon, authenticated;
grant select on public.recipes, public.recipe_versions, public.recipe_ingredients to authenticated;
grant update (name, status) on public.recipes to authenticated;

create policy recipes_select on public.recipes for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager']));
create policy recipes_update on public.recipes for update to authenticated
  using (public.has_company_role(company_id, array['admin','manager']))
  with check (public.has_company_role(company_id, array['admin','manager']));
create policy recipe_versions_select on public.recipe_versions for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager']));
create policy recipe_ingredients_select on public.recipe_ingredients for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager']));

-- ============================================================
-- Phase 10a (3/3) : create_recipe_version
-- ============================================================
create or replace function public.create_recipe_version(
  p_company      uuid,
  p_perfume      uuid,
  p_recipe       uuid,
  p_name         text,
  p_target_ml    numeric,
  p_yield_ml     numeric,
  p_instructions text,
  p_notes        text,
  p_effective    date,
  p_key          text,
  p_items        jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing uuid;
  v_recipe   uuid;
  v_ver      uuid;
  v_no       integer;
  v_target   numeric := round(coalesce(p_target_ml, 0), 3);
  v_yield    numeric := round(coalesce(p_yield_ml, 0), 3);
  r          record;
  v_unit     text;
  v_type     text;
  v_qbase    numeric;
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
  if v_target <= 0 then
    raise exception 'Le volume cible doit être supérieur à zéro';
  end if;
  if v_yield <= 0 then
    raise exception 'Le rendement théorique doit être supérieur à zéro';
  end if;
  if p_effective is null then
    raise exception 'Date d''entrée en vigueur invalide';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Une recette contient entre 1 et 50 ingrédients';
  end if;

  perform 1 from public.companies where id = p_company for update;

  select id into v_existing from public.recipe_versions
  where company_id = p_company and idempotency_key = p_key;
  if found then
    return v_existing;
  end if;

  -- Passe 1 : validation de chaque ligne
  for r in
    select (e.item ->> 'material_id')::uuid as material_id,
           (e.item ->> 'quantity')::numeric  as qty,
           e.item ->> 'unit'                 as unit,
           e.idx
    from jsonb_array_elements(p_items) with ordinality as e(item, idx)
  loop
    if r.qty is null or r.qty <= 0 then
      raise exception 'Ligne % : quantité invalide', r.idx;
    end if;
    select unit, material_type into v_unit, v_type
    from public.raw_materials
    where id = r.material_id and company_id = p_company and status = 'active';
    if not found then
      raise exception 'Ligne % : matière introuvable ou archivée', r.idx;
    end if;
    if v_type in ('bottle', 'cap', 'label', 'box') then
      raise exception 'Ligne % : les flacons, bouchons, étiquettes et boîtes se gèrent au conditionnement, pas dans la recette', r.idx;
    end if;
    if round(public.convert_quantity(r.qty, r.unit, v_unit), 3) <= 0 then
      raise exception 'Ligne % : quantité trop petite', r.idx;
    end if;
  end loop;

  if (select count(distinct e.item ->> 'material_id')
      from jsonb_array_elements(p_items) as e(item)) <> jsonb_array_length(p_items) then
    raise exception 'Une matière apparaît deux fois dans la recette';
  end if;

  -- Nouvelle recette ou nouvelle version d'une recette existante
  if p_recipe is null then
    if char_length(btrim(coalesce(p_name, ''))) < 2 then
      raise exception 'Nom de recette invalide';
    end if;
    if not exists (select 1 from public.perfumes
                   where id = p_perfume and company_id = p_company and status = 'active') then
      raise exception 'Parfum introuvable ou archivé';
    end if;
    insert into public.recipes (company_id, perfume_id, name, created_by)
    values (p_company, p_perfume, btrim(p_name), v_uid)
    returning id into v_recipe;
    v_no := 1;
  else
    select id into v_recipe from public.recipes
    where id = p_recipe and company_id = p_company and status = 'active';
    if not found then
      raise exception 'Recette introuvable ou archivée';
    end if;
    select coalesce(max(version_no), 0) + 1 into v_no
    from public.recipe_versions where recipe_id = v_recipe;
  end if;

  insert into public.recipe_versions
    (company_id, recipe_id, version_no, target_volume_ml, expected_yield_ml,
     instructions, notes, effective_date, idempotency_key, created_by)
  values
    (p_company, v_recipe, v_no, v_target, v_yield,
     nullif(btrim(coalesce(p_instructions, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''),
     p_effective, p_key, v_uid)
  returning id into v_ver;

  -- Passe 2 : ingrédients
  for r in
    select (e.item ->> 'material_id')::uuid as material_id,
           (e.item ->> 'quantity')::numeric  as qty,
           e.item ->> 'unit'                 as unit,
           e.idx
    from jsonb_array_elements(p_items) with ordinality as e(item, idx)
  loop
    select unit into v_unit from public.raw_materials
    where id = r.material_id and company_id = p_company;
    v_qbase := round(public.convert_quantity(r.qty, r.unit, v_unit), 3);
    insert into public.recipe_ingredients
      (company_id, version_id, line_no, material_id, quantity_input, unit_input, quantity_base)
    values (p_company, v_ver, r.idx, r.material_id, r.qty, r.unit, v_qbase);
  end loop;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, v_uid, 'recipe_version_created', 'recipe', v_recipe,
          jsonb_build_object('version', v_no));

  return v_ver;
end;
$$;

revoke all on function public.create_recipe_version(uuid, uuid, uuid, text, numeric, numeric, text, text, date, text, jsonb)
  from public, anon;
grant execute on function public.create_recipe_version(uuid, uuid, uuid, text, numeric, numeric, text, text, date, text, jsonb)
  to authenticated;
