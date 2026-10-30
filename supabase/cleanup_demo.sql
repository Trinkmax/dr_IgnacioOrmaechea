-- =============================================================================
-- Limpieza de los datos de DEMOSTRACIÓN cargados durante las pruebas.
-- Borra pacientes, turnos, cobros, gastos, "por agendar" y las 2 cuentas de prueba
-- (admin.prueba@consultorio.test y secretaria.prueba@consultorio.test).
-- NO toca el catálogo: tratamientos, costos, proveedores, gastos fijos ni configuración.
--
-- Después de correrlo, al abrir la app aparece la pantalla "Configurá tu consultorio"
-- para crear la cuenta real del Dr. (administrador).
--
-- Uso: Supabase Dashboard → SQL Editor → pegar y ejecutar.
-- =============================================================================
begin;

delete from public.payments;
delete from public.expenses;
delete from public.waitlist;
delete from public.appointments;
delete from public.patients;

-- El guard impide borrar al último administrador; se desactiva solo durante este borrado.
alter table public.members disable trigger members_admin_guard;
delete from auth.users where email in ('admin.prueba@consultorio.test', 'secretaria.prueba@consultorio.test');
alter table public.members enable trigger members_admin_guard;

commit;
