-- ============================================================
-- Phase 8a (1/3) : achats, lignes d'achat, paiements fournisseur
-- ============================================================

-- Compteur de numéros d'achat par entreprise (non modifiable directement)
alter table public.companies add column purchase_seq integer not null default 0;

create table public.purchases (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id),
  purchase_no      integer not null,
  supplier_id      uuid,
  purchase_date    date not null,
  invoice_ref      text,
  subtotal         numeric(14, 2) not null check (subtotal > 0),
  discount         numeric(14, 2) not null default 0 check (discount >= 0),
  extra_fees       numeric(14, 2) not null default 0 check (extra_fees >= 0),
  total            numeric(14, 2) not null check (total >= 0),
  amount_paid      numeric(14, 2) not null default 0 check (amount_paid >= 0),
  amount_due       numeric(14, 2) generated always as (total - amount_paid) stored,
  payment_status   text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid')),
  status           text not null default 'received' check (status in ('received','cancelled')),
  cancel_reason    text,
  cancelled_at     timestamptz,
  notes            text,
  idempotency_key  text not null,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, purchase_no),
  unique (company_id, idempotency_key),
  check (total = subtotal - discount + extra_fees),
  check (amount_paid <= total),
  foreign key (supplier_id, company_id) references public.suppliers (id, company_id)
);
create index purchases_company_idx on public.purchases (company_id, purchase_date desc);

create table public.purchase_items (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id),
  purchase_id       uuid not null,
  line_no           integer not null,
  material_id       uuid not null,
  quantity_input    numeric(14, 3) not null check (quantity_input > 0),
  unit_input        text not null,
  quantity_base     numeric(14, 3) not null check (quantity_base > 0),
  unit_price_input  numeric(14, 4) not null check (unit_price_input >= 0),
  line_total        numeric(14, 2) not null check (line_total >= 0),
  landed_total      numeric(14, 2) not null check (landed_total >= 0),
  cost_per_base     numeric(14, 4) not null check (cost_per_base >= 0),
  supplier_lot      text,
  expiry_date       date,
  movement_id       uuid references public.stock_movements (id),
  created_at        timestamptz not null default now(),
  unique (purchase_id, line_no),
  foreign key (purchase_id, company_id) references public.purchases (id, company_id),
  foreign key (material_id, company_id) references public.raw_materials (id, company_id)
);
create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_material_idx on public.purchase_items (company_id, material_id);

create table public.purchase_payments (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id),
  purchase_id      uuid not null,
  amount           numeric(14, 2) not null check (amount > 0),
  paid_at          date not null,
  method           text not null check (char_length(btrim(method)) between 1 and 60),
  notes            text,
  idempotency_key  text not null,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  unique (company_id, idempotency_key),
  foreign key (purchase_id, company_id) references public.purchases (id, company_id)
);
create index purchase_payments_purchase_idx on public.purchase_payments (purchase_id);

-- Lignes et paiements : jamais modifiés ni supprimés
create or replace function public.prevent_row_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Cette écriture ne peut être ni modifiée ni supprimée';
end;
$$;
create trigger purchase_items_immutable before update or delete on public.purchase_items
  for each row execute function public.prevent_row_change();
create trigger purchase_payments_immutable before update or delete on public.purchase_payments
  for each row execute function public.prevent_row_change();
create trigger purchases_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

-- Sécurité : lecture seule pour l'application, écritures par fonctions uniquement
alter table public.purchases         enable row level security;
alter table public.purchase_items    enable row level security;
alter table public.purchase_payments enable row level security;
revoke all on public.purchases, public.purchase_items, public.purchase_payments
  from anon, authenticated;
grant select on public.purchases, public.purchase_items, public.purchase_payments
  to authenticated;
revoke all on function public.prevent_row_change() from public, anon, authenticated;

create policy purchases_select on public.purchases for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager','reader']));
create policy purchase_items_select on public.purchase_items for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager','reader']));
create policy purchase_payments_select on public.purchase_payments for select to authenticated
  using (public.has_company_role(company_id, array['admin','manager','reader']));

-- ============================================================
-- Phase 8a (2/3) : create_purchase
-- p_items = tableau JSON, par exemple :
-- [{"material_id":"...","quantity":2,"unit":"l","unit_price":10000,"lot":"A1","expiry":"2027-05-01"}]
-- ============================================================
create or replace function public.create_purchase(
  p_company  uuid,
  p_supplier uuid,
  p_date     date,
  p_invoice  text,
  p_discount numeric,
  p_fees     numeric,
  p_paid     numeric,
  p_method   text,
  p_notes    text,
  p_key      text,
  p_items    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing uuid;
  v_id       uuid;
  v_no       integer;
  v_subtotal numeric := 0;
  v_total    numeric;
  v_disc     numeric := round(coalesce(p_discount, 0), 2);
  v_fees     numeric := round(coalesce(p_fees, 0), 2);
  v_paid     numeric := round(coalesce(p_paid, 0), 2);
  r          record;
  v_unit     text;
  v_qbase    numeric;
  v_line     numeric;
  v_net      numeric;
  v_cost     numeric;
  v_mv       uuid;
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
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Un achat contient entre 1 et 100 lignes';
  end if;
  if v_disc < 0 or v_fees < 0 or v_paid < 0 then
    raise exception 'Montant invalide';
  end if;

  -- Verrou de l'entreprise : sérialise les achats et bloque les doubles envois
  perform 1 from public.companies where id = p_company for update;

  select id into v_existing from public.purchases
  where company_id = p_company and idempotency_key = p_key;
  if found then
    return v_existing;
  end if;

  if p_supplier is not null and not exists (
    select 1 from public.suppliers
    where id = p_supplier and company_id = p_company and status = 'active'
  ) then
    raise exception 'Fournisseur introuvable ou archivé';
  end if;

  -- Passe 1 : validation et sous-total
  for r in
    select (e.item ->> 'material_id')::uuid as material_id,
           (e.item ->> 'quantity')::numeric  as qty,
           e.item ->> 'unit'                 as unit,
           (e.item ->> 'unit_price')::numeric as price,
           e.idx
    from jsonb_array_elements(p_items) with ordinality as e(item, idx)
  loop
    if r.qty is null or r.qty <= 0 then
      raise exception 'Ligne % : quantité invalide', r.idx;
    end if;
    if r.price is null or r.price < 0 then
      raise exception 'Ligne % : prix invalide', r.idx;
    end if;
    select unit into v_unit from public.raw_materials
    where id = r.material_id and company_id = p_company and status = 'active';
    if not found then
      raise exception 'Ligne % : matière introuvable ou archivée', r.idx;
    end if;
    perform public.convert_quantity(r.qty, r.unit, v_unit);
    v_subtotal := v_subtotal + round(r.qty * r.price, 2);
  end loop;

  if v_subtotal <= 0 then
    raise exception 'Le montant des lignes doit être supérieur à zéro';
  end if;
  if v_disc > v_subtotal then
    raise exception 'La remise dépasse le montant des lignes';
  end if;
  v_total := v_subtotal - v_disc + v_fees;
  if v_paid > v_total then
    raise exception 'Le montant payé dépasse le total';
  end if;
  if v_paid > 0 and btrim(coalesce(p_method, '')) = '' then
    raise exception 'Le mode de paiement est obligatoire';
  end if;

  update public.companies set purchase_seq = purchase_seq + 1
  where id = p_company returning purchase_seq into v_no;

  insert into public.purchases
    (company_id, purchase_no, supplier_id, purchase_date, invoice_ref, subtotal, discount,
     extra_fees, total, amount_paid, payment_status, notes, idempotency_key, created_by)
  values
    (p_company, v_no, p_supplier, p_date, nullif(btrim(coalesce(p_invoice, '')), ''),
     v_subtotal, v_disc, v_fees, v_total, v_paid,
     case when v_paid = v_total then 'paid' when v_paid = 0 then 'unpaid' else 'partial' end,
     nullif(btrim(coalesce(p_notes, '')), ''), p_key, v_uid)
  returning id into v_id;

  -- Passe 2 : lignes et mouvements de stock, dans l'ordre des matières (évite les blocages croisés)
  for r in
    select (e.item ->> 'material_id')::uuid as material_id,
           (e.item ->> 'quantity')::numeric  as qty,
           e.item ->> 'unit'                 as unit,
           (e.item ->> 'unit_price')::numeric as price,
           nullif(btrim(coalesce(e.item ->> 'lot', '')), '')     as lot,
           nullif(btrim(coalesce(e.item ->> 'expiry', '')), '')::date as expiry,
           e.idx
    from jsonb_array_elements(p_items) with ordinality as e(item, idx)
    order by (e.item ->> 'material_id')::uuid, e.idx
  loop
    select unit into v_unit from public.raw_materials
    where id = r.material_id and company_id = p_company;

    v_qbase := round(public.convert_quantity(r.qty, r.unit, v_unit), 3);
    if v_qbase <= 0 then
      raise exception 'Ligne % : quantité trop petite', r.idx;
    end if;
    v_line := round(r.qty * r.price, 2);
    v_net  := v_line + (v_fees - v_disc) * v_line / v_subtotal;
    v_cost := round(v_net / v_qbase, 4);

    v_mv := public.apply_stock_movement(
      p_company, r.material_id, 'purchase', v_qbase, v_cost,
      null, null, p_key || ':' || r.idx, v_uid, 'purchase', v_id);

    insert into public.purchase_items
      (company_id, purchase_id, line_no, material_id, quantity_input, unit_input, quantity_base,
       unit_price_input, line_total, landed_total, cost_per_base, supplier_lot, expiry_date, movement_id)
    values
      (p_company, v_id, r.idx, r.material_id, r.qty, r.unit, v_qbase,
       r.price, v_line, round(v_net, 2), v_cost, r.lot, r.expiry, v_mv);
  end loop;

  if v_paid > 0 then
    insert into public.purchase_payments
      (company_id, purchase_id, amount, paid_at, method, idempotency_key, created_by)
    values (p_company, v_id, v_paid, p_date, btrim(p_method), p_key || ':pay', v_uid);
  end if;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, v_uid, 'purchase_created', 'purchase', v_id,
          jsonb_build_object('no', v_no, 'total', v_total, 'paid', v_paid));

  return v_id;
end;
$$;

-- ============================================================
-- Phase 8a (3/3) : paiement fournisseur, annulation, droits
-- ============================================================
create or replace function public.record_purchase_payment(
  p_company  uuid,
  p_purchase uuid,
  p_amount   numeric,
  p_date     date,
  p_method   text,
  p_notes    text,
  p_key      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p   public.purchases;
  v_amt numeric := round(coalesce(p_amount, 0), 2);
  v_id  uuid;
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
  if v_amt <= 0 then
    raise exception 'Montant invalide';
  end if;
  if p_date is null then
    raise exception 'Date invalide';
  end if;
  if btrim(coalesce(p_method, '')) = '' then
    raise exception 'Le mode de paiement est obligatoire';
  end if;

  select * into v_p from public.purchases
  where id = p_purchase and company_id = p_company for update;
  if not found then
    raise exception 'Achat introuvable';
  end if;

  select id into v_id from public.purchase_payments
  where company_id = p_company and idempotency_key = p_key;
  if found then
    return v_id;
  end if;

  if v_p.status <> 'received' then
    raise exception 'Achat annulé : paiement impossible';
  end if;
  if v_amt > v_p.amount_due then
    raise exception 'Paiement supérieur au reste dû';
  end if;

  insert into public.purchase_payments
    (company_id, purchase_id, amount, paid_at, method, notes, idempotency_key, created_by)
  values (p_company, p_purchase, v_amt, p_date, btrim(p_method),
          nullif(btrim(coalesce(p_notes, '')), ''), p_key, v_uid)
  returning id into v_id;

  update public.purchases
  set amount_paid = amount_paid + v_amt,
      payment_status = case when amount_paid + v_amt = total then 'paid' else 'partial' end
  where id = p_purchase;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, v_uid, 'purchase_payment', 'purchase', p_purchase,
          jsonb_build_object('amount', v_amt));

  return v_id;
end;
$$;

-- Annulation : seulement sans paiement, et si le stock reçu est encore disponible.
-- Le stock est retiré au coût moyen COURANT (le coût moyen ne revient pas à sa valeur d'avant l'achat).
create or replace function public.cancel_purchase(
  p_company  uuid,
  p_purchase uuid,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p   public.purchases;
  r     record;
begin
  if v_uid is null then
    raise exception 'Utilisateur non connecté';
  end if;
  if not public.has_company_role(p_company, array['admin', 'manager']) then
    raise exception 'Action réservée aux administrateurs et gestionnaires';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Un motif est obligatoire';
  end if;

  select * into v_p from public.purchases
  where id = p_purchase and company_id = p_company for update;
  if not found then
    raise exception 'Achat introuvable';
  end if;
  if v_p.status <> 'received' then
    raise exception 'Cet achat est déjà annulé';
  end if;
  if v_p.amount_paid > 0 then
    raise exception 'Impossible : des paiements sont enregistrés';
  end if;

  for r in
    select material_id, quantity_base, line_no
    from public.purchase_items
    where purchase_id = p_purchase
    order by material_id, line_no
  loop
    perform public.apply_stock_movement(
      p_company, r.material_id, 'supplier_return', -r.quantity_base, null,
      'Annulation achat n° ' || v_p.purchase_no || ' : ' || btrim(p_reason), null,
      'cancel:' || p_purchase || ':' || r.line_no, v_uid, 'purchase', p_purchase);
  end loop;

  update public.purchases
  set status = 'cancelled', cancel_reason = btrim(p_reason), cancelled_at = now()
  where id = p_purchase;

  insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, v_uid, 'purchase_cancelled', 'purchase', p_purchase,
          jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

revoke all on function public.create_purchase(uuid, uuid, date, text, numeric, numeric, numeric, text, text, text, jsonb)
  from public, anon;
revoke all on function public.record_purchase_payment(uuid, uuid, numeric, date, text, text, text)
  from public, anon;
revoke all on function public.cancel_purchase(uuid, uuid, text) from public, anon;
grant execute on function public.create_purchase(uuid, uuid, date, text, numeric, numeric, numeric, text, text, text, jsonb)
  to authenticated;
grant execute on function public.record_purchase_payment(uuid, uuid, numeric, date, text, text, text)
  to authenticated;
grant execute on function public.cancel_purchase(uuid, uuid, text) to authenticated;
