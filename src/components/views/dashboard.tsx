"use client";

import { useMemo } from "react";
import Link from "next/link";
import { addDays, addMonths, endOfDay, format, isSameDay, startOfDay, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarPlus,
  CircleDollarSign,
  ClipboardList,
  HandCoins,
  MessageCircle,
  Receipt,
  Scale,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, ColorDot, EmptyState, Kpi, PageHeader, Progress, SectionTitle, Skeleton, StatusBadge, TreatmentTag } from "@/components/ui/misc";
import { useOverlay } from "@/components/shell/overlay-store";
import { reminderText } from "@/components/forms/appointment-sheet";
import { BarList, IncomeExpenseChart, type MonthDatum } from "@/components/views/charts";
import { useAppointmentsRange, useUpdateAppointment, useWaitlist } from "@/lib/queries/agenda";
import { useRecurringExpenses, useSettings } from "@/lib/queries/catalog";
import { useBalances, useExpensesRange, usePayables, useStats } from "@/lib/queries/money";
import { useRole } from "@/lib/queries/session";
import { useNow } from "@/lib/hooks";
import { appointmentPaid } from "@/lib/money-helpers";
import { capitalize, fmt, isoDate, money, percent, relativeDay, time, toArs } from "@/lib/format";
import { treatmentColor } from "@/lib/colors";
import { cn, errorMessage, firstName, whatsappLink } from "@/lib/utils";
import { STATUS_META, type AppointmentStatus, type CalendarAppointment } from "@/lib/types";

function greeting(date: Date) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Buenos días";
  if (h >= 12 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

export function DashboardView() {
  const now = useNow(60_000);
  const { isAdmin, member } = useRole();
  const { open } = useOverlay();
  const { data: settings } = useSettings();
  const usdRate = settings?.usd_rate ?? 1;

  const dayKey = isoDate(now);
  const rangeStart = useMemo(() => startOfDay(new Date(`${dayKey}T00:00`)), [dayKey]);
  const rangeEnd = useMemo(() => endOfDay(addDays(rangeStart, 21)), [rangeStart]);
  const { data: appts = [], isLoading: loadingAppts } = useAppointmentsRange(rangeStart, rangeEnd);

  const monthStart = startOfMonth(now);
  const statsFrom = isoDate(subMonths(monthStart, 5));
  const { data: stats, isLoading: loadingStats } = useStats(statsFrom, isAdmin);
  const { data: balances = [] } = useBalances();
  const { data: payables = [] } = usePayables(isAdmin);
  const { data: waitlist = [] } = useWaitlist();
  const { data: recurring = [] } = useRecurringExpenses(isAdmin);
  const { data: monthExpenses = [] } = useExpensesRange(isoDate(monthStart), isoDate(endOfDay(addDays(addMonths(monthStart, 1), -1))), isAdmin);

  const today = useMemo(() => appts.filter((a) => isSameDay(new Date(a.starts_at), now) && a.status !== "cancelado"), [appts, now]);
  const tomorrowPending = useMemo(
    () => appts.filter((a) => isSameDay(new Date(a.starts_at), addDays(now, 1)) && a.status === "pendiente" && a.patient_id),
    [appts, now],
  );
  const surgeries = useMemo(
    () =>
      appts
        .filter((a) => a.treatment?.kind === "cirugia" && a.status !== "cancelado" && new Date(a.ends_at) >= now)
        .slice(0, 6),
    [appts, now],
  );

  const money_ = useMemo(() => {
    const payments = stats?.payments ?? [];
    const expenses = stats?.expenses ?? [];
    const monthKey = format(now, "yyyy-MM");
    const prevKey = format(subMonths(now, 1), "yyyy-MM");
    const day = now.getDate();
    const income = payments.filter((p) => p.paid_on.startsWith(monthKey)).reduce((t, p) => t + (p.amount_ars ?? 0), 0);
    const incomePrevSamePeriod = payments
      .filter((p) => p.paid_on.startsWith(prevKey) && Number(p.paid_on.slice(8, 10)) <= day)
      .reduce((t, p) => t + (p.amount_ars ?? 0), 0);
    const incomeToday = payments.filter((p) => p.paid_on === dayKey).reduce((t, p) => t + (p.amount_ars ?? 0), 0);
    const expense = expenses.filter((e) => e.due_on.startsWith(monthKey)).reduce((t, e) => t + (e.amount_ars ?? 0), 0);
    const expensePending = expenses.filter((e) => e.due_on.startsWith(monthKey) && !e.paid_on).length;

    const months: MonthDatum[] = Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(monthStart, 5 - i);
      const key = format(m, "yyyy-MM");
      return {
        key,
        label: format(m, "MMM", { locale: es }).replace(".", ""),
        longLabel: format(m, "MMMM yyyy", { locale: es }),
        income: payments.filter((p) => p.paid_on.startsWith(key)).reduce((t, p) => t + (p.amount_ars ?? 0), 0),
        expense: expenses.filter((e) => e.due_on.startsWith(key)).reduce((t, e) => t + (e.amount_ars ?? 0), 0),
      };
    });

    const byTreatment = new Map<string, { key: string; name: string; color: string; value: number; count: number }>();
    for (const p of payments.filter((p) => p.paid_on.startsWith(monthKey))) {
      const t = p.appointment?.treatment;
      const key = t?.id ?? "otros";
      const entry = byTreatment.get(key) ?? { key, name: t?.name ?? "Otros cobros", color: t?.color ?? "stone", value: 0, count: 0 };
      entry.value += p.amount_ars ?? 0;
      entry.count += 1;
      byTreatment.set(key, entry);
    }

    return {
      income,
      incomePrevSamePeriod,
      incomeToday,
      expense,
      expensePending,
      months,
      byTreatment: [...byTreatment.values()].sort((a, b) => b.value - a.value).slice(0, 6),
    };
  }, [stats, now, monthStart, dayKey]);

  const receivable = useMemo(() => {
    let ars = 0;
    let usd = 0;
    for (const b of balances) {
      if (b.currency === "USD") usd += b.balance ?? 0;
      else ars += b.balance ?? 0;
    }
    return { ars, usd, totalArs: ars + toArs(usd, "USD", usdRate), count: balances.length };
  }, [balances, usdRate]);

  const fixedPending = useMemo(() => {
    if (!isAdmin) return [];
    const paidIds = new Set(monthExpenses.filter((e) => e.recurring_id).map((e) => e.recurring_id));
    return recurring.filter((r) => r.active && !paidIds.has(r.id));
  }, [isAdmin, recurring, monthExpenses]);

  const delta = money_.incomePrevSamePeriod > 0 ? ((money_.income - money_.incomePrevSamePeriod) / money_.incomePrevSamePeriod) * 100 : null;
  const result = money_.income - money_.expense;
  const monthName = format(now, "MMMM", { locale: es });

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title={
          <>
            {greeting(now)}, <span className="text-accent">{firstName(member?.full_name) || "Doctor"}</span>
          </>
        }
        subtitle={
          <>
            {capitalize(format(now, "EEEE d 'de' MMMM", { locale: es }))}
            {loadingAppts ? null : today.length ? ` · ${today.length} ${today.length === 1 ? "turno" : "turnos"} hoy` : " · sin turnos hoy"}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => open({ type: "payment-form" })} className="hidden sm:inline-flex">
              <Wallet className="size-4" /> Registrar cobro
            </Button>
            <Button onClick={() => open({ type: "appointment-form" })} className="hidden sm:inline-flex">
              <CalendarPlus className="size-4" /> Nuevo turno
            </Button>
          </>
        }
      />

      {/* KPIs */}
      {isAdmin ? (
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted md:mt-8">
          {capitalize(monthName)} en números
        </p>
      ) : null}
      <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", isAdmin ? "mt-3" : "mt-6 md:mt-8")}>
        {isAdmin ? (
          <>
            <Kpi
              label="Cobrado"
              value={loadingStats ? <Skeleton className="h-8 w-32" /> : money(money_.income)}
              icon={<HandCoins />}
              tone="accent"
              hint={
                delta == null ? (
                  "Ingresos de pacientes del mes"
                ) : (
                  <span
                    title="Comparado con el mismo período del mes anterior"
                    className={cn("inline-flex items-center gap-1 font-medium", delta >= 0 ? "text-success" : "text-danger")}
                  >
                    {delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                    {percent(Math.abs(delta))} vs. {format(subMonths(now, 1), "MMM", { locale: es }).replace(".", "")}
                  </span>
                )
              }
            />
            <Kpi
              label="Egresos"
              value={loadingStats ? <Skeleton className="h-8 w-32" /> : money(money_.expense)}
              icon={<Receipt />}
              hint={money_.expensePending ? `${money_.expensePending} pendientes de pago` : "Fijos, variables y proveedores"}
            />
            <Kpi
              label="Resultado"
              value={loadingStats ? <Skeleton className="h-8 w-32" /> : <span className={result < 0 ? "text-danger" : undefined}>{money(result)}</span>}
              icon={<Scale />}
              tone={result >= 0 ? "success" : "danger"}
              hint={money_.income > 0 ? `Margen ${percent((result / money_.income) * 100)}` : "Cobrado menos egresos"}
            />
            <Kpi
              label="Por cobrar"
              value={settings ? money(receivable.totalArs) : <Skeleton className="h-8 w-32" />}
              icon={<CircleDollarSign />}
              tone={receivable.count ? "warning" : "neutral"}
              hint={
                receivable.count
                  ? [receivable.usd > 0 ? money(receivable.usd, "USD") : null, receivable.ars > 0 ? money(receivable.ars) : null].filter(Boolean).join(" + ")
                  : "Nada pendiente"
              }
            />
          </>
        ) : (
          <>
            <Kpi label="Turnos hoy" value={today.length} icon={<CalendarCheck2 />} tone="accent" hint={`${today.filter((a) => a.status === "atendido").length} atendidos`} />
            <Kpi label="Confirmar para mañana" value={tomorrowPending.length} icon={<MessageCircle />} tone={tomorrowPending.length ? "warning" : "neutral"} hint="Recordatorios por WhatsApp" />
            <Kpi label="Cobrado hoy" value={money(money_.incomeToday)} icon={<HandCoins />} hint="Caja del día" />
            <Kpi label="Por agendar" value={waitlist.length} icon={<ClipboardList />} hint="Pacientes esperando fecha" />
          </>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Hoy */}
        <Card className="p-4 md:p-5 lg:col-span-7">
          <SectionTitle
            title="Agenda de hoy"
            subtitle={today.length ? `${today.filter((a) => a.status === "atendido").length} de ${today.length} atendidos` : undefined}
            action={
              <Link href="/agenda" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-ink hover:underline">
                Ver agenda <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="mt-4">
            {loadingAppts ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-2xl" />
                ))}
              </div>
            ) : today.length === 0 ? (
              <EmptyState
                icon={<CalendarCheck2 />}
                title="Día libre en la agenda"
                description="No hay turnos para hoy. Podés dar uno nuevo o revisar los pacientes por agendar."
                action={
                  <Button variant="secondary" onClick={() => open({ type: "appointment-form" })}>
                    <CalendarPlus className="size-4" /> Dar un turno
                  </Button>
                }
                className="py-8"
              />
            ) : (
              <TodayTimeline appointments={today} now={now} />
            )}
          </div>
        </Card>

        {/* Próximas cirugías */}
        <Card className="p-4 md:p-5 lg:col-span-5">
          <SectionTitle title="Próximas cirugías" subtitle="Próximas 3 semanas" />
          <div className="mt-4 space-y-2">
            {loadingAppts ? (
              <Skeleton className="h-40 rounded-2xl" />
            ) : surgeries.length === 0 ? (
              <EmptyState icon={<Stethoscope />} title="Sin cirugías programadas" description="Las cirugías de las próximas 3 semanas aparecen acá con su estado de pago." className="py-8" />
            ) : (
              surgeries.map((a) => <SurgeryRow key={a.id} appt={a} now={now} onClick={() => open({ type: "appointment", id: a.id })} />)
            )}
          </div>
        </Card>

        {/* Confirmaciones de mañana */}
        {tomorrowPending.length ? (
          <Card className="p-4 md:p-5 lg:col-span-7">
            <SectionTitle title="Confirmar turnos de mañana" subtitle="Enviá el recordatorio por WhatsApp y marcá la respuesta" />
            <div className="mt-4 divide-y divide-line/70">
              {tomorrowPending.map((a) => (
                <ConfirmRow key={a.id} appt={a} />
              ))}
            </div>
          </Card>
        ) : null}

        {/* Alertas */}
        {isAdmin && (payables.length || fixedPending.length) ? (
          <Card className={cn("p-4 md:p-5", tomorrowPending.length ? "lg:col-span-5" : "lg:col-span-12")}>
            <SectionTitle title="Pendientes de pago" subtitle="Lo que tenés que pagar" />
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {fixedPending.length ? (
                <Link href="/gastos" className="flex items-center gap-3 rounded-2xl border border-line bg-subtle px-4 py-3 transition-colors hover:bg-sunken">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-warning-soft text-warning">
                    <Receipt className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{fixedPending.length} gastos fijos de {monthName}</span>
                    <span className="block truncate text-xs text-muted">{fixedPending.slice(0, 3).map((r) => r.description).join(", ")}</span>
                  </span>
                  <ArrowRight className="size-4 text-muted" />
                </Link>
              ) : null}
              {payables.length ? (
                <Link href="/proveedores" className="flex items-center gap-3 rounded-2xl border border-line bg-subtle px-4 py-3 transition-colors hover:bg-sunken">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-info-soft text-info">
                    <Wallet className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{money(payables.reduce((t, e) => t + (e.amount_ars ?? 0), 0))} a proveedores</span>
                    <span className="block truncate text-xs text-muted">
                      {payables.length} {payables.length === 1 ? "pago pendiente" : "pagos pendientes"}
                      {payables.some((e) => e.due_on < dayKey) ? " · hay vencidos" : ""}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-muted" />
                </Link>
              ) : null}
            </div>
          </Card>
        ) : null}

        {/* Finanzas */}
        {isAdmin ? (
          <>
            <Card className="p-4 md:p-5 lg:col-span-7">
              <SectionTitle title="Ingresos y egresos" subtitle="Últimos 6 meses, en pesos" />
              <div className="mt-4">{loadingStats ? <Skeleton className="h-60 rounded-2xl" /> : <IncomeExpenseChart data={money_.months} />}</div>
            </Card>
            <Card className="p-4 md:p-5 lg:col-span-5">
              <SectionTitle title={`Ingresos por tratamiento`} subtitle={capitalize(monthName)} />
              <div className="mt-4">
                {loadingStats ? (
                  <Skeleton className="h-48 rounded-2xl" />
                ) : (
                  <BarList
                    emptyLabel="Todavía no hay cobros este mes"
                    items={money_.byTreatment.map((t) => ({
                      key: t.key,
                      label: t.name,
                      value: t.value,
                      marker: <ColorDot color={t.color} />,
                      hint: `· ${t.count}`,
                    }))}
                  />
                )}
              </div>
            </Card>
          </>
        ) : waitlist.length ? (
          <Card className="p-4 md:p-5 lg:col-span-5">
            <SectionTitle title="Por agendar" subtitle="Pacientes esperando fecha" />
            <div className="mt-3 divide-y divide-line/70">
              {waitlist.slice(0, 5).map((w) => (
                <button key={w.id} type="button" onClick={() => w.patient && open({ type: "patient", id: w.patient.id })} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <Avatar name={w.patient?.full_name} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{w.patient?.full_name}</span>
                  {w.treatment ? <TreatmentTag name={w.treatment.name} color={w.treatment.color} /> : null}
                </button>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function TodayTimeline({ appointments, now }: { appointments: CalendarAppointment[]; now: Date }) {
  const { open } = useOverlay();
  const update = useUpdateAppointment();
  const nextId = appointments.find((a) => new Date(a.starts_at) > now)?.id;

  const setStatus = async (a: CalendarAppointment, status: AppointmentStatus) => {
    const previous = a.status;
    try {
      await update.mutateAsync({ id: a.id, patch: { status } });
      toast.success(`${a.patient?.full_name ?? "Turno"}: ${STATUS_META[status].label.toLowerCase()}`, {
        action: { label: "Deshacer", onClick: () => update.mutate({ id: a.id, patch: { status: previous } }) },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <ol className="relative space-y-2">
      {appointments.map((a) => {
        const start = new Date(a.starts_at);
        const end = new Date(a.ends_at);
        const isNow = start <= now && end > now;
        const isNext = a.id === nextId;
        const done = a.status === "atendido" || a.status === "ausente";
        const action: { label: string; status: AppointmentStatus } | null =
          a.status === "pendiente"
            ? { label: "Confirmar", status: "confirmado" }
            : a.status === "confirmado"
              ? { label: "Llegó", status: "en_sala" }
              : a.status === "en_sala"
                ? { label: "Atendido", status: "atendido" }
                : null;
        return (
          <li key={a.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => open({ type: "appointment", id: a.id })}
              onKeyDown={(e) => e.key === "Enter" && open({ type: "appointment", id: a.id })}
              className={cn(
                "group flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition-[background-color,border-color] md:px-4",
                isNow ? "border-accent/40 bg-accent-soft/50" : "border-line bg-surface hover:bg-subtle",
                done && "opacity-60",
              )}
            >
              <div className="w-12 shrink-0 text-center">
                <p className="text-[15px] font-semibold tabular-nums text-ink">{time(start)}</p>
                <p className="text-[11px] tabular-nums text-muted">{time(end)}</p>
              </div>
              <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: treatmentColor(a.treatment?.color ?? "stone").solid }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink">{a.patient?.full_name ?? a.title}</p>
                  {isNow ? <Badge tone="accent" className="h-5 px-2 text-[10px] uppercase tracking-wide">Ahora</Badge> : isNext ? <Badge tone="info" className="h-5 px-2 text-[10px] uppercase tracking-wide">Próximo</Badge> : null}
                </div>
                <p className="truncate text-xs text-muted">{a.treatment?.name ?? (a.patient_id ? "Consulta" : "Bloqueo")}</p>
              </div>
              <div className="hidden sm:block">
                <StatusBadge status={a.status} />
              </div>
              {action && a.patient_id ? (
                <Button
                  size="sm"
                  variant={action.status === "atendido" ? "success" : "secondary"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setStatus(a, action.status);
                  }}
                >
                  {action.label}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SurgeryRow({ appt, now, onClick }: { appt: CalendarAppointment; now: Date; onClick: () => void }) {
  const paid = appointmentPaid(appt);
  const days = Math.ceil((startOfDay(new Date(appt.starts_at)).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const urgent = !paid.settled && paid.price > 0 && days <= 7;
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:bg-subtle">
      <div className="w-12 shrink-0 rounded-xl bg-subtle py-1.5 text-center">
        <p className="text-[10px] font-semibold uppercase text-muted">{fmt(appt.starts_at, "EEE")}</p>
        <p className="font-display text-lg leading-none text-ink">{fmt(appt.starts_at, "d")}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{appt.patient?.full_name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {appt.treatment ? <TreatmentTag name={appt.treatment.name} color={appt.treatment.color} className="h-5 text-[11px]" /> : null}
          <span className="text-[11px] text-muted">{relativeDay(appt.starts_at)} {time(appt.starts_at)}</span>
        </div>
        {paid.price > 0 ? <Progress value={paid.ratio * 100} tone={paid.settled ? "success" : urgent ? "danger" : "accent"} className="mt-2 h-1" /> : null}
      </div>
      <div className="shrink-0 text-right">
        {paid.price <= 0 ? null : paid.settled ? (
          <Badge tone="success">Pagada</Badge>
        ) : (
          <>
            <p className={cn("text-xs font-semibold tabular-nums", urgent ? "text-danger" : "text-ink")}>{money(paid.balance, appt.currency)}</p>
            <p className="text-[11px] text-muted">{urgent ? "falta cobrar" : "saldo"}</p>
          </>
        )}
      </div>
    </button>
  );
}

function ConfirmRow({ appt }: { appt: CalendarAppointment }) {
  const { data: settings } = useSettings();
  const update = useUpdateAppointment();
  const wa = whatsappLink(appt.patient?.phone, reminderText(appt, settings));
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Avatar name={appt.patient?.full_name} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{appt.patient?.full_name}</p>
        <p className="truncate text-xs text-muted">
          {time(appt.starts_at)} · {appt.treatment?.name ?? "Consulta"}
        </p>
      </div>
      {wa ? (
        <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#e7f6ec] px-2.5 text-xs font-semibold text-[#1d6b3c] transition-colors hover:bg-[#dcf1e4]">
          <MessageCircle className="size-3.5" /> <span className="hidden sm:inline">Recordar</span>
        </a>
      ) : (
        <span className="text-[11px] text-faint">Sin celular</span>
      )}
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          update.mutate(
            { id: appt.id, patch: { status: "confirmado" } },
            { onSuccess: () => toast.success(`${firstName(appt.patient?.full_name)} confirmó su turno`) },
          )
        }
      >
        Confirmó
      </Button>
    </div>
  );
}
