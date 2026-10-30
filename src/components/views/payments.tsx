"use client";

import { useMemo, useState } from "react";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Banknote, CircleDollarSign, HandCoins, MessageCircle, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState, Kpi, PageHeader, PeriodNav, Progress, SectionTitle, Segmented, Skeleton, TreatmentTag } from "@/components/ui/misc";
import { BarList } from "@/components/views/charts";
import { useOverlay } from "@/components/shell/overlay-store";
import { useSettings } from "@/lib/queries/catalog";
import { useBalances, usePaymentsRange, type BalanceRow } from "@/lib/queries/money";
import { useRole } from "@/lib/queries/session";
import { capitalize, fmt, isoDate, money, relativeDay, toArs } from "@/lib/format";
import { cn, firstName, groupBy, whatsappLink } from "@/lib/utils";
import { METHOD_META, METHOD_ORDER } from "@/lib/types";

export function PaymentsView() {
  const { open } = useOverlay();
  const { isAdmin } = useRole();
  const { data: settings } = useSettings();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [tab, setTab] = useState<"movimientos" | "por-cobrar">("movimientos");
  const from = isoDate(month);
  const to = isoDate(endOfMonth(month));
  const { data: payments = [], isLoading } = usePaymentsRange(from, to);
  const { data: balances = [], isLoading: loadingBalances } = useBalances();
  const usdRate = settings?.usd_rate ?? 1;

  const summary = useMemo(() => {
    const totalArs = payments.reduce((t, p) => t + (p.amount_ars ?? 0), 0);
    const usd = payments.filter((p) => p.currency === "USD").reduce((t, p) => t + p.amount, 0);
    const byMethod = METHOD_ORDER.map((m) => ({
      key: m,
      label: METHOD_META[m].label,
      value: payments.filter((p) => p.method === m).reduce((t, p) => t + (p.amount_ars ?? 0), 0),
      count: payments.filter((p) => p.method === m).length,
    })).filter((m) => m.value > 0);
    const byDay = [...groupBy(payments, (p) => p.paid_on).entries()];
    return { totalArs, usd, byMethod, byDay, avg: payments.length ? totalArs / payments.length : 0 };
  }, [payments]);

  const receivable = useMemo(() => {
    const today = isoDate(new Date());
    const overdue: BalanceRow[] = [];
    const upcoming: BalanceRow[] = [];
    let totalArs = 0;
    for (const b of balances) {
      totalArs += toArs(b.balance ?? 0, b.currency ?? "ARS", usdRate);
      if ((b.starts_at ?? "").slice(0, 10) < today) overdue.push(b);
      else upcoming.push(b);
    }
    return { overdue, upcoming, totalArs };
  }, [balances, usdRate]);

  const isCurrentMonth = format(month, "yyyy-MM") === format(new Date(), "yyyy-MM");

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Cobros"
        subtitle="Ingresos de pacientes: señas, saldos y consultas"
        actions={
          <Button variant="success" onClick={() => open({ type: "payment-form" })}>
            <Wallet className="size-4" /> Registrar cobro
          </Button>
        }
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <PeriodNav
          label={<span className="inline-block min-w-32">{capitalize(format(month, "MMMM yyyy", { locale: es }))}</span>}
          onPrev={() => setMonth((m) => addMonths(m, -1))}
          onNext={() => setMonth((m) => addMonths(m, 1))}
          onToday={isCurrentMonth ? undefined : () => setMonth(startOfMonth(new Date()))}
          todayLabel="Este mes"
        />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "movimientos", label: "Movimientos" },
            { value: "por-cobrar", label: "Por cobrar", count: balances.length },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cobrado" value={isLoading ? <Skeleton className="h-8 w-28" /> : money(summary.totalArs)} icon={<HandCoins />} tone="accent" hint="Total en pesos (USD a la cotización del día)" />
        <Kpi label="En dólares" value={money(summary.usd, "USD")} icon={<Banknote />} hint="Suma de cobros en USD" />
        <Kpi label="Cobros" value={payments.length} icon={<Receipt />} hint={payments.length ? `Promedio ${money(summary.avg)}` : "Sin movimientos"} />
        <Kpi label="Por cobrar" value={money(receivable.totalArs)} icon={<CircleDollarSign />} tone={balances.length ? "warning" : "neutral"} hint={`${receivable.overdue.length} vencidos · ${receivable.upcoming.length} a futuro`} />
      </div>

      {tab === "movimientos" ? (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <Card className="overflow-hidden lg:col-span-8">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : payments.length === 0 ? (
              <EmptyState
                icon={<Wallet />}
                title="Sin cobros en este mes"
                description="Registrá señas, saldos y consultas. Si el cobro corresponde a un turno, se descuenta del saldo del paciente."
                action={
                  <Button variant="success" onClick={() => open({ type: "payment-form" })}>
                    <Wallet className="size-4" /> Registrar cobro
                  </Button>
                }
              />
            ) : (
              <div>
                {summary.byDay.map(([day, list]) => (
                  <section key={day}>
                    <div className="sticky top-14 z-[1] flex items-center justify-between border-b border-line bg-subtle/95 px-4 py-2 backdrop-blur md:top-0 md:px-5">
                      <span className="text-xs font-semibold capitalize text-ink-2">{relativeDay(day, true)}</span>
                      <span className="text-xs font-semibold tabular-nums text-ink-2">{money(list.reduce((t, p) => t + (p.amount_ars ?? 0), 0))}</span>
                    </div>
                    <ul className="divide-y divide-line/70">
                      {list.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => (isAdmin ? open({ type: "payment-form", paymentId: p.id }) : p.patient && open({ type: "patient", id: p.patient.id }))}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle md:px-5"
                          >
                            <Avatar name={p.patient?.full_name} size={36} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-ink">{p.patient?.full_name}</span>
                              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                                {p.appointment?.treatment ? <TreatmentTag name={p.appointment.treatment.name} color={p.appointment.treatment.color} className="h-5 text-[11px]" /> : null}
                                <span className="truncate">
                                  {p.concept ? `${p.concept} · ` : ""}
                                  {METHOD_META[p.method].label}
                                </span>
                              </span>
                            </span>
                            <span className="text-right">
                              <span className="block text-sm font-semibold tabular-nums text-success">+{money(p.amount, p.currency)}</span>
                              {p.currency === "USD" ? <span className="block text-[11px] tabular-nums text-muted">{money(p.amount_ars)}</span> : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Card>
          <Card className="h-fit p-4 md:p-5 lg:col-span-4">
            <SectionTitle title="Por medio de pago" subtitle={capitalize(format(month, "MMMM", { locale: es }))} />
            <div className="mt-4">
              <BarList
                emptyLabel="Sin cobros este mes"
                items={summary.byMethod.map((m) => ({ key: m.key, label: m.label, value: m.value, hint: `· ${m.count}` }))}
              />
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {loadingBalances ? (
            <Skeleton className="h-48 rounded-card" />
          ) : balances.length === 0 ? (
            <Card>
              <EmptyState icon={<CircleDollarSign />} title="No hay saldos pendientes" description="Todos los turnos con precio están pagos. ¡Excelente!" />
            </Card>
          ) : (
            <>
              {receivable.overdue.length ? <BalanceList title="Vencidos" subtitle="Turnos que ya pasaron y tienen saldo" rows={receivable.overdue} tone="danger" /> : null}
              {receivable.upcoming.length ? <BalanceList title="A cobrar" subtitle="Turnos y cirugías próximas con saldo" rows={receivable.upcoming} /> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BalanceList({ title, subtitle, rows, tone }: { title: string; subtitle: string; rows: BalanceRow[]; tone?: "danger" }) {
  const { open } = useOverlay();
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3 md:px-5">
        <SectionTitle title={`${title} · ${rows.length}`} subtitle={subtitle} />
      </div>
      <ul className="divide-y divide-line/70">
        {rows.map((b) => {
          const ratio = b.price ? Math.min(1, (b.paid ?? 0) / b.price) : 0;
          const wa = whatsappLink(
            b.patient?.phone,
            `Hola ${firstName(b.patient?.full_name)}! Te escribimos del consultorio del Dr. Ignacio Ormaechea. Te recordamos que quedó un saldo de ${money(b.balance, b.currency ?? "ARS")} correspondiente a ${b.treatment?.name ?? "tu tratamiento"}. ¡Muchas gracias!`,
          );
          return (
            <li key={b.id} className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center md:px-5">
              <button type="button" onClick={() => b.id && open({ type: "appointment", id: b.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar name={b.patient?.full_name} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{b.patient?.full_name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    {b.treatment ? <TreatmentTag name={b.treatment.name} color={b.treatment.color} className="h-5 text-[11px]" /> : null}
                    <span className="capitalize">{b.starts_at ? fmt(b.starts_at, "EEE d MMM") : ""}</span>
                  </span>
                  <Progress value={ratio * 100} tone={tone === "danger" ? "danger" : "accent"} className="mt-2 max-w-xs" />
                </span>
              </button>
              <div className="flex items-center gap-3 md:w-auto">
                <span className="flex-1 text-left md:w-36 md:flex-none md:text-right">
                  <span className={cn("block text-sm font-semibold tabular-nums", tone === "danger" ? "text-danger" : "text-ink")}>{money(b.balance, b.currency ?? "ARS")}</span>
                  <span className="block text-[11px] tabular-nums text-muted">
                    de {money(b.price, b.currency ?? "ARS")}
                  </span>
                </span>
                {wa ? (
                  <a href={wa} target="_blank" rel="noreferrer" aria-label="Recordar saldo por WhatsApp" className="flex size-9 items-center justify-center rounded-xl bg-[#e7f6ec] text-[#1d6b3c] transition-colors hover:bg-[#dcf1e4]">
                    <MessageCircle className="size-4" />
                  </a>
                ) : null}
                <Button size="sm" variant="soft" onClick={() => b.patient_id && b.id && open({ type: "payment-form", patientId: b.patient_id, appointmentId: b.id })}>
                  Cobrar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
