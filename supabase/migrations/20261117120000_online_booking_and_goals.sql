-- =============================================================================
-- Reservas online (portal de pacientes en /reservar) + objetivos mensuales.
--
-- Flujo:
--   1. La paciente entra a /reservar (sin cuenta), elige tratamiento, día y
--      horario libre y deja sus datos  -> public.request_booking()
--      Se crea una fila en booking_requests con estado "pendiente" y el horario
--      queda reservado (nadie más puede pedirlo) hasta que el consultorio decida.
--   2. El equipo ve la solicitud en vivo (Realtime) y la confirma o la descarta.
--      Confirmar -> public.confirm_booking(): crea (o reutiliza) la ficha de la
--      paciente y el turno "confirmado" en la agenda, con source = 'online'.
--   3. La paciente puede consultar el estado con el token de su solicitud.
--
-- El rol anon NUNCA lee tablas: solo ejecuta funciones security definer que
-- devuelven lo mínimo (tratamientos habilitados, horarios libres, su solicitud).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuración
-- -----------------------------------------------------------------------------
alter table public.settings
  add column booking_enabled boolean not null default true,
  add column booking_min_notice_hours smallint not null default 12
    check (booking_min_notice_hours between 0 and 336),
  add column booking_horizon_days smallint not null default 30
    check (booking_horizon_days between 1 and 180),
  add column booking_step_min smallint not null default 30
    check (booking_step_min in (10, 15, 20, 30, 45, 60)),
  add column booking_intro text not null default
    'Elegí el motivo de tu consulta, el día y el horario que te quede cómodo. Te confirmamos el turno por WhatsApp.',
  add column booking_confirm_template text not null default
    'Hola {nombre}! Tu turno con el Dr. Ignacio Ormaechea quedó confirmado para el {fecha} a las {hora} ({tratamiento}). ¡Te esperamos!',
  add column clinic_phone text check (char_length(clinic_phone) <= 40),
  add column clinic_address text check (char_length(clinic_address) <= 200),
  -- Objetivos mensuales (null = sin objetivo)
  add column goal_income_ars numeric(16, 2) check (goal_income_ars >= 0),
  add column goal_appointments integer check (goal_appointments >= 0),
  add column goal_surgeries integer check (goal_surgeries >= 0),
  add column goal_new_patients integer check (goal_new_patients >= 0);

-- Qué tratamientos se pueden pedir desde el portal (por defecto, solo la consulta inicial).
alter table public.treatments add column online_booking boolean not null default false;
update public.treatments set online_booking = true where kind = 'consulta' and name ilike 'consulta%';

-- Origen del turno: cargado por el equipo o pedido online por la paciente.
alter table public.appointments
  add column source text not null default 'manual' check (source in ('manual', 'online'));

-- -----------------------------------------------------------------------------
-- Horarios en los que se aceptan reservas online (franjas semanales)
-- -----------------------------------------------------------------------------
create table public.booking_hours (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo … 6 = sábado
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint booking_hours_range_check check (end_time > start_time)
);
create index booking_hours_weekday_idx on public.booking_hours (weekday);

-- Valores de referencia: lunes a viernes 10–13 y 15–19 (se editan en Solicitudes → Horarios).
insert into public.booking_hours (weekday, start_time, end_time)
select d, t.s, t.e
from generate_series(1, 5) as d
cross join (values ('10:00'::time, '13:00'::time), ('15:00'::time, '19:00'::time)) as t (s, e);

-- -----------------------------------------------------------------------------
-- Solicitudes de turno
-- -----------------------------------------------------------------------------
create type public.booking_status as enum ('pendiente', 'confirmado', 'rechazado', 'cancelado');

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique, -- la paciente consulta su solicitud con esto
  treatment_id uuid references public.treatments (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  phone text not null check (char_length(btrim(phone)) between 6 and 40),
  email text check (char_length(email) <= 160),
  dni text check (char_length(dni) <= 20),
  source text check (char_length(source) <= 60),
  notes text check (char_length(notes) <= 600),
  status public.booking_status not null default 'pendiente',
  patient_id uuid references public.patients (id) on delete set null, -- ficha existente detectada o creada al confirmar
  appointment_id uuid references public.appointments (id) on delete set null,
  reply text check (char_length(reply) <= 600), -- motivo al descartar
  decided_by uuid default null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint booking_requests_time_check check (ends_at > starts_at)
);
create index booking_requests_status_starts_idx on public.booking_requests (status, starts_at);
create index booking_requests_created_idx on public.booking_requests (created_at);
create index booking_requests_treatment_idx on public.booking_requests (treatment_id);
create index booking_requests_patient_idx on public.booking_requests (patient_id);
create index booking_requests_appointment_idx on public.booking_requests (appointment_id);

-- -----------------------------------------------------------------------------
-- ¿El horario choca con un turno o con otra solicitud pendiente?
-- -----------------------------------------------------------------------------
create function private.slot_is_busy(p_start timestamptz, p_end timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.appointments a
      where a.status <> 'cancelado' and a.starts_at < p_end and a.ends_at > p_start
    )
    or exists (
      select 1 from public.booking_requests r
      where r.status = 'pendiente' and r.starts_at < p_end and r.ends_at > p_start
    );
$$;

-- -----------------------------------------------------------------------------
-- Portal público (anon)
-- -----------------------------------------------------------------------------

-- Datos para armar la página: consultorio, textos y tratamientos habilitados.
create function public.booking_info()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'clinic_name', s.clinic_name,
    'clinic_tagline', s.clinic_tagline,
    'clinic_phone', s.clinic_phone,
    'clinic_address', s.clinic_address,
    'enabled', s.booking_enabled,
    'intro', s.booking_intro,
    'horizon_days', s.booking_horizon_days,
    'min_notice_hours', s.booking_min_notice_hours,
    'timezone', s.timezone,
    'treatments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'name', t.name, 'kind', t.kind,
          'duration_min', t.duration_min, 'description', t.description
        ) order by t.sort_order, t.name)
      from public.treatments t
      where t.active and t.online_booking
    ), '[]'::jsonb)
  )
  from public.settings s
  where s.id = 1;
$$;

-- Horarios libres para un tratamiento entre dos fechas (en la zona horaria del consultorio).
create function public.booking_slots(p_treatment_id uuid, p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_settings public.settings%rowtype;
  v_duration integer;
  v_today date;
  v_from date;
  v_to date;
begin
  select * into v_settings from public.settings where id = 1;
  if not coalesce(v_settings.booking_enabled, false) then
    return;
  end if;

  select t.duration_min into v_duration
  from public.treatments t
  where t.id = p_treatment_id and t.active and t.online_booking;
  if v_duration is null then
    return;
  end if;

  v_today := (now() at time zone v_settings.timezone)::date;
  v_from := greatest(p_from, v_today);
  v_to := least(p_to, v_today + v_settings.booking_horizon_days, v_from + 62);
  if v_to < v_from then
    return;
  end if;

  return query
  select distinct sl.slot_start, sl.slot_start + make_interval(mins => v_duration)
  from (
    select (ls at time zone v_settings.timezone) as slot_start
    from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') as d (day)
    join public.booking_hours h on h.weekday = extract(dow from d.day)::smallint
    cross join lateral generate_series(
      d.day + h.start_time,
      d.day + h.end_time - make_interval(mins => v_duration),
      make_interval(mins => v_settings.booking_step_min::integer)
    ) as ls
  ) as sl
  where sl.slot_start >= now() + make_interval(hours => v_settings.booking_min_notice_hours::integer)
    and not private.slot_is_busy(sl.slot_start, sl.slot_start + make_interval(mins => v_duration))
  order by 1;
end;
$$;

-- La paciente pide un turno. Revalida el horario y lo bloquea hasta que el consultorio decida.
create function public.request_booking(
  p_treatment_id uuid,
  p_starts_at timestamptz,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_dni text default null,
  p_source text default null,
  p_notes text default null,
  p_website text default null -- campo trampa para bots: tiene que llegar vacío
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tz text;
  v_day date;
  v_ends timestamptz;
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_dni text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_patient uuid;
  v_request public.booking_requests%rowtype;
begin
  if nullif(btrim(coalesce(p_website, '')), '') is not null then
    raise exception 'No pudimos registrar la solicitud.' using errcode = 'P0001';
  end if;
  if char_length(v_name) < 3 or position(' ' in v_name) = 0 then
    raise exception 'Ingresá tu nombre y apellido.' using errcode = 'P0001';
  end if;
  if char_length(v_digits) < 8 or char_length(v_digits) > 15 then
    raise exception 'Ingresá un celular válido, con código de área.' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Revisá el email.' using errcode = 'P0001';
  end if;

  -- De a una solicitud por vez: dos personas no pueden quedarse con el mismo horario.
  perform pg_advisory_xact_lock(hashtext('public.request_booking'));

  if (select count(*) from public.booking_requests r where r.created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Recibimos muchas solicitudes en este momento. Probá de nuevo en un rato.' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.booking_requests r
    where r.status = 'pendiente'
      and right(regexp_replace(r.phone, '\D', '', 'g'), 8) = right(v_digits, 8)
  ) >= 2 then
    raise exception 'Ya tenés solicitudes pendientes. Te vamos a contactar a la brevedad.' using errcode = 'P0001';
  end if;

  select s.timezone into v_tz from public.settings s where s.id = 1;
  v_day := (p_starts_at at time zone v_tz)::date;
  select b.ends_at into v_ends
  from public.booking_slots(p_treatment_id, v_day, v_day) as b
  where b.starts_at = p_starts_at;
  if v_ends is null then
    raise exception 'Ese horario ya no está disponible. Elegí otro, por favor.' using errcode = 'P0001';
  end if;

  -- ¿Ya es paciente? Primero por DNI, después por los últimos 8 dígitos del celular.
  select p.id into v_patient
  from public.patients p
  where (v_dni is not null and regexp_replace(coalesce(p.dni, ''), '\D', '', 'g') = v_dni)
     or right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 8) = right(v_digits, 8)
  order by (v_dni is not null and regexp_replace(coalesce(p.dni, ''), '\D', '', 'g') = v_dni) desc, p.created_at
  limit 1;

  insert into public.booking_requests
    (treatment_id, starts_at, ends_at, full_name, phone, email, dni, source, notes, patient_id)
  values (
    p_treatment_id, p_starts_at, v_ends, v_name, btrim(p_phone), v_email, v_dni,
    nullif(btrim(coalesce(p_source, '')), ''),
    nullif(left(btrim(coalesce(p_notes, '')), 600), ''),
    v_patient
  )
  returning * into v_request;

  return jsonb_build_object('token', v_request.token, 'starts_at', v_request.starts_at, 'ends_at', v_request.ends_at);
end;
$$;

-- Estado de una solicitud (lo que ve la paciente). Si ya es turno, refleja la agenda.
create function public.booking_status(p_token uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'status', case
      when r.status = 'confirmado' and a.status = 'cancelado' then 'cancelado'
      when r.status = 'confirmado' and a.id is null then 'cancelado'
      else r.status::text
    end,
    'starts_at', coalesce(a.starts_at, r.starts_at),
    'ends_at', coalesce(a.ends_at, r.ends_at),
    'treatment', t.name,
    'first_name', split_part(r.full_name, ' ', 1),
    'reply', r.reply,
    'created_at', r.created_at
  )
  from public.booking_requests r
  left join public.treatments t on t.id = r.treatment_id
  left join public.appointments a on a.id = r.appointment_id
  where r.token = p_token;
$$;

-- La paciente retira su solicitud mientras está pendiente.
create function public.cancel_booking(p_token uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.booking_requests r
  set status = 'cancelado', decided_at = now()
  where r.token = p_token and r.status = 'pendiente';
  return public.booking_status(p_token);
end;
$$;

-- -----------------------------------------------------------------------------
-- Equipo: confirmar / descartar (corren con los permisos del usuario → RLS)
-- -----------------------------------------------------------------------------
create function public.confirm_booking(p_request_id uuid, p_force boolean default false)
returns uuid
language plpgsql volatile set search_path = ''
as $$
declare
  v_request public.booking_requests%rowtype;
  v_treatment public.treatments%rowtype;
  v_patient uuid;
  v_appointment uuid;
begin
  if not (select private.is_member()) then
    raise exception 'No tenés permisos para confirmar turnos.' using errcode = '42501';
  end if;

  select * into v_request from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'La solicitud ya no existe.' using errcode = 'P0001';
  end if;
  if v_request.status <> 'pendiente' then
    raise exception 'Esta solicitud ya fue %.', case v_request.status
      when 'confirmado' then 'confirmada' when 'rechazado' then 'descartada' else 'cancelada por la paciente' end
      using errcode = 'P0001';
  end if;

  if not p_force and exists (
    select 1 from public.appointments a
    where a.status <> 'cancelado' and a.starts_at < v_request.ends_at and a.ends_at > v_request.starts_at
  ) then
    raise exception 'El horario se superpone con otro turno de la agenda.' using errcode = 'P0001', hint = 'overlap';
  end if;

  v_patient := v_request.patient_id;
  if v_patient is null then
    insert into public.patients (full_name, phone, email, dni, source)
    values (v_request.full_name, v_request.phone, v_request.email, v_request.dni, v_request.source)
    returning id into v_patient;
  end if;

  select * into v_treatment from public.treatments where id = v_request.treatment_id;

  insert into public.appointments
    (patient_id, treatment_id, starts_at, ends_at, status, price, currency, notes, source)
  values (
    v_patient, v_request.treatment_id, v_request.starts_at, v_request.ends_at, 'confirmado',
    coalesce(v_treatment.price, 0), coalesce(v_treatment.currency, 'ARS'), v_request.notes, 'online'
  )
  returning id into v_appointment;

  update public.booking_requests
  set status = 'confirmado', patient_id = v_patient, appointment_id = v_appointment,
      decided_by = (select auth.uid()), decided_at = now()
  where id = v_request.id;

  return v_appointment;
end;
$$;

create function public.decline_booking(p_request_id uuid, p_reply text default null)
returns void
language plpgsql volatile set search_path = ''
as $$
begin
  if not (select private.is_member()) then
    raise exception 'No tenés permisos para descartar solicitudes.' using errcode = '42501';
  end if;
  update public.booking_requests
  set status = 'rechazado', reply = nullif(left(btrim(coalesce(p_reply, '')), 600), ''),
      decided_by = (select auth.uid()), decided_at = now()
  where id = p_request_id and status = 'pendiente';
  if not found then
    raise exception 'La solicitud ya no está pendiente.' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
revoke all on function private.slot_is_busy(timestamptz, timestamptz) from public, anon, authenticated;

revoke all on function public.booking_info() from public, anon, authenticated;
revoke all on function public.booking_slots(uuid, date, date) from public, anon, authenticated;
revoke all on function public.request_booking(uuid, timestamptz, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.booking_status(uuid) from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid) from public, anon, authenticated;
grant execute on function public.booking_info() to anon, authenticated;
grant execute on function public.booking_slots(uuid, date, date) to anon, authenticated;
grant execute on function public.request_booking(uuid, timestamptz, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.booking_status(uuid) to anon, authenticated;
grant execute on function public.cancel_booking(uuid) to anon, authenticated;

revoke all on function public.confirm_booking(uuid, boolean) from public, anon;
revoke all on function public.decline_booking(uuid, text) from public, anon;
grant execute on function public.confirm_booking(uuid, boolean) to authenticated;
grant execute on function public.decline_booking(uuid, text) to authenticated;

revoke all on public.booking_hours, public.booking_requests from anon;
grant select, insert, update, delete on public.booking_hours to authenticated;
grant select, update, delete on public.booking_requests to authenticated;

alter table public.booking_hours enable row level security;
alter table public.booking_requests enable row level security;

create policy "Horarios online visibles para miembros" on public.booking_hours
  for select to authenticated using ((select private.is_member()));
create policy "Horarios online: alta admin" on public.booking_hours
  for insert to authenticated with check ((select private.is_admin()));
create policy "Horarios online: edición admin" on public.booking_hours
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Horarios online: baja admin" on public.booking_hours
  for delete to authenticated using ((select private.is_admin()));

-- Las altas llegan solo por request_booking(); el equipo las ve y decide.
create policy "Solicitudes visibles para miembros" on public.booking_requests
  for select to authenticated using ((select private.is_member()));
create policy "Solicitudes: edición miembros" on public.booking_requests
  for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "Solicitudes: baja admin" on public.booking_requests
  for delete to authenticated using ((select private.is_admin()));

-- Aviso en vivo al equipo cuando entra una solicitud.
alter publication supabase_realtime add table public.booking_requests;
