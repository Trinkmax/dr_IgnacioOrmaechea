"use client";

import { useMemo, useState } from "react";
import { addDays } from "date-fns";
import { AlarmClock, Check, CircleDollarSign, Plus, Search, Sparkles, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { Badge, Card, EmptyState, Kpi, PageHeader, SectionTitle, Skeleton } from "@/components/ui/misc";
import { AdminOnly } from "@/components/views/admin-only";
import { useOverlay } from "@/components/shell/overlay-store";
import { useSuppliers } from "@/lib/queries/catalog";
import { usePayables, useUpdateExpense } from "@/lib/queries/money";
import { fmt, isoDate, money } from "@/lib/format";
import { cn, errorMessage, normalize } from "@/lib/utils";
import type { ExpenseWithRefs } from "@/lib/types";

export function SuppliersView() {
  return (
    <AdminOnly>
      <Suppliers />
    </AdminOnly>
  );
}

function Suppliers() {
  const { open } = useOverlay();
  const { data: suppliers = [], isLoading } = useSuppliers();
  const { data: payables = [], isLoading: loadingPayables } = usePayables();
  const updateExpense = useUpdateExpense();
  const [query, setQuery] = useState("");
  const today = isoDate(new Date());
  const inAWeek = isoDate(addDays(new Date(), 7));

  const summary = useMemo(() => {
    const bySupplier = new Map<string, { total: number; count: number; overdue: boolean }>();
    let total = 0;
    let overdue = 0;
    let soon = 0;
    for (const e of payables) {
      const ars = e.amount_ars ?? 0;
      total += ars;
      if (e.due_on < today) overdue += ars;
      else if (e.due_on <= inAWeek) soon += ars;
      if (e.supplier_id) {
        const s = bySupplier.get(e.supplier_id) ?? { total: 0, count: 0, overdue: false };
        s.total += ars;
        s.count += 1;
        s.overdue ||= e.due_on < today;
        bySupplier.set(e.supplier_id, s);
      }
    }
    return { total, overdue, soon, bySupplier };
  }, [payables, today, inAWeek]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return suppliers
      .filter((s) => !q || normalize(s.name).includes(q) || normalize(s.category).includes(q))
      .sort((a, b) => Number(b.active) - Number(a.active) || (summary.bySupplier.get(b.id)?.total ?? 0) - (summary.bySupplier.get(a.id)?.total ?? 0) || a.name.localeCompare(b.name, "es"));
  }, [suppliers, query, summary.bySupplier]);

  const pay = async (e: ExpenseWithRefs) => {
    try {
      await updateExpense.mutateAsync({ id: e.id, patch: { paid_on: isoDate(new Date()), method: "transferencia" } });
      toast.success(`Pagado · ${money(e.amount, e.currency)}`, {
        description: e.supplier?.name ?? e.description,
        action: { label: "Deshacer", onClick: () => updateExpense.mutate({ id: e.id, patch: { paid_on: null, method: null } }) },
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Proveedores"
        subtitle="Clínicas, anestesistas, implantes e insumos: lo que se debe y lo que se pagó"
        actions={
          <Button onClick={() => open({ type: "supplier-form" })}>
            <Plus className="size-4" /> Nuevo proveedor
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Por pagar" value={loadingPayables ? <Skeleton className="h-8 w-28" /> : money(summary.total)} icon={<CircleDollarSign />} tone={summary.total ? "warning" : "neutral"} hint={`${payables.length} ${payables.length === 1 ? "pago pendiente" : "pagos pendientes"}`} />
        <Kpi label="Vencido" value={money(summary.overdue)} icon={<AlarmClock />} tone={summary.overdue ? "danger" : "neutral"} hint="Fecha de pago ya pasada" />
        <Kpi label="Próximos 7 días" value={money(summary.soon)} icon={<Truck />} className="col-span-2 lg:col-span-1" hint="Para planificar la caja" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="overflow-hidden lg:col-span-7">
          <div className="border-b border-line px-4 py-4 md:px-5">
            <SectionTitle title="Cuentas por pagar" subtitle="Ordenadas por vencimiento" />
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Sparkles className="size-3.5 text-accent" />
              Al marcar una cirugía como atendida se generan solos los pagos a quirófano, anestesista, ayudantes e implantes.
            </p>
          </div>
          {loadingPayables ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : payables.length === 0 ? (
            <EmptyState icon={<Check />} title="Todo pago" description="No hay deudas con proveedores. Cuando cargues facturas pendientes o se realice una cirugía, aparecen acá." />
          ) : (
            <ul className="divide-y divide-line/70">
              {payables.map((e) => {
                const overdue = e.due_on < today;
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                    <button type="button" onClick={() => open({ type: "expense-form", expenseId: e.id })} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-medium text-ink">{e.description}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                        {e.auto_generated ? <Badge tone="accent" className="h-5 px-2 text-[10px]">Cirugía</Badge> : null}
                        {e.supplier?.name ?? "Sin proveedor"} ·{" "}
                        <span className={cn(overdue && "font-medium text-danger")}>{overdue ? "venció" : "vence"} {fmt(e.due_on, "d MMM")}</span>
                      </p>
                    </button>
                    <span className="text-sm font-semibold tabular-nums text-ink">{money(e.amount, e.currency)}</span>
                    <Button size="sm" variant="soft" onClick={() => pay(e)}>
                      <Check className="size-3.5" /> Pagar
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="lg:col-span-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar proveedor" className={cn(controlClass, "h-11 pl-10 shadow-card")} />
          </div>
          <div className="mt-3 space-y-2">
            {isLoading ? (
              <Skeleton className="h-40 rounded-card" />
            ) : filtered.length === 0 ? (
              <Card>
                <EmptyState icon={<Truck />} title="Sin proveedores" description="Agregá la clínica, el anestesista, tu proveedor de implantes y de insumos." />
              </Card>
            ) : (
              filtered.map((s) => {
                const debt = summary.bySupplier.get(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => open({ type: "supplier", id: s.id })}
                    className={cn("flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left shadow-card transition-[box-shadow,background-color] hover:shadow-lift", !s.active && "opacity-60")}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sunken font-display text-lg text-ink-2">{s.name.charAt(0)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{s.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {s.category}
                        {s.phone ? ` · ${s.phone}` : ""}
                      </span>
                    </span>
                    {debt ? (
                      <span className="text-right">
                        <span className={cn("block text-sm font-semibold tabular-nums", debt.overdue ? "text-danger" : "text-ink")}>{money(debt.total)}</span>
                        <span className="block text-[11px] text-muted">{debt.count} pendiente{debt.count === 1 ? "" : "s"}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-faint">Al día</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
