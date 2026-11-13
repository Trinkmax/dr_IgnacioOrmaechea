-- =============================================================================
-- Pagos parciales de egresos / cuentas por pagar a proveedores.
--
-- Cada egreso puede tener N pagos (expense_payments). En el egreso quedan
-- derivados (mantenidos por triggers, nunca editados a mano):
--   paid_amount  suma de los pagos
--   balance      saldo pendiente (amount - paid_amount)
--   balance_ars  saldo pendiente en pesos
--   paid_on      fecha del pago que lo saldó (null mientras quede saldo)
--   method       medio del último pago (null mientras quede saldo)
--
-- Compatibilidad: escribir paid_on sigue funcionando como "atajo":
--   * INSERT con paid_on       -> se registra un pago por el total.
--   * UPDATE paid_on null->fecha -> se registra un pago por el saldo restante.
--   * UPDATE paid_on fecha->null -> se borran los pagos (vuelve a quedar impago).
-- =============================================================================

create table public.expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method public.payment_method not null default 'transferencia',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index expense_payments_expense_idx on public.expense_payments (expense_id);
create index expense_payments_paid_on_idx on public.expense_payments (paid_on);

alter table public.expenses
  add column paid_amount numeric(14, 2) not null default 0,
  add column balance numeric(14, 2) generated always as (amount - paid_amount) stored,
  add column balance_ars numeric(16, 2) generated always as (
    case when currency = 'USD' then round((amount - paid_amount) * usd_rate, 2) else amount - paid_amount end
  ) stored,
  add constraint expenses_paid_amount_check check (paid_amount >= 0 and paid_amount <= amount);

-- -----------------------------------------------------------------------------
-- Un pago no puede superar el saldo del egreso.
-- -----------------------------------------------------------------------------
create function private.expense_payments_validate() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_total numeric;
  v_other numeric;
begin
  select e.amount into v_total from public.expenses e where e.id = new.expense_id for update;
  if not found then
    raise exception 'El gasto no existe.' using errcode = '23503';
  end if;

  select coalesce(sum(p.amount), 0) into v_other
  from public.expense_payments p
  where p.expense_id = new.expense_id and p.id <> new.id;

  if v_other + new.amount > v_total then
    raise exception 'El pago supera el saldo pendiente (quedan %).', to_char(v_total - v_other, 'FM999G999G999G990D00')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger expense_payments_validate
before insert or update of amount, expense_id on public.expense_payments
for each row execute function private.expense_payments_validate();

-- -----------------------------------------------------------------------------
-- Cada cambio en los pagos recalcula los campos derivados del egreso.
-- -----------------------------------------------------------------------------
create function private.expense_payments_sync() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
  v_paid numeric;
  v_last date;
  v_method public.payment_method;
begin
  for v_id in
    select distinct x
    from unnest(array[
      case when tg_op <> 'INSERT' then old.expense_id end,
      case when tg_op <> 'DELETE' then new.expense_id end
    ]) as x
    where x is not null
  loop
    select coalesce(sum(p.amount), 0) into v_paid from public.expense_payments p where p.expense_id = v_id;
    select p.paid_on, p.method into v_last, v_method
    from public.expense_payments p
    where p.expense_id = v_id
    order by p.paid_on desc, p.created_at desc
    limit 1;

    perform set_config('app.expense_sync', 'on', true);
    update public.expenses e
    set paid_amount = v_paid,
        paid_on = case when v_paid > 0 and v_paid >= e.amount then v_last end,
        method = case when v_paid > 0 and v_paid >= e.amount then v_method end
    where e.id = v_id;
    perform set_config('app.expense_sync', 'off', true);
  end loop;
  return null;
end;
$$;

create trigger expense_payments_sync
after insert or update or delete on public.expense_payments
for each row execute function private.expense_payments_sync();

-- -----------------------------------------------------------------------------
-- Protección de los derivados al escribir directo sobre expenses.
-- -----------------------------------------------------------------------------
create function private.expenses_guard_paid() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_setting('app.expense_sync', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.paid_amount := 0; -- el pago (si viene paid_on) lo crea el trigger AFTER
    return new;
  end if;

  new.paid_amount := old.paid_amount;

  if new.amount < old.paid_amount then
    raise exception 'El monto no puede ser menor a lo ya pagado (%).', to_char(old.paid_amount, 'FM999G999G999G990D00')
      using errcode = '23514';
  end if;

  -- Atajos: saldar todo / volver a impago (los resuelve el trigger AFTER).
  if old.paid_on is null and new.paid_on is not null and old.paid_amount < new.amount then
    return new;
  end if;
  if old.paid_on is not null and new.paid_on is null then
    return new;
  end if;

  -- Cualquier otro cambio (p. ej. el monto): recalcular según los pagos.
  if old.paid_amount > 0 and old.paid_amount >= new.amount then
    select p.paid_on, p.method into new.paid_on, new.method
    from public.expense_payments p
    where p.expense_id = new.id
    order by p.paid_on desc, p.created_at desc
    limit 1;
  else
    new.paid_on := null;
    new.method := null;
  end if;
  return new;
end;
$$;

create trigger expenses_guard_paid
before insert or update on public.expenses
for each row execute function private.expenses_guard_paid();

create function private.expenses_apply_paid() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_setting('app.expense_sync', true) = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    if new.paid_on is not null then
      insert into public.expense_payments (expense_id, amount, paid_on, method, created_by)
      values (new.id, new.amount, new.paid_on, coalesce(new.method, 'transferencia'), new.created_by);
    end if;
    return null;
  end if;

  if old.paid_on is null and new.paid_on is not null and new.paid_amount < new.amount then
    insert into public.expense_payments (expense_id, amount, paid_on, method)
    values (new.id, new.amount - new.paid_amount, new.paid_on, coalesce(new.method, 'transferencia'));
  elsif old.paid_on is not null and new.paid_on is null and new.paid_amount > 0 then
    delete from public.expense_payments p where p.expense_id = new.id;
  end if;
  return null;
end;
$$;

create trigger expenses_apply_paid
after insert or update of paid_on on public.expenses
for each row execute function private.expenses_apply_paid();

-- -----------------------------------------------------------------------------
-- Pago a cuenta de un proveedor: se imputa a sus deudas de esa moneda,
-- de la que vence primero a la última. Devuelve los ids de los pagos creados.
-- -----------------------------------------------------------------------------
create function public.pay_supplier(
  p_supplier_id uuid,
  p_currency public.currency_code,
  p_amount numeric,
  p_paid_on date default current_date,
  p_method public.payment_method default 'transferencia',
  p_notes text default null
) returns uuid[]
language plpgsql set search_path = ''
as $$
declare
  r record;
  v_left numeric := round(p_amount, 2);
  v_part numeric;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede registrar pagos.' using errcode = '42501';
  end if;
  if v_left is null or v_left <= 0 then
    raise exception 'Ingresá un monto mayor a cero.' using errcode = '22023';
  end if;

  for r in
    select e.id, e.amount - e.paid_amount as pending
    from public.expenses e
    where e.supplier_id = p_supplier_id and e.currency = p_currency and e.paid_amount < e.amount
    order by e.due_on, e.created_at
    for update
  loop
    exit when v_left <= 0;
    v_part := least(v_left, r.pending);
    insert into public.expense_payments (expense_id, amount, paid_on, method, notes)
    values (r.id, v_part, coalesce(p_paid_on, current_date), coalesce(p_method, 'transferencia'), nullif(btrim(p_notes), ''))
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_left := v_left - v_part;
  end loop;

  if v_left > 0 then
    raise exception 'El pago supera la deuda con el proveedor (sobran %).', to_char(v_left, 'FM999G999G999G990D00')
      using errcode = '23514';
  end if;
  return v_ids;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cuentas por pagar automáticas de cirugías: solo se borran si no tienen
-- ningún pago (antes: si no estaban saldadas), para no perder pagos parciales.
-- -----------------------------------------------------------------------------
create or replace function private.sync_procedure_payables() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_enabled boolean;
  v_rate numeric;
  v_tz text;
  v_patient text;
  v_was_done boolean := tg_op = 'UPDATE' and old.status = 'atendido';
  v_is_done boolean := new.status = 'atendido';
begin
  if v_was_done and not v_is_done then
    delete from public.expenses e
    where e.appointment_id = new.id and e.auto_generated and e.paid_amount = 0;
    return null;
  end if;

  if v_is_done and not v_was_done and new.treatment_id is not null then
    select s.auto_payables, s.usd_rate, s.timezone into v_enabled, v_rate, v_tz
    from public.settings s where s.id = 1;

    if coalesce(v_enabled, false)
       and not exists (select 1 from public.expenses e where e.appointment_id = new.id and e.auto_generated) then
      select p.full_name into v_patient from public.patients p where p.id = new.patient_id;

      insert into public.expenses
        (kind, category, description, supplier_id, appointment_id, amount, currency, usd_rate, due_on, auto_generated, created_by)
      select
        'variable',
        sup.category,
        tc.concept || coalesce(' · ' || v_patient, ''),
        tc.supplier_id,
        new.id,
        tc.amount,
        tc.currency,
        coalesce(v_rate, 1),
        (new.starts_at at time zone coalesce(v_tz, 'America/Argentina/Buenos_Aires'))::date + 7,
        true,
        (select auth.uid())
      from public.treatment_costs tc
      join public.suppliers sup on sup.id = tc.supplier_id
      where tc.treatment_id = new.treatment_id and tc.amount > 0;
    end if;
  end if;

  return null;
end;
$$;

create or replace function private.drop_unpaid_payables() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.expenses e
  where e.appointment_id = old.id and e.auto_generated and e.paid_amount = 0;
  return old;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
revoke all on function private.expense_payments_validate() from public, anon, authenticated;
revoke all on function private.expense_payments_sync() from public, anon, authenticated;
revoke all on function private.expenses_guard_paid() from public, anon, authenticated;
revoke all on function private.expenses_apply_paid() from public, anon, authenticated;
revoke all on function private.sync_procedure_payables() from public, anon, authenticated;
revoke all on function private.drop_unpaid_payables() from public, anon, authenticated;
revoke all on function public.pay_supplier(uuid, public.currency_code, numeric, date, public.payment_method, text) from public, anon;
grant execute on function public.pay_supplier(uuid, public.currency_code, numeric, date, public.payment_method, text) to authenticated;

grant select, insert, update, delete on public.expense_payments to authenticated;
alter table public.expense_payments enable row level security;
create policy "Pagos de egresos solo admin" on public.expense_payments
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Datos existentes: cada egreso ya pagado pasa a tener su pago por el total.
-- -----------------------------------------------------------------------------
insert into public.expense_payments (expense_id, amount, paid_on, method, created_by, created_at)
select e.id, e.amount, e.paid_on, coalesce(e.method, 'transferencia'), e.created_by, e.created_at
from public.expenses e
where e.paid_on is not null;
