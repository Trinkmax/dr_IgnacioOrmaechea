"use client";

import { useMemo, useState } from "react";
import { addMonths, endOfMonth, format, getDaysInMonth, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Check, CircleDashed, Info, Pencil, Plus, Receipt, Repeat, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Kpi, PageHeader, PeriodNav, Progress, SectionTitle, Skeleton } from "@/components/ui/misc";
import { BarList } from "@/components/views/charts";
import { AdminOnly } from "@/components/views/admin-only";
import { useOverlay } from "@/components/shell/overlay-store";
import { useRecurringExpenses, useSettings } from "@/lib/queries/catalog";
import { useDeleteExpense, useExpensesRange, useSaveExpense } from "@/lib/queries/money";
import { useLocalState } from "@/lib/hooks";
import { capitalize, fmt, isoDate, money, toArs } from "@/lib/format";
import { cn, errorMessage } from "@/lib/utils";
import type { ExpenseWithRefs, RecurringExpense } from "@/lib/types";

export function ExpensesView() {
  return (
    <AdminOnly>
      <Expenses />
    </AdminOnly>
  );
}

function Expenses() {
  const { open } = useOverlay();
  const { data: settings } = useSettings();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const from = isoDate(month);
  const to = isoDate(endOfMonth(month));
  const { data: expenses = [], isLoading } = useExpensesRange(from, to);
  const { data: recurring = [], isLoading: loadingRecurring } = useRecurringExpenses();
  const save = useSaveExpense();
  const remove = useDeleteExpense();
  const [tipDismissed, setTipDismissed] = useLocalState("gastos:tip", false);
  const usdRate = settings?.usd_rate ?? 1;
  const today = isoDate(new Date());

  const dueDate = (r: RecurringExpense) => isoDate(new Date(month.getFullYear(), month.getMonth(), Math.min(r.due_day, getDaysInMonth(month))));

  const fixed = useMemo(() => {
    const byRecurring = new Map(expenses.filter((e) => e.recurring_id).map((e) => [e.recurring_id!, e]));
    const rows = recurring
      .filter((r) => r.active || byRecurring.has(r.id))
      .map((r) => ({ template: r, expense: byRecurring.get(r.id) ?? null }));
    const paid = rows.filter((r) => r.expense?.paid_on).length;
    const totalArs = rows.reduce((t, r) => t + (r.expense ? (r.expense.amount_ars ?? 0) : toArs(r.template.amount, r.template.currency, usdRate)), 0);
    const paidArs = rows.reduce((t, r) => t + (r.expense?.paid_on ? (r.expense.amount_ars ?? 0) : 0), 0);
    return { rows, paid, totalArs, paidArs };
  }, [expenses, recurring, usdRate]);

  const others = useMemo(() => expenses.filter((e) => !e.recurring_id), [expenses]);

  const totals = useMemo(() => {
    const registered = expenses.reduce((t, e) => t + (e.amount_ars ?? 0), 0);
    const paid = expenses.filter((e) => e.paid_on).reduce((t, e) => t + (e.amount_ars ?? 0), 0);
    const fixedMissing = fixed.rows.filter((r) => !r.expense).reduce((t, r) => t + toArs(r.template.amount, r.template.currency, usdRate), 0);
    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + (e.amount_ars ?? 0));
    return {
      projected: registered + fixedMissing,
      paid,
      pending: registered - paid + fixedMissing,
      variable: others.reduce((t, e) => t + (e.amount_ars ?? 0), 0),
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [expenses, fixed.rows, others, usdRate]);

  const quickPay = async (r: RecurringExpense) => {
    try {
      const id = await save.mutateAsync({
        values: {
          kind: "fijo",
          recurring_id: r.id,
          description: r.description,
          category: r.category,
          supplier_id: r.supplier_id,
          amount: r.amount,
          currency: r.currency,
          usd_rate: usdRate,
          due_on: dueDate(r),
          paid_on: isoDate(new Date()),
          method: "transferencia",
        },
      });
      toast.success(`${r.description}: pagado`, {
        description: money(r.amount, r.currency),
        action: { label: "Deshacer", onClick: () => remove.mutate(id) },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const isCurrentMonth = format(month, "yyyy-MM") === format(new Date(), "yyyy-MM");
  const monthLabel = format(month, "MMMM", { locale: es });

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Gastos"
        subtitle="Gastos fijos del consultorio, gastos variables y pagos a proveedores"
        actions={
          <>
            <Button variant="secondary" onClick={() => open({ type: "recurring-form" })} className="hidden sm:inline-flex">
              <Repeat className="size-4" /> Gasto fijo
            </Button>
            <Button onClick={() => open({ type: "expense-form" })}>
              <Plus className="size-4" /> Nuevo gasto
            </Button>
          </>
        }
      />

      <div className="mt-6">
        <PeriodNav
          label={<span className="inline-block min-w-32">{capitalize(format(month, "MMMM yyyy", { locale: es }))}</span>}
          onPrev={() => setMonth((m) => addMonths(m, -1))}
          onNext={() => setMonth((m) => addMonths(m, 1))}
          onToday={isCurrentMonth ? undefined : () => setMonth(startOfMonth(new Date()))}
          todayLabel="Este mes"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total del mes" value={isLoading ? <Skeleton className="h-8 w-28" /> : money(totals.projected)} icon={<Receipt />} hint="Incluye fijos aún no registrados" />
        <Kpi label="Pagado" value={money(totals.paid)} icon={<Check />} tone="success" hint={totals.projected ? `${Math.round((totals.paid / totals.projected) * 100)}% del total` : "—"} />
        <Kpi label="Pendiente" value={money(totals.pending)} icon={<CircleDashed />} tone={totals.pending > 0 ? "warning" : "neutral"} hint="Fijos y facturas por pagar" />
        <Kpi label="Variables" value={money(totals.variable)} icon={<Wallet />} hint={`Fijos: ${money(fixed.totalArs)}`} />
      </div>

      {!tipDismissed && recurring.length > 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-info/20 bg-info-soft/70 px-4 py-3 text-[13px] text-ink-2">
          <Info className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="flex-1">
            Cargamos los <b>gastos fijos típicos</b> de un consultorio con montos de referencia. Tocá el lápiz de cada uno para ajustarlo a tus valores reales: la calculadora de costos los usa para prorratear.
          </p>
          <button type="button" onClick={() => setTipDismissed(true)} aria-label="Cerrar" className="text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="overflow-hidden lg:col-span-7">
          <div className="border-b border-line px-4 py-4 md:px-5">
            <SectionTitle
              title={`Gastos fijos de ${monthLabel}`}
              subtitle={`${fixed.paid} de ${fixed.rows.length} pagados · ${money(fixed.paidArs)} de ${money(fixed.totalArs)}`}
              action={
                <Button size="sm" variant="ghost" onClick={() => open({ type: "recurring-form" })}>
                  <Plus className="size-3.5" /> Agregar
                </Button>
              }
            />
            <Progress value={fixed.rows.length ? (fixed.paid / fixed.rows.length) * 100 : 0} className="mt-3" />
          </div>
          {loadingRecurring ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : fixed.rows.length === 0 ? (
            <EmptyState icon={<Repeat />} title="Sin gastos fijos" description="Alquiler, sueldos, servicios, seguro… cargalos una vez y cada mes los tildás." />
          ) : (
            <ul className="divide-y divide-line/70">
              {fixed.rows.map(({ template, expense }) => {
                const due = expense?.due_on ?? dueDate(template);
                const isPaid = Boolean(expense?.paid_on);
                const overdue = !isPaid && due < today;
                return (
                  <li key={template.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                    <button
                      type="button"
                      onClick={() => (expense ? open({ type: "expense-form", expenseId: expense.id }) : quickPay(template))}
                      aria-label={isPaid ? "Pagado" : "Marcar como pagado"}
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,border-color,transform] active:scale-90",
                        isPaid ? "border-success bg-success text-white" : "border-line-strong text-transparent hover:border-success hover:text-success",
                      )}
                    >
                      <Check className="size-4" strokeWidth={3} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        expense
                          ? open({ type: "expense-form", expenseId: expense.id })
                          : open({
                              type: "expense-form",
                              defaults: {
                                kind: "fijo",
                                recurringId: template.id,
                                description: template.description,
                                category: template.category,
                                supplierId: template.supplier_id ?? undefined,
                                amount: template.amount,
                                currency: template.currency,
                                dueOn: due,
                                paid: true,
                              },
                            })
                      }
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className={cn("truncate text-sm font-medium", isPaid ? "text-muted" : "text-ink")}>{template.description}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {template.category} ·{" "}
                        {isPaid ? `pagado el ${fmt(expense!.paid_on!, "d MMM")}` : overdue ? <span className="font-medium text-danger">venció el {fmt(due, "d MMM")}</span> : `vence el ${fmt(due, "d MMM")}`}
                      </p>
                    </button>
                    <span className={cn("text-sm font-semibold tabular-nums", isPaid ? "text-muted" : "text-ink")}>
                      {money(expense?.amount ?? template.amount, expense?.currency ?? template.currency)}
                    </span>
                    <button type="button" onClick={() => open({ type: "recurring-form", recurringId: template.id })} aria-label="Editar gasto fijo" className="flex size-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-sunken hover:text-ink">
                      <Pencil className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-5 lg:col-span-5">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-4 md:px-5">
              <SectionTitle
                title="Otros gastos del mes"
                subtitle="Variables, insumos y facturas de proveedores"
                action={
                  <Button size="sm" variant="ghost" onClick={() => open({ type: "expense-form" })}>
                    <Plus className="size-3.5" /> Agregar
                  </Button>
                }
              />
            </div>
            {others.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Sin gastos variables en {monthLabel}.</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {others.map((e) => (
                  <ExpenseRow key={e.id} expense={e} today={today} onClick={() => open({ type: "expense-form", expenseId: e.id })} />
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4 md:p-5">
            <SectionTitle title="Por categoría" subtitle="Gastos registrados del mes" />
            <div className="mt-4">
              <BarList emptyLabel="Todavía no hay gastos registrados" items={totals.byCategory.map(([category, value]) => ({ key: category, label: category, value }))} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ExpenseRow({ expense: e, today, onClick }: { expense: ExpenseWithRefs; today: string; onClick: () => void }) {
  const overdue = !e.paid_on && e.due_on < today;
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle md:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{e.description}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {e.supplier?.name ? `${e.supplier.name} · ` : ""}
            {e.category} · {fmt(e.due_on, "d MMM")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm font-semibold tabular-nums text-ink">{money(e.amount, e.currency)}</span>
          {e.paid_on ? <Badge tone="success" className="h-5 px-2 text-[10px]">Pagado</Badge> : <Badge tone={overdue ? "danger" : "warning"} className="h-5 px-2 text-[10px]">{overdue ? "Vencido" : "Pendiente"}</Badge>}
        </div>
      </button>
    </li>
  );
}
