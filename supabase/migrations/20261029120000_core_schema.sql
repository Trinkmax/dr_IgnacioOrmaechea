-- =============================================================================
-- Consultorio Dr. Ignacio Ormaechea · Esquema principal
-- Roles: admin (doctor, ve todo) · asistente (secretaría: agenda, pacientes, cobros)
-- =============================================================================

create schema if not exists private;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'asistente');
create type public.currency_code as enum ('ARS', 'USD');
create type public.treatment_kind as enum ('cirugia', 'procedimiento', 'consulta');
create type public.appointment_status as enum ('pendiente', 'confirmado', 'en_sala', 'atendido', 'ausente', 'cancelado');
create type public.payment_method as enum ('efectivo', 'transferencia', 'debito', 'credito', 'mercadopago', 'otro');
create type public.expense_kind as enum ('fijo', 'variable');

-- -----------------------------------------------------------------------------
-- Equipo
-- -----------------------------------------------------------------------------
create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  email text,
  role public.app_role not null default 'asistente',
  created_at timestamptz not null default now()
);
comment on table public.members is 'Personas con acceso al sistema. Se gestionan desde la Edge Function "team".';

create function private.is_member() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.members m where m.user_id = (select auth.uid()));
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

-- Siempre tiene que quedar al menos un admin.
create function private.ensure_admin_remains() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.members where role = 'admin') then
    raise exception 'Tiene que quedar al menos un administrador.' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create trigger members_admin_guard
after update or delete on public.members
for each statement execute function private.ensure_admin_remains();

-- -----------------------------------------------------------------------------
-- Configuración (fila única)
-- -----------------------------------------------------------------------------
create table public.settings (
  id smallint primary key default 1 check (id = 1),
  clinic_name text not null default 'Dr. Ignacio Ormaechea',
  clinic_tagline text not null default 'Cirugía Plástica',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  usd_rate numeric(12, 2) not null default 1500 check (usd_rate > 0),
  usd_rate_updated_at timestamptz not null default now(),
  day_start smallint not null default 8 check (day_start between 0 and 22),
  day_end smallint not null default 20 check (day_end between 1 and 24),
  monthly_hours numeric(6, 1) not null default 120 check (monthly_hours > 0),
  tax_percent numeric(5, 2) not null default 0 check (tax_percent >= 0 and tax_percent < 100),
  auto_payables boolean not null default true,
  reminder_template text not null default 'Hola {nombre}! Te escribimos del consultorio del Dr. Ignacio Ormaechea para recordarte tu turno del {fecha} a las {hora} ({tratamiento}). ¿Nos confirmás tu asistencia? ¡Gracias!',
  updated_at timestamptz not null default now(),
  constraint settings_hours_check check (day_end > day_start)
);
insert into public.settings (id) values (1);

create function private.current_usd_rate() returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.usd_rate from public.settings s where s.id = 1), 1);
$$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger settings_touch before update on public.settings
for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Proveedores
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null default 'Otros',
  contact_name text,
  phone text,
  email text,
  tax_id text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tratamientos y su estructura de costos
-- -----------------------------------------------------------------------------
create table public.treatments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind public.treatment_kind not null default 'procedimiento',
  duration_min integer not null default 60 check (duration_min between 5 and 720),
  price numeric(14, 2) not null default 0 check (price >= 0),
  currency public.currency_code not null default 'ARS',
  color text not null default 'slate',
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger treatments_touch before update on public.treatments
for each row execute function private.touch_updated_at();

create table public.treatment_costs (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references public.treatments (id) on delete cascade,
  concept text not null check (char_length(btrim(concept)) between 1 and 80),
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  currency public.currency_code not null default 'ARS',
  supplier_id uuid references public.suppliers (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index treatment_costs_treatment_idx on public.treatment_costs (treatment_id);
create index treatment_costs_supplier_idx on public.treatment_costs (supplier_id);

-- -----------------------------------------------------------------------------
-- Pacientes
-- -----------------------------------------------------------------------------
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone text,
  email text,
  dni text,
  birth_date date,
  source text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patients_full_name_idx on public.patients (full_name);

create trigger patients_touch before update on public.patients
for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Turnos (sin paciente = bloqueo de agenda, con título)
-- -----------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete cascade,
  treatment_id uuid references public.treatments (id) on delete set null,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'pendiente',
  price numeric(14, 2) not null default 0 check (price >= 0),
  currency public.currency_code not null default 'ARS',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_check check (ends_at > starts_at),
  constraint appointments_subject_check check (patient_id is not null or nullif(btrim(title), '') is not null)
);
create index appointments_starts_at_idx on public.appointments (starts_at);
create index appointments_patient_idx on public.appointments (patient_id);
create index appointments_treatment_idx on public.appointments (treatment_id);

create trigger appointments_touch before update on public.appointments
for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Por agendar (lista de espera que se arrastra al calendario)
-- -----------------------------------------------------------------------------
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  treatment_id uuid references public.treatments (id) on delete set null,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index waitlist_patient_idx on public.waitlist (patient_id);
create index waitlist_treatment_idx on public.waitlist (treatment_id);

-- -----------------------------------------------------------------------------
-- Cobros (ingresos de pacientes). usd_rate = pesos por dólar al momento del cobro.
-- -----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete restrict,
  appointment_id uuid references public.appointments (id) on delete set null,
  paid_on date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  currency public.currency_code not null default 'ARS',
  usd_rate numeric(12, 2) not null default private.current_usd_rate() check (usd_rate > 0),
  amount_ars numeric(16, 2) generated always as (
    case when currency = 'USD' then round(amount * usd_rate, 2) else amount end
  ) stored,
  amount_usd numeric(16, 2) generated always as (
    case when currency = 'USD' then amount else round(amount / usd_rate, 2) end
  ) stored,
  method public.payment_method not null default 'efectivo',
  concept text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index payments_paid_on_idx on public.payments (paid_on);
create index payments_patient_idx on public.payments (patient_id);
create index payments_appointment_idx on public.payments (appointment_id);

-- -----------------------------------------------------------------------------
-- Gastos fijos (plantillas mensuales) y egresos (fijos, variables, proveedores)
-- -----------------------------------------------------------------------------
create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  category text not null default 'Otros',
  supplier_id uuid references public.suppliers (id) on delete set null,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  currency public.currency_code not null default 'ARS',
  due_day smallint not null default 10 check (due_day between 1 and 31),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index recurring_expenses_supplier_idx on public.recurring_expenses (supplier_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  kind public.expense_kind not null default 'variable',
  category text not null default 'Otros',
  description text not null check (char_length(btrim(description)) between 1 and 160),
  supplier_id uuid references public.suppliers (id) on delete set null,
  recurring_id uuid references public.recurring_expenses (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  currency public.currency_code not null default 'ARS',
  usd_rate numeric(12, 2) not null default private.current_usd_rate() check (usd_rate > 0),
  amount_ars numeric(16, 2) generated always as (
    case when currency = 'USD' then round(amount * usd_rate, 2) else amount end
  ) stored,
  amount_usd numeric(16, 2) generated always as (
    case when currency = 'USD' then amount else round(amount / usd_rate, 2) end
  ) stored,
  due_on date not null default current_date,
  paid_on date,
  method public.payment_method,
  auto_generated boolean not null default false,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index expenses_due_on_idx on public.expenses (due_on);
create index expenses_supplier_idx on public.expenses (supplier_id);
create index expenses_appointment_idx on public.expenses (appointment_id);
create index expenses_recurring_idx on public.expenses (recurring_id);
-- Un gasto fijo se registra una sola vez por mes.
create unique index expenses_recurring_period_uidx
  on public.expenses (recurring_id, (date_trunc('month', due_on::timestamp)))
  where recurring_id is not null;

-- -----------------------------------------------------------------------------
-- Cirugía realizada => cuentas por pagar automáticas a los proveedores asignados
-- en la estructura de costos del tratamiento. Si se revierte el estado, se borran
-- las que todavía no se pagaron.
-- -----------------------------------------------------------------------------
create function private.sync_procedure_payables() returns trigger
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
    where e.appointment_id = new.id and e.auto_generated and e.paid_on is null;
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
        (new.starts_at at time zone coalesce(v_tz, 'America/Argentina/Buenos_Aires'))::date,
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

create trigger appointments_payables
after insert or update of status on public.appointments
for each row execute function private.sync_procedure_payables();

-- Si se borra el turno, se borran las cuentas por pagar automáticas aún impagas.
create function private.drop_unpaid_payables() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.expenses e
  where e.appointment_id = old.id and e.auto_generated and e.paid_on is null;
  return old;
end;
$$;

create trigger appointments_drop_payables
before delete on public.appointments
for each row execute function private.drop_unpaid_payables();

-- -----------------------------------------------------------------------------
-- Saldos por turno (respeta RLS)
-- -----------------------------------------------------------------------------
create view public.appointment_balances with (security_invoker = true) as
select
  a.id,
  a.patient_id,
  a.treatment_id,
  a.starts_at,
  a.status,
  a.price,
  a.currency,
  coalesce(sum(case when a.currency = 'USD' then p.amount_usd else p.amount_ars end), 0)::numeric(16, 2) as paid,
  (a.price - coalesce(sum(case when a.currency = 'USD' then p.amount_usd else p.amount_ars end), 0))::numeric(16, 2) as balance
from public.appointments a
left join public.payments p on p.appointment_id = a.id
group by a.id;

-- -----------------------------------------------------------------------------
-- Permisos de funciones
-- -----------------------------------------------------------------------------
revoke all on all functions in schema private from public;
grant execute on function private.is_member() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_usd_rate() to authenticated;

-- -----------------------------------------------------------------------------
-- Exposición a la Data API (las tablas nuevas no se exponen solas) + RLS
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.members, public.settings, public.suppliers, public.treatments, public.treatment_costs,
  public.patients, public.appointments, public.waitlist, public.payments,
  public.recurring_expenses, public.expenses
to authenticated;
grant select on public.appointment_balances to authenticated;

alter table public.members enable row level security;
alter table public.settings enable row level security;
alter table public.suppliers enable row level security;
alter table public.treatments enable row level security;
alter table public.treatment_costs enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.waitlist enable row level security;
alter table public.payments enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.expenses enable row level security;

-- Equipo: todos ven al equipo; altas/bajas/cambios via Edge Function (service role).
create policy "Equipo visible para miembros" on public.members
  for select to authenticated using ((select private.is_member()));

-- Configuración: todos leen, solo admin modifica.
create policy "Configuración visible para miembros" on public.settings
  for select to authenticated using ((select private.is_member()));
create policy "Configuración editable por admin" on public.settings
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Tratamientos: todos ven precios (la secretaría cotiza), solo admin edita.
create policy "Tratamientos visibles para miembros" on public.treatments
  for select to authenticated using ((select private.is_member()));
create policy "Tratamientos: alta admin" on public.treatments
  for insert to authenticated with check ((select private.is_admin()));
create policy "Tratamientos: edición admin" on public.treatments
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Tratamientos: baja admin" on public.treatments
  for delete to authenticated using ((select private.is_admin()));

-- Costos, proveedores y gastos: solo admin.
create policy "Costos solo admin" on public.treatment_costs
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Proveedores solo admin" on public.suppliers
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Gastos fijos solo admin" on public.recurring_expenses
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Egresos solo admin" on public.expenses
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Pacientes: todo el equipo; borrar solo admin.
create policy "Pacientes visibles para miembros" on public.patients
  for select to authenticated using ((select private.is_member()));
create policy "Pacientes: alta miembros" on public.patients
  for insert to authenticated with check ((select private.is_member()));
create policy "Pacientes: edición miembros" on public.patients
  for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "Pacientes: baja admin" on public.patients
  for delete to authenticated using ((select private.is_admin()));

-- Turnos y lista de espera: todo el equipo.
create policy "Turnos para miembros" on public.appointments
  for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "Por agendar para miembros" on public.waitlist
  for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));

-- Cobros: el equipo registra y consulta; corregir o anular solo admin (control de caja).
create policy "Cobros visibles para miembros" on public.payments
  for select to authenticated using ((select private.is_member()));
create policy "Cobros: alta miembros" on public.payments
  for insert to authenticated with check ((select private.is_member()));
create policy "Cobros: edición admin" on public.payments
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Cobros: baja admin" on public.payments
  for delete to authenticated using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Realtime: la agenda se actualiza en vivo entre la secretaría y el doctor.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.appointments, public.waitlist, public.payments;
