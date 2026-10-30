-- Las cuentas por pagar automáticas de una cirugía vencen 7 días después de la operación
-- (antes vencían el mismo día y al día siguiente ya figuraban como vencidas).
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

revoke all on function private.sync_procedure_payables() from public;
