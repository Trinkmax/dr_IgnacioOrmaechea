# Consultorio · Dr. Ignacio Ormaechea

Sistema de gestión del consultorio de Cirugía Plástica: agenda con arrastrar y soltar, pacientes, cobros (ARS/USD), gastos fijos y variables, proveedores, tratamientos con estructura de costos y calculadora de rentabilidad. Funciona en computadora y celular (se puede "instalar" en la pantalla de inicio del teléfono).

## Stack

- **Next.js 16** (App Router, Cache Components) + React 19 + TypeScript + Tailwind CSS 4
- **Supabase**: Postgres con RLS, Auth (email + contraseña), Realtime y la Edge Function `team`
- TanStack Query (caché y actualizaciones optimistas), dnd-kit (drag & drop), vaul (hojas deslizables), cmdk (buscador ⌘K)

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # ya viene configurado para el proyecto de Supabase
npm run dev                  # http://localhost:3000  (si el navegador no abre "localhost", usar http://127.0.0.1:3000)
```

Para probar desde el celular en la misma red Wi-Fi: `http://<IP-de-la-compu>:3000`.

### Primer uso

1. Si quedaron datos de demostración, ejecutá `supabase/cleanup_demo.sql` en el SQL Editor de Supabase.
2. Abrí la app: aparece **"Configurá tu consultorio"** → se crea la cuenta del Dr. como **administrador**.
3. En **Ajustes → Consultorio**: actualizá la cotización del dólar, horario de agenda, horas de trabajo/mes e impuestos.
4. En **Gastos**: ajustá los montos de los gastos fijos (vienen con valores de referencia).
5. En **Proveedores**: renombrá "Clínica / Quirófano", "Anestesista", etc. con los datos reales.
6. En **Tratamientos**: revisá precios y costos (vienen cargados con valores de referencia de oct-2026).
7. En **Ajustes → Equipo**: sumá a la secretaria (email + contraseña inicial, rol *Secretaría*).

## Roles

| | Administrador (Dr.) | Secretaría |
|---|---|---|
| Agenda, pacientes, por agendar | ✓ | ✓ |
| Registrar cobros | ✓ | ✓ |
| Editar / anular cobros | ✓ | — |
| Precios de tratamientos | ✓ (edita) | ✓ (solo ve) |
| Costos, gastos, proveedores, calculadora, rentabilidad | ✓ | — |
| Configuración y equipo | ✓ | — |

Los permisos se aplican en la base de datos con RLS (no solo ocultando pantallas).

## Funciones clave

- **Agenda**: vistas Día / Semana (3 días en celular) / Mes. Arrastrar para mover, estirar el borde inferior para cambiar la duración, *Deshacer* en cada cambio. En celular: mantener presionado y arrastrar. Tocar un horario libre crea un turno. Atajos: `T` hoy, `←/→`, `D`/`S`/`M`, `N` nuevo turno.
- **Por agendar**: lista de espera; se arrastra al calendario (o en celular se toca "Agendar" y luego el horario).
- **Turno**: estados (pendiente, confirmado, en sala, atendido, ausente, cancelado), recordatorio por WhatsApp con mensaje configurable, saldo y cobro en un toque.
- **Cobros en ARS o USD** con la cotización del momento; saldos por turno y "Por cobrar".
- **Cirugía atendida ⇒ cuentas por pagar automáticas** a quirófano, anestesista, ayudantes e implantes (según la estructura de costos del tratamiento, vencen a los 7 días). Se puede desactivar en Ajustes.
- **Calculadora**: costos directos + gastos fijos prorrateados por hora + impuestos ⇒ ganancia neta, margen, precio sugerido por margen objetivo y ranking de rentabilidad por hora.
- **Tiempo real**: lo que carga la secretaria aparece solo en el teléfono del Dr.

## Base de datos

Migraciones en `supabase/migrations/` (ya aplicadas al proyecto `eppqkaadshtaratdcdix`). La Edge Function `supabase/functions/team` gestiona altas/bajas del equipo (crea usuarios confirmados, sin depender de emails).

Recomendado en el panel de Supabase → Authentication:
- Desactivar **"Allow new users to sign up"** (las cuentas se crean desde Ajustes → Equipo).
- Activar **Leaked password protection**.

## Deploy (Vercel)

Importar el repo en Vercel y cargar las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No requiere configuración adicional.
