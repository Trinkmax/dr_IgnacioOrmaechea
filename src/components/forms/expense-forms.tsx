"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Segmented, Switch } from "@/components/ui/misc";
import { SheetBody, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm";
import { useDismiss, type ExpenseDefaults } from "@/components/shell/overlay-store";
import { useDeleteRecurring, useRecurringExpenses, useSaveRecurring, useSettings, useSuppliers } from "@/lib/queries/catalog";
import { useDeleteExpense, useSaveExpense } from "@/lib/queries/money";
import { getSupabase } from "@/lib/supabase/client";
import { fmt, isoDate, money } from "@/lib/format";
import { cn, errorMessage } from "@/lib/utils";
import {
  EXPENSE_CATEGORIES,
  METHOD_META,
  METHOD_ORDER,
  type Currency,
  type Expense,
  type ExpenseKind,
  type PaymentMethod,
  type RecurringExpense,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Egreso (gasto variable, fijo del mes o factura de proveedor)
// ---------------------------------------------------------------------------
export function ExpenseFormSheet({ expenseId, defaults }: { expenseId?: string; defaults?: ExpenseDefaults }) {
  const { data: existing, isLoading } = useQuery({
    queryKey: ["expenses", "one", expenseId ?? "none"],
    queryFn: async (): Promise<Expense | null> => {
      const { data, error } = await getSupabase().from("expenses").select("*").eq("id", expenseId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(expenseId),
  });
  const { data: settings, isLoading: loadingSettings } = useSettings();
  if ((expenseId && isLoading) || loadingSettings) {
    return (
      <>
        <SheetHeader title={expenseId ? "Editar gasto" : "Nuevo gasto"} />
        <SheetBody>
          <div className="skeleton h-72" />
        </SheetBody>
      </>
    );
  }
  return <ExpenseForm key={existing?.id ?? "new"} existing={existing ?? null} defaults={defaults} usdRate={settings?.usd_rate ?? 1} />;
}

function ExpenseForm({ existing, defaults, usdRate: currentRate }: { existing: Expense | null; defaults?: ExpenseDefaults; usdRate: number }) {
  const dismiss = useDismiss();
  const confirm = useConfirm();
  const { data: suppliers = [] } = useSuppliers();
  const save = useSaveExpense();
  const remove = useDeleteExpense();

  const today = isoDate(new Date());
  const defaultSupplier = suppliers.find((s) => s.id === defaults?.supplierId);
  const supplierCategory =
    defaultSupplier && (EXPENSE_CATEGORIES as readonly string[]).includes(defaultSupplier.category) ? defaultSupplier.category : undefined;
  const [kind, setKind] = useState<ExpenseKind>(existing?.kind ?? defaults?.kind ?? "variable");
  const [description, setDescription] = useState(existing?.description ?? defaults?.description ?? "");
  const [category, setCategory] = useState(existing?.category ?? defaults?.category ?? supplierCategory ?? "Insumos");
  const [supplierId, setSupplierId] = useState(existing?.supplier_id ?? defaults?.supplierId ?? "");
  const [amount, setAmount] = useState<number | null>(existing?.amount ?? defaults?.amount ?? null);
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? defaults?.currency ?? "ARS");
  const [usdRate, setUsdRate] = useState<number | null>(existing?.usd_rate ?? currentRate);
  const [dueOn, setDueOn] = useState(existing?.due_on ?? defaults?.dueOn ?? today);
  const [paid, setPaid] = useState(existing ? Boolean(existing.paid_on) : (defaults?.paid ?? true));
  const [paidOn, setPaidOn] = useState(existing?.paid_on ?? today);
  const [method, setMethod] = useState<PaymentMethod>(existing?.method ?? "transferencia");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const recurringId = existing?.recurring_id ?? defaults?.recurringId ?? null;

  const onSupplierChange = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (s && !existing) {
      if ((EXPENSE_CATEGORIES as readonly string[]).includes(s.category)) setCategory(s.category);
      if (!description.trim()) setDescription(s.name);
    }
  };

  const submit = async () => {
    setError(null);
    if (!description.trim()) return setError("Escribí una descripción.");
    if (!amount || amount <= 0) return setError("Ingresá el monto.");
    try {
      await save.mutateAsync({
        id: existing?.id,
        values: {
          kind,
          description: description.trim(),
          category,
          supplier_id: supplierId || null,
          recurring_id: recurringId,
          amount,
          currency,
          usd_rate: usdRate && usdRate > 0 ? usdRate : currentRate,
          due_on: dueOn,
          paid_on: paid ? paidOn : null,
          method: paid ? method : null,
          notes: notes.trim() || null,
        },
      });
      toast.success(existing ? "Gasto actualizado" : paid ? `Pago registrado · ${money(amount, currency)}` : "Quedó como pendiente de pago");
      dismiss();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    const ok = await confirm({ title: "¿Eliminar este gasto?", description: `${existing.description} · ${money(existing.amount, existing.currency)}`, confirmLabel: "Eliminar", tone: "danger" });
    if (!ok) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success("Gasto eliminado");
      dismiss();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <SheetHeader
        title={existing ? "Editar gasto" : recurringId ? "Pagar gasto fijo" : supplierId ? "Pago a proveedor" : "Nuevo gasto"}
        subtitle={existing?.auto_generated ? "Generado automáticamente por una cirugía realizada" : undefined}
      />
      <SheetBody className="space-y-5">
        {!recurringId ? (
          <Segmented
            stretch
            value={kind}
            onChange={setKind}
            options={[
              { value: "variable", label: "Gasto variable" },
              { value: "fijo", label: "Gasto fijo" },
            ]}
          />
        ) : null}

        <Field label="Descripción">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej.: Compra de insumos, honorarios anestesista" autoFocus={!existing && !defaults?.description} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Categoría">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {!(EXPENSE_CATEGORIES as readonly string[]).includes(category) ? <option value={category}>{category}</option> : null}
            </Select>
          </Field>
          <Field label="Proveedor">
            <Select value={supplierId} onChange={(e) => onSupplierChange(e.target.value)}>
              <option value="">Sin proveedor</option>
              {suppliers
                .filter((s) => s.active || s.id === supplierId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <Field label="Monto">
          <MoneyInput size="lg" value={amount} onChange={setAmount} currency={currency} onCurrencyChange={setCurrency} />
        </Field>
        {currency === "USD" ? (
          <div className="-mt-2 flex items-center gap-3 rounded-xl bg-subtle px-3 py-2.5">
            <span className="text-[13px] text-ink-2">Cotización</span>
            <div className="ml-auto w-36">
              <MoneyInput value={usdRate} onChange={setUsdRate} currency="ARS" className="h-9" />
            </div>
          </div>
        ) : null}

        <Field label={paid ? "Fecha del gasto" : "Vencimiento"}>
          <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </Field>

        <div className="rounded-2xl border border-line bg-subtle p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">{paid ? "Ya está pagado" : "Pendiente de pago"}</p>
              <p className="text-xs text-muted">{paid ? "Se descuenta de la caja" : "Queda en cuentas por pagar"}</p>
            </div>
            <Switch checked={paid} onChange={setPaid} label="Pagado" />
          </div>
          {paid ? (
            <div className="mt-4 space-y-4">
              <Field label="Fecha de pago">
                <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <div className="grid grid-cols-3 gap-1.5">
                {METHOD_ORDER.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={cn(
                      "h-9 rounded-xl border text-xs font-medium transition-colors",
                      method === m ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                    )}
                  >
                    {METHOD_META[m].label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <Field label="Notas">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nº de factura, detalle…" />
        </Field>
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
      </SheetBody>
      <SheetFooter>
        {existing ? (
          <Button variant="danger-ghost" size="icon" aria-label="Eliminar gasto" onClick={onDelete}>
            <Trash2 className="size-[18px]" />
          </Button>
        ) : (
          <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
            Cancelar
          </Button>
        )}
        <Button size="lg" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={save.isPending}>
          {existing ? "Guardar cambios" : paid ? "Registrar pago" : "Guardar pendiente"}
        </Button>
      </SheetFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Plantilla de gasto fijo mensual
// ---------------------------------------------------------------------------
export function RecurringFormSheet({ recurringId }: { recurringId?: string }) {
  const { data: list = [], isLoading } = useRecurringExpenses();
  const existing = list.find((r) => r.id === recurringId) ?? null;
  if (recurringId && isLoading) {
    return (
      <>
        <SheetHeader title="Gasto fijo" />
        <SheetBody>
          <div className="skeleton h-48" />
        </SheetBody>
      </>
    );
  }
  return <RecurringForm key={existing?.id ?? "new"} existing={existing} />;
}

function RecurringForm({ existing }: { existing: RecurringExpense | null }) {
  const dismiss = useDismiss();
  const confirm = useConfirm();
  const { data: suppliers = [] } = useSuppliers();
  const save = useSaveRecurring();
  const remove = useDeleteRecurring();
  const [description, setDescription] = useState(existing?.description ?? "");
  const [category, setCategory] = useState(existing?.category ?? "Servicios");
  const [supplierId, setSupplierId] = useState(existing?.supplier_id ?? "");
  const [amount, setAmount] = useState<number | null>(existing?.amount ?? null);
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? "ARS");
  const [dueDay, setDueDay] = useState(existing?.due_day ?? 10);
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!description.trim()) return setError("Escribí una descripción.");
    try {
      await save.mutateAsync({
        id: existing?.id,
        values: {
          description: description.trim(),
          category,
          supplier_id: supplierId || null,
          amount: amount ?? 0,
          currency,
          due_day: Math.min(31, Math.max(1, dueDay || 1)),
          active,
        },
      });
      toast.success(existing ? "Gasto fijo actualizado" : "Gasto fijo agregado");
      dismiss();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `¿Eliminar "${existing.description}"?`,
      description: "Los pagos ya registrados se conservan. Si solo dejó de aplicar, podés desactivarlo.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success("Gasto fijo eliminado");
      dismiss();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <SheetHeader title={existing ? "Editar gasto fijo" : "Nuevo gasto fijo"} subtitle="Se repite todos los meses" />
      <SheetBody className="space-y-5">
        <Field label="Descripción">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej.: Alquiler del consultorio" autoFocus={!existing} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Categoría">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Proveedor (opcional)">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Monto mensual estimado" hint="Cada mes podés ajustar el monto real al marcarlo como pagado.">
          <MoneyInput size="lg" value={amount} onChange={setAmount} currency={currency} onCurrencyChange={setCurrency} />
        </Field>
        <Field label="Día de vencimiento">
          <Input type="number" inputMode="numeric" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} />
        </Field>
        <div className="flex items-center justify-between rounded-2xl border border-line bg-subtle p-4">
          <div>
            <p className="text-sm font-medium text-ink">Activo</p>
            <p className="text-xs text-muted">Si lo desactivás deja de aparecer en los meses siguientes.</p>
          </div>
          <Switch checked={active} onChange={setActive} label="Activo" />
        </div>
        {existing ? <p className="text-xs text-muted">Creado el {fmt(existing.created_at, "d 'de' MMMM yyyy")}</p> : null}
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
      </SheetBody>
      <SheetFooter>
        {existing ? (
          <Button variant="danger-ghost" size="icon" aria-label="Eliminar" onClick={onDelete}>
            <Trash2 className="size-[18px]" />
          </Button>
        ) : (
          <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
            Cancelar
          </Button>
        )}
        <Button size="lg" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={save.isPending}>
          {existing ? "Guardar" : "Agregar gasto fijo"}
        </Button>
      </SheetFooter>
    </>
  );
}
