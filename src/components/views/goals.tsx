"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowRight,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  HandCoins,
  Pencil,
  Stethoscope,
  Target,
  TrendingUp,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput } from "@/components/ui/field";
import { Card, EmptyState, Kpi, PageHeader, PeriodNav, SectionTitle, Skeleton, StatusBadge, TreatmentTag } from "@/components/ui/misc";
import { useOverlay } from "@/components/shell/overlay-store";
import { BarList, COMPOSITION, ColumnChart, Heatmap, SERIES, type ColumnDatum } from "@/components/views/charts";
import { useGoalStats, type GoalAppointment } from "@/lib/queries/goals";
import { useSettings, useUpdateSettings } from "@/lib/queries/catalog";
import { useNow } from "@/lib/hooks";
import { appointmentPaid } from "@/lib/money-helpers";
import { capitalize, money, moneyCompact, number, percent, relativeDay, time, toArs } from "@/lib/format";
import { cn, errorMessage } from "@/lib/utils";
import type { Settings } from "@/lib/types";

const OPEN_STATUSES = new Set(["pendiente", "confirmado", "en_sala"]);
const SHORT_DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const monthLabel = (d: Date) => format(d, "MMM", { locale: es }).replace(".", "");

export function GoalsView() {
  const now = useNow(60_000);
  const { data: settings } = useSettings();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [editing, setEditing] = useState(false);

  // Ventana: 6 meses hasta el mes elegido + lo agendado en las próximas 9 semanas.
  const todayKey = format(now, "yyyy-MM-dd");
  const fromIso = useMemo(() => subMonths(month, 5).toISOString(), [month]);
  const toIso = useMemo(() => {
    const horizon = addDays(startOfDay(new Date(`${todayKey}T00:00`)), 63);
    const monthEnd = addMonths(month, 1);
    return (horizon > monthEnd ? horizon : monthEnd).toISOString();
  }, [month, todayKey]);
  const { data, isLoading } = useGoalStats(fromIso, toIso);
  const usdRate = Number(settings?.usd_rate ?? 1);

  const isCurrent = isSameMonth(month, now);
  const isPast = month < startOfMonth(now);
  const elapsed = isCurrent
    ? (now.getTime() - month.getTime()) / (endOfMonth(month).getTime() - month.getTime())
    : isPast
      ? 1
      : 0;

  const patientAppts = useMemo(() => (data?.appointments ?? []).filter((a) => a.patient_id), [data]);

  // ---------------------------------------------------------------- objetivos del mes
  const goals = useMemo(() => {
    const key = format(month, "yyyy-MM");
    const inMonth = patientAppts.filter((a) => isSameMonth(new Date(a.starts_at), month));
    const isOpen = (a: GoalAppointment) => OPEN_STATUSES.has(a.status) && new Date(a.ends_at) > now;
    const attended = inMonth.filter((a) => a.status === "atendido");
    const open = inMonth.filter(isOpen);
    const surgery = (a: GoalAppointment) => a.treatment?.kind === "cirugia";
    const income = (data?.payments ?? []).filter((p) => p.paid_on.startsWith(key)).reduce((t, p) => t + (p.amount_ars ?? 0), 0);
    const incomeAhead = open.reduce((t, a) => t + toArs(appointmentPaid(a).balance, a.currency, usdRate), 0);
    const newPatients = (data?.patients ?? []).filter((p) => isSameMonth(new Date(p.created_at), month)).length;
    return {
      income,
      incomeAhead,
      attended: attended.length,
      open: open.length,
      surgeries: attended.filter(surgery).length,
      surgeriesOpen: open.filter(surgery).length,
      newPatients,
    };
  }, [patientAppts, data, month, now, usdRate]);

  const workdaysLeft = useMemo(() => {
    if (!isCurrent) return 0;
    let n = 0;
    for (let d = startOfDay(now); d <= endOfMonth(month); d = addDays(d, 1)) if (d.getDay() !== 0 && d.getDay() !== 6) n++;
    return n;
  }, [isCurrent, now, month]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Objetivos"
        subtitle="Cómo viene el mes, lo que queda por atender y lo que no se ve en el día a día"
        actions={
          <>
            <PeriodNav
              label={<span className="inline-block min-w-28">{format(month, "MMMM yyyy", { locale: es })}</span>}
              onPrev={() => setMonth((m) => subMonths(m, 1))}
              onNext={() => setMonth((m) => addMonths(m, 1))}
              onToday={isCurrent ? undefined : () => setMonth(startOfMonth(new Date()))}
              todayLabel="Este mes"
            />
            <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
              <Pencil className="size-4" /> {editing ? "Cerrar" : "Editar objetivos"}
            </Button>
          </>
        }
      />

      {editing && settings ? <GoalsEditor key={settings.updated_at} settings={settings} onDone={() => setEditing(false)} /> : null}

      {/* Objetivos del mes */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GoalCard
          label="Facturación"
          icon={<HandCoins />}
          loading={isLoading}
          value={goals.income}
          ahead={goals.incomeAhead}
          aheadLabel="por cobrar de lo agendado"
          target={settings?.goal_income_ars ?? null}
          format={(v) => money(v)}
          compact={(v) => moneyCompact(v)}
          elapsed={elapsed}
          workdaysLeft={workdaysLeft}
          onSetGoal={() => setEditing(true)}
          isFuture={!isCurrent && !isPast}
        />
        <GoalCard
          label="Turnos atendidos"
          icon={<UsersRound />}
          loading={isLoading}
          value={goals.attended}
          ahead={goals.open}
          aheadLabel="agendados por atender"
          target={settings?.goal_appointments ?? null}
          format={number}
          elapsed={elapsed}
          workdaysLeft={workdaysLeft}
          onSetGoal={() => setEditing(true)}
          isFuture={!isCurrent && !isPast}
        />
        <GoalCard
          label="Cirugías"
          icon={<Stethoscope />}
          loading={isLoading}
          value={goals.surgeries}
          ahead={goals.surgeriesOpen}
          aheadLabel="programadas"
          target={settings?.goal_surgeries ?? null}
          format={number}
          elapsed={elapsed}
          workdaysLeft={workdaysLeft}
          onSetGoal={() => setEditing(true)}
          isFuture={!isCurrent && !isPast}
        />
        <GoalCard
          label="Pacientes nuevos"
          icon={<UserRoundPlus />}
          loading={isLoading}
          value={goals.newPatients}
          target={settings?.goal_new_patients ?? null}
          format={number}
          elapsed={elapsed}
          workdaysLeft={workdaysLeft}
          onSetGoal={() => setEditing(true)}
          isFuture={!isCurrent && !isPast}
        />
      </div>

      <Remaining appointments={patientAppts} now={now} settings={settings} loading={isLoading} />

      <Trends appointments={patientAppts} stats={data} month={month} now={now} settings={settings} loading={isLoading} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de objetivo: real + agendado + marca de "dónde deberías estar hoy"
// ---------------------------------------------------------------------------
function GoalCard({
  label,
  icon,
  value,
  ahead = 0,
  aheadLabel,
  target,
  format: formatValue,
  compact,
  elapsed,
  workdaysLeft,
  loading,
  onSetGoal,
  isFuture,
}: {
  label: string;
  icon: ReactNode;
  value: number;
  ahead?: number;
  aheadLabel?: string;
  target: number | null;
  format: (v: number) => string;
  compact?: (v: number) => string;
  elapsed: number;
  workdaysLeft: number;
  loading: boolean;
  onSetGoal: () => void;
  isFuture: boolean;
}) {
  const short = compact ?? formatValue;
  const hasGoal = target != null && target > 0;
  const pct = hasGoal ? (value / target) * 100 : 0;
  const aheadPct = hasGoal ? (ahead / target) * 100 : 0;
  const missing = hasGoal ? Math.max(0, target - value) : 0;
  const expected = hasGoal ? target * elapsed : 0;

  let status: { tone: "success" | "warning" | "danger" | "neutral"; icon: ReactNode; text: string } | null = null;
  if (hasGoal && !isFuture) {
    if (value >= target) status = { tone: "success", icon: <CheckCircle2 className="size-3.5" />, text: "¡Objetivo cumplido!" };
    else if (elapsed >= 1) status = { tone: "danger", icon: <CircleAlert className="size-3.5" />, text: `Cerró en ${percent(pct)} del objetivo` };
    else if (value + ahead >= target) status = { tone: "success", icon: <TrendingUp className="size-3.5" />, text: "Con lo agendado, lo cumplís" };
    else if (value >= expected * 0.9) status = { tone: "neutral", icon: <TrendingUp className="size-3.5" />, text: "En ritmo" };
    else status = { tone: "warning", icon: <CircleAlert className="size-3.5" />, text: "Por debajo del ritmo" };
  }
  const toneClass = { success: "text-success", warning: "text-warning", danger: "text-danger", neutral: "text-ink-2" };

  return (
    <Card className="flex min-w-0 flex-col p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-muted">{label}</span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink [&_svg]:size-4">{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-36" />
      ) : (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 font-display text-[28px] leading-none tracking-[-0.035em] text-ink">
          {formatValue(value)}
          {hasGoal ? <span className="text-[15px] font-medium tracking-normal text-muted">/ {short(target)}</span> : null}
        </p>
      )}

      {hasGoal ? (
        <>
          <div
            className="relative mt-4 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${percent(pct)} del objetivo`}
          >
            <div className="h-full rounded-l-full bg-success transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, pct)}%` }} />
            {ahead > 0 && pct < 100 ? (
              <div className="h-full bg-success/30 transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100 - Math.min(100, pct), aheadPct)}%` }} />
            ) : null}
          </div>
          <div className="relative h-3">
            {elapsed > 0 && elapsed < 1 ? (
              <span className="absolute top-0 h-2 w-[2px] -translate-x-1/2 rounded-full bg-ink-2" style={{ left: `${elapsed * 100}%` }} title="Dónde deberías estar hoy" aria-hidden />
            ) : null}
          </div>
          <div className="mt-1 space-y-1 text-xs">
            {status ? (
              <p className={cn("inline-flex items-center gap-1 font-medium", toneClass[status.tone])}>
                {status.icon} {status.text} · {percent(pct)}
              </p>
            ) : (
              <p className="text-muted">Mes por empezar</p>
            )}
            {ahead > 0 ? (
              <p className="text-muted">
                + {short(ahead)} {aheadLabel}
              </p>
            ) : null}
            {missing > 0 && workdaysLeft > 0 ? (
              <p className="text-muted">
                Faltan {short(missing)} · {short(missing / workdaysLeft)} por día hábil
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-auto pt-4">
          {ahead > 0 ? (
            <p className="mb-2 text-xs text-muted">
              + {short(ahead)} {aheadLabel}
            </p>
          ) : null}
          <button type="button" onClick={onSetGoal} className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
            <Target className="size-3.5" /> Definir objetivo mensual
          </button>
        </div>
      )}
    </Card>
  );
}

function GoalsEditor({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const update = useUpdateSettings();
  const [form, setForm] = useState({
    goal_income_ars: settings.goal_income_ars as number | null,
    goal_appointments: settings.goal_appointments?.toString() ?? "",
    goal_surgeries: settings.goal_surgeries?.toString() ?? "",
    goal_new_patients: settings.goal_new_patients?.toString() ?? "",
  });
  const toInt = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v) || 0)));

  const save = async () => {
    try {
      await update.mutateAsync({
        goal_income_ars: form.goal_income_ars && form.goal_income_ars > 0 ? form.goal_income_ars : null,
        goal_appointments: toInt(form.goal_appointments),
        goal_surgeries: toInt(form.goal_surgeries),
        goal_new_patients: toInt(form.goal_new_patients),
      });
      toast.success("Objetivos guardados");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="mt-6 animate-rise p-4 md:p-6">
      <SectionTitle title="Objetivos mensuales" subtitle="Se aplican a todos los meses. Dejá un campo vacío para no seguirlo." />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Facturación (cobrado en pesos)">
          <MoneyInput value={form.goal_income_ars} onChange={(v) => setForm((f) => ({ ...f, goal_income_ars: v }))} currency="ARS" />
        </Field>
        <Field label="Turnos atendidos">
          <Input type="number" inputMode="numeric" min={0} value={form.goal_appointments} onChange={(e) => setForm((f) => ({ ...f, goal_appointments: e.target.value }))} placeholder="Ej. 80" />
        </Field>
        <Field label="Cirugías">
          <Input type="number" inputMode="numeric" min={0} value={form.goal_surgeries} onChange={(e) => setForm((f) => ({ ...f, goal_surgeries: e.target.value }))} placeholder="Ej. 8" />
        </Field>
        <Field label="Pacientes nuevos">
          <Input type="number" inputMode="numeric" min={0} value={form.goal_new_patients} onChange={(e) => setForm((f) => ({ ...f, goal_new_patients: e.target.value }))} placeholder="Ej. 25" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button onClick={save} loading={update.isPending}>
          Guardar objetivos
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Turnos que quedan por dar
// ---------------------------------------------------------------------------
function Remaining({ appointments, now, settings, loading }: { appointments: GoalAppointment[]; now: Date; settings: Settings | undefined; loading: boolean }) {
  const { open } = useOverlay();
  const upcoming = useMemo(
    () => appointments.filter((a) => OPEN_STATUSES.has(a.status) && new Date(a.ends_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [appointments, now],
  );

  const counts = useMemo(() => {
    const todayEnd = endOfDay(now);
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthEnd = endOfMonth(now);
    const until = (d: Date) => upcoming.filter((a) => new Date(a.starts_at) <= d).length;
    return { today: until(todayEnd), week: until(weekEnd), month: until(monthEnd), all: upcoming.length };
  }, [upcoming, now]);

  // Carga de las próximas 8 semanas, en horas, contra la capacidad semanal.
  const weeks = useMemo<ColumnDatum[]>(() => {
    const first = startOfWeek(now, { weekStartsOn: 1 });
    return Array.from({ length: 8 }, (_, i) => {
      const from = addWeeks(first, i);
      const to = addWeeks(from, 1);
      const list = appointments.filter((a) => a.status !== "cancelado" && new Date(a.starts_at) >= from && new Date(a.starts_at) < to);
      const hours = list.reduce((t, a) => t + (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 3_600_000, 0);
      const surgeries = list.filter((a) => a.treatment?.kind === "cirugia").length;
      return {
        key: from.toISOString(),
        label: i === 0 ? "Esta" : format(from, "d MMM", { locale: es }).replace(".", ""),
        longLabel: `Semana del ${format(from, "d", { locale: es })} al ${format(addDays(from, 6), "d 'de' MMMM", { locale: es })}`,
        values: [Math.round(hours * 10) / 10],
        extra: `${list.length} ${list.length === 1 ? "turno" : "turnos"}${surgeries ? ` · ${surgeries} ${surgeries === 1 ? "cirugía" : "cirugías"}` : ""}`,
      };
    });
  }, [appointments, now]);
  const capacity = settings ? Math.round((Number(settings.monthly_hours) * 12) / 52) : 0;

  return (
    <section className="mt-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Turnos que quedan por dar</p>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Hoy" value={loading ? <Skeleton className="h-8 w-12" /> : counts.today} icon={<CalendarClock />} tone="accent" hint="Lo que falta atender hoy" />
        <Kpi label="Esta semana" value={loading ? <Skeleton className="h-8 w-12" /> : counts.week} icon={<CalendarRange />} hint="Hasta el domingo" />
        <Kpi label="Este mes" value={loading ? <Skeleton className="h-8 w-12" /> : counts.month} icon={<CalendarRange />} hint={`Hasta el ${format(endOfMonth(now), "d 'de' MMMM", { locale: es })}`} />
        <Kpi label="Próximas 9 semanas" value={loading ? <Skeleton className="h-8 w-12" /> : counts.all} icon={<CalendarRange />} hint="Pendientes y confirmados" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="p-4 md:p-5 lg:col-span-7">
          <SectionTitle title="Carga de las próximas 8 semanas" subtitle={capacity ? `Horas agendadas vs. tu capacidad (${capacity} h por semana, según Ajustes)` : "Horas agendadas por semana"} />
          <div className="mt-5">
            {loading ? (
              <Skeleton className="h-52 rounded-2xl" />
            ) : (
              <ColumnChart
                data={weeks}
                series={[{ name: "Horas agendadas", color: SERIES.income }]}
                formatValue={(v) => `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`}
                formatTick={(v) => `${v}`}
                reference={capacity ? { value: capacity, label: `Capacidad ${capacity} h` } : undefined}
                caption="Horas agendadas por semana"
              />
            )}
          </div>
        </Card>

        <Card className="p-4 md:p-5 lg:col-span-5">
          <SectionTitle
            title="Próximos turnos"
            action={
              <Link href="/agenda" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-ink hover:underline">
                Agenda <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="mt-3">
            {loading ? (
              <Skeleton className="h-52 rounded-2xl" />
            ) : upcoming.length === 0 ? (
              <EmptyState icon={<CalendarClock />} title="No hay turnos por delante" description="Cuando agendes o confirmes solicitudes, aparecen acá." className="py-8" />
            ) : (
              <ul className="divide-y divide-line/70">
                {upcoming.slice(0, 7).map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => open({ type: "appointment", id: a.id })} className="flex w-full items-center gap-3 py-2.5 text-left">
                      <div className="w-16 shrink-0">
                        <p className="text-[11px] font-medium capitalize text-muted">{relativeDay(a.starts_at)}</p>
                        <p className="text-sm font-semibold tabular-nums text-ink">{time(a.starts_at)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{a.patient?.full_name ?? a.title}</p>
                        {a.treatment ? <TreatmentTag name={a.treatment.name} color={a.treatment.color} className="mt-0.5 h-5 text-[11px]" /> : null}
                      </div>
                      <StatusBadge status={a.status} className="hidden sm:inline-flex" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {upcoming.length > 7 ? <p className="pt-2 text-center text-xs text-muted">y {upcoming.length - 7} más</p> : null}
          </div>
        </Card>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tendencias (6 meses hasta el mes elegido)
// ---------------------------------------------------------------------------
function Trends({
  appointments,
  stats,
  month,
  now,
  settings,
  loading,
}: {
  appointments: GoalAppointment[];
  stats: ReturnType<typeof useGoalStats>["data"];
  month: Date;
  now: Date;
  settings: Settings | undefined;
  loading: boolean;
}) {
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => subMonths(month, 5 - i)), [month]);

  const outcomes = useMemo<ColumnDatum[]>(
    () =>
      months.map((m) => {
        const list = appointments.filter((a) => isSameMonth(new Date(a.starts_at), m) && new Date(a.starts_at) <= now);
        const attended = list.filter((a) => a.status === "atendido").length;
        const absent = list.filter((a) => a.status === "ausente").length;
        const cancelled = list.filter((a) => a.status === "cancelado").length;
        const rate = attended + absent ? (absent / (attended + absent)) * 100 : null;
        return {
          key: m.toISOString(),
          label: monthLabel(m),
          longLabel: format(m, "MMMM yyyy", { locale: es }),
          values: [attended, absent, cancelled],
          dim: m > now,
          extra: rate != null ? `Ausentismo ${percent(rate)}` : undefined,
        };
      }),
    [months, appointments, now],
  );
  const selected = outcomes[outcomes.length - 1];
  const absentRate = selected && selected.values[0] + selected.values[1] ? (selected.values[1] / (selected.values[0] + selected.values[1])) * 100 : null;

  const newPatients = useMemo<ColumnDatum[]>(
    () =>
      months.map((m) => {
        const n = (stats?.patients ?? []).filter((p) => isSameMonth(new Date(p.created_at), m)).length;
        return { key: m.toISOString(), label: monthLabel(m), longLabel: format(m, "MMMM yyyy", { locale: es }), values: [n] };
      }),
    [months, stats],
  );

  const sources = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of stats?.patients ?? []) {
      if (new Date(p.created_at) >= addMonths(month, 1)) continue;
      const key = p.source?.trim() || "Sin dato";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [stats, month]);

  // Demanda por día y hora (turnos no cancelados del período).
  const heat = useMemo(() => {
    const start = settings?.day_start ?? 8;
    const end = settings?.day_end ?? 20;
    const hours = Array.from({ length: Math.max(1, end - start) }, (_, i) => start + i);
    const days = [1, 2, 3, 4, 5, 6, 0];
    const matrix = days.map(() => hours.map(() => 0));
    const limit = addMonths(month, 1);
    for (const a of appointments) {
      const d = new Date(a.starts_at);
      if (a.status === "cancelado" || d >= limit || d > now) continue;
      const ri = days.indexOf(d.getDay());
      const ci = d.getHours() - start;
      if (ri >= 0 && ci >= 0 && ci < hours.length) matrix[ri][ci] += 1;
    }
    // Sábado y domingo solo si tuvieron turnos.
    const keep = days.map((_, i) => i < 5 || matrix[i].some((v) => v > 0));
    return {
      days: days.filter((_, i) => keep[i]),
      matrix: matrix.filter((_, i) => keep[i]),
      hours,
    };
  }, [appointments, settings, month, now]);

  const online = useMemo(() => {
    const inMonth = appointments.filter((a) => isSameMonth(new Date(a.starts_at), month) && a.status !== "cancelado");
    const fromOnline = inMonth.filter((a) => a.source === "online").length;
    const requests = (stats?.requests ?? []).filter((r) => isSameMonth(new Date(r.created_at), month));
    const confirmed = requests.filter((r) => r.status === "confirmado").length;
    const decided = requests.filter((r) => r.status === "confirmado" || r.status === "rechazado").length;
    return { share: inMonth.length ? (fromOnline / inMonth.length) * 100 : null, fromOnline, received: requests.length, confirmRate: decided ? (confirmed / decided) * 100 : null };
  }, [appointments, stats, month]);

  const monthName = format(month, "MMMM", { locale: es });
  const daysLeftInMonth = differenceInCalendarDays(endOfMonth(month), now);

  return (
    <section className="mt-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Tendencias · últimos 6 meses</p>
      <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="p-4 md:p-5 lg:col-span-7">
          <SectionTitle
            title="Cómo terminan los turnos"
            subtitle={absentRate != null ? `Ausentismo en ${monthName}: ${percent(absentRate)} de los turnos que tenían que venir` : "Atendidos, ausentes y cancelados por mes"}
          />
          <div className="mt-4">
            {loading ? (
              <Skeleton className="h-60 rounded-2xl" />
            ) : (
              <ColumnChart
                data={outcomes}
                series={[
                  { name: "Atendidos", color: COMPOSITION[0] },
                  { name: "Ausentes", color: COMPOSITION[1] },
                  { name: "Cancelados", color: COMPOSITION[2] },
                ]}
                formatValue={(v) => number(v)}
                caption="Resultado de los turnos por mes"
                height={220}
              />
            )}
          </div>
        </Card>

        <Card className="p-4 md:p-5 lg:col-span-5">
          <SectionTitle title="Reservas online" subtitle={capitalize(monthName)} />
          {loading ? (
            <Skeleton className="mt-4 h-40 rounded-2xl" />
          ) : (
            <dl className="mt-4 grid grid-cols-3 gap-3">
              <Figure label="Solicitudes" value={number(online.received)} hint="recibidas" />
              <Figure label="Confirmadas" value={online.confirmRate != null ? percent(online.confirmRate) : "—"} hint="de las resueltas" />
              <Figure label="Turnos online" value={online.share != null ? percent(online.share) : "—"} hint={`${online.fromOnline} del mes`} />
            </dl>
          )}
          <Link href="/solicitudes" className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-subtle px-4 py-3 text-sm transition-colors hover:bg-sunken">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">Compartí el link de reservas</span>
              <span className="block truncate text-xs text-muted">En tu bio de Instagram o por WhatsApp: las pacientes eligen día y hora solas</span>
            </span>
            <ArrowRight className="size-4 text-muted" />
          </Link>
          {isSameMonth(month, now) && daysLeftInMonth >= 0 ? (
            <p className="mt-3 text-xs text-muted">Quedan {daysLeftInMonth + 1} días en el mes.</p>
          ) : null}
        </Card>

        <Card className="p-4 md:p-5 lg:col-span-7">
          <SectionTitle title="¿Cuándo hay más turnos?" subtitle="Turnos atendidos o agendados por día y hora · 6 meses" />
          <div className="mt-4">
            {loading ? (
              <Skeleton className="h-52 rounded-2xl" />
            ) : (
              <Heatmap
                rows={heat.days.map((d) => SHORT_DAYS[d])}
                cols={heat.hours.map((h) => String(h))}
                matrix={heat.matrix}
                caption="Turnos por día de la semana y hora"
                describe={(ri, ci, v) => `${SHORT_DAYS[heat.days[ri]]} ${heat.hours[ci]} h · ${v} ${v === 1 ? "turno" : "turnos"}`}
              />
            )}
          </div>
        </Card>

        <Card className="p-4 md:p-5 lg:col-span-5">
          <SectionTitle title="Pacientes nuevos" subtitle="Fichas creadas por mes y cómo llegaron" />
          <div className="mt-4">
            {loading ? (
              <Skeleton className="h-40 rounded-2xl" />
            ) : (
              <ColumnChart
                data={newPatients}
                series={[{ name: "Pacientes nuevos", color: SERIES.income }]}
                formatValue={(v) => number(v)}
                caption="Pacientes nuevos por mes"
                height={130}
              />
            )}
          </div>
          <div className="mt-6">
            {loading ? null : (
              <BarList
                emptyLabel="Todavía no hay pacientes nuevos en el período"
                formatValue={(v) => number(v)}
                items={sources.map(([name, count]) => ({ key: name, label: name, value: count }))}
              />
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-subtle px-3 py-3">
      <dt className="truncate text-[11px] font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-display text-[22px] leading-none text-ink">{value}</dd>
      <dd className="mt-1 truncate text-[11px] text-muted">{hint}</dd>
    </div>
  );
}

