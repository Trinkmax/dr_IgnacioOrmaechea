"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { Badge, Progress, Segmented } from "@/components/ui/misc";
import { SheetBody, SheetFooter, SheetHeader, SheetSection } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm";
import { useDismiss, useOverlay } from "@/components/shell/overlay-store";
import { useSuppliers } from "@/lib/queries/catalog";
import {
  useAddExpensePayment,
  useDeleteExpensePayments,
  useExpense,
  useExpensePayments,
  usePaySupplier,
  useSupplierExpenses,
} from "@/lib/queries/money";
import { capitalize, fmt, isoDate, money } from "@/lib/format";
import { cn, errorMessage } from "@/lib/utils";
import { METHOD_META, METHOD_ORDER, type Currency, type Expense, type ExpenseWithRefs, type PaymentMethod } from "@/lib/types";

/** Redondeo a centavos para comparar montos sin errores de coma flotante. */
const cents = (value: number) => Math.round(value * 100);
const round2 = (value: number) => cents(value) / 100;

/** Saldo pendiente de un egreso (lo calcula la base; fallback por si falta la columna). */
export function expenseBalance(e: Pick<Expense, "amount" | "paid_amount" | "balance">) {
  return round2(e.balance ?? e.amount - (e.paid_amount ?? 0));
}

export function MethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (method: PaymentMethod) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {METHOD_ORDER.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "h-9 rounded-xl border text-xs font-medium transition-colors",
            value === m ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong",
          )}
        >
          {METHOD_META[m].label}
        </button>
      ))}
    </div>
  );
}

function AmountChips({ options, onPick }: { options: { label: string; value: number }[]; onPick: (value: number) => void }) {
  return (
    <div className="-mt-2 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onPick(o.value)}
          className="h-7 rounded-lg bg-sunken px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-line hover:text-ink"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resumen + historial de pagos de un egreso (dentro de "Editar gasto")
// ---------------------------------------------------------------------------
export function ExpensePaymentsPanel({ expense }: { expense: Expense }) {
  const { push } = useOverlay();
  const confirm = useConfirm();
  const { data: payments = [] } = useExpensePayments(expense.id);
  const remove = useDeleteExpensePayments();
  const paid = round2(expense.paid_amount ?? 0);
  const balance = expenseBalance(expense);
  const settled = balance <= 0;

  const onDelete = async (id: string, amount: number, paidOn: string) => {
    const ok = await confirm({
      title: "¿Eliminar este pago?",
      description: `${money(amount, expense.currency, { decimals: true })} del ${fmt(paidOn, "d MMM yyyy")}. Ese monto vuelve a quedar como deuda.`,
      confirmLabel: "Eliminar pago",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync([id]);
      toast.success("Pago eliminado");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{settled ? "Pagado" : paid > 0 ? "Pago parcial" : "Pendiente de pago"}</p>
          <p className="text-xs text-muted">
            {settled
              ? `Saldado el ${fmt(expense.paid_on ?? payments[0]?.paid_on ?? isoDate(new Date()), "d MMM yyyy")}`
              : paid > 0
                ? `Pagado ${money(paid, expense.currency, { decimals: true })} de ${money(expense.amount, expense.currency, { decimals: true })}`
                : "Queda en cuentas por pagar"}
          </p>
        </div>
        {settled ? (
          <Badge tone="success" className="h-6 px-2.5 text-[11px]">
            <Check className="size-3" /> Saldado
          </Badge>
        ) : (
          <Button size="sm" variant="soft" onClick={() => push({ type: "expense-payment", expenseId: expense.id })}>
            <Plus className="size-3.5" /> Registrar pago
          </Button>
        )}
      </div>

      {paid > 0 && !settled ? (
        <>
          <Progress value={(paid / expense.amount) * 100} tone="accent" className="mt-3" />
          <p className="mt-2 text-xs text-muted">
            Saldo pendiente: <span className="font-semibold tabular-nums text-ink">{money(balance, expense.currency, { decimals: true })}</span>
          </p>
        </>
      ) : null}

      {payments.length ? (
        <ul className="mt-3 divide-y divide-line/70 overflow-hidden rounded-xl border border-line bg-surface">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium tabular-nums text-ink">{money(p.amount, expense.currency, { decimals: true })}</p>
                <p className="truncate text-xs text-muted">
                  {capitalize(fmt(p.paid_on, "d MMM yyyy"))} · {METHOD_META[p.method].label}
                  {p.notes ? ` · ${p.notes}` : ""}
                </p>
              </div>
              <Button variant="danger-ghost" size="icon-sm" aria-label="Eliminar pago" onClick={() => onDelete(p.id, p.amount, p.paid_on)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagar (total o parcialmente) un egreso puntual
// ---------------------------------------------------------------------------
export function ExpensePaymentSheet({ expenseId }: { expenseId: string }) {
  const { data: expense, isLoading } = useExpense(expenseId);
  if (!expense) {
    return (
      <>
        <SheetHeader title={isLoading ? "Registrar pago" : "Gasto no encontrado"} />
        <SheetBody>{isLoading ? <div className="skeleton h-72" /> : null}</SheetBody>
      </>
    );
  }
  return <ExpensePaymentForm key={expense.id} expense={expense} />;
}

function ExpensePaymentForm({ expense }: { expense: ExpenseWithRefs }) {
  const dismiss = useDismiss();
  const add = useAddExpensePayment();
  const undo = useDeleteExpensePayments();
  const balance = expenseBalance(expense);
  const paid = round2(expense.paid_amount ?? 0);
  const [amount, setAmount] = useState<number | null>(balance > 0 ? balance : null);
  const [paidOn, setPaidOn] = useState(isoDate(new Date()));
  const [method, setMethod] = useState<PaymentMethod>("transferencia");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cur = expense.currency;
  const rest = amount ? round2(balance - amount) : balance;

  const submit = async () => {
    setError(null);
    if (!amount || amount <= 0) return setError("Ingresá el monto que pagaste.");
    if (cents(amount) > cents(balance)) return setError(`El pago supera el saldo pendiente (${money(balance, cur, { decimals: true })}).`);
    try {
      const payment = await add.mutateAsync({ expense_id: expense.id, amount: round2(amount), paid_on: paidOn, method, notes: notes.trim() || null });
      const settles = cents(amount) === cents(balance);
      toast.success(settles ? `Deuda saldada · ${money(amount, cur, { decimals: true })}` : `Pago parcial · ${money(amount, cur, { decimals: true })}`, {
        description: settles ? expense.description : `${expense.description} · quedan ${money(rest, cur, { decimals: true })}`,
        action: { label: "Deshacer", onClick: () => undo.mutate([payment.id]) },
      });
      dismiss();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (balance <= 0) {
    return (
      <>
        <SheetHeader title="Registrar pago" subtitle={expense.description} />
        <SheetBody>
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Este gasto ya está saldado ✓</p>
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" size="lg" className="flex-1" onClick={dismiss}>
            Cerrar
          </Button>
        </SheetFooter>
      </>
    );
  }

  return (
    <>
      <SheetHeader title="Registrar pago" subtitle={[expense.supplier?.name, expense.description].filter(Boolean).join(" · ")} />
      <SheetBody className="space-y-5">
        <div className="rounded-2xl border border-line bg-subtle p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Total</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{money(expense.amount, cur)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Pagado</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-success">{money(paid, cur)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Saldo</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{money(balance, cur, { decimals: true })}</p>
            </div>
          </div>
          <Progress value={(paid / expense.amount) * 100} tone="accent" className="mt-3" />
          <p className="mt-2 text-xs text-muted">Vence {fmt(expense.due_on, "d MMM yyyy")}</p>
        </div>

        <Field label="Monto a pagar">
          <MoneyInput size="lg" value={amount} onChange={setAmount} currency={cur} autoFocus />
        </Field>
        <AmountChips
          options={[
            { label: `Todo el saldo (${money(balance, cur)})`, value: balance },
            ...(balance >= 2 ? [{ label: "La mitad", value: round2(balance / 2) }] : []),
          ]}
          onPick={setAmount}
        />
        {amount && amount > 0 ? (
          cents(amount) > cents(balance) ? (
            <p className="-mt-2 text-xs font-medium text-danger">Supera el saldo pendiente.</p>
          ) : (
            <p className="-mt-2 text-xs text-muted">
              {cents(amount) === cents(balance) ? (
                <span className="font-medium text-success">Con este pago la deuda queda saldada.</span>
              ) : (
                <>
                  Después de este pago quedan <span className="font-semibold tabular-nums text-ink">{money(rest, cur, { decimals: true })}</span> por pagar.
                </>
              )}
            </p>
          )
        ) : null}

        <Field label="Fecha de pago">
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <MethodPicker value={method} onChange={setMethod} />
        <Field label="Notas">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nº de comprobante, detalle…" />
        </Field>
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
          Cancelar
        </Button>
        <Button size="lg" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={add.isPending}>
          Registrar pago
        </Button>
      </SheetFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pago a cuenta de un proveedor: se imputa a sus deudas, de la más vieja a la más nueva
// ---------------------------------------------------------------------------
export function SupplierPaymentSheet({ supplierId }: { supplierId: string }) {
  const { data: suppliers = [], isLoading: loadingSuppliers } = useSuppliers();
  const { data: expenses = [], isLoading } = useSupplierExpenses(supplierId);
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  if (!supplier || isLoading) {
    return (
      <>
        <SheetHeader title={loadingSuppliers || isLoading ? "Pago a proveedor" : "Proveedor no encontrado"} />
        <SheetBody>{loadingSuppliers || isLoading ? <div className="skeleton h-72" /> : null}</SheetBody>
      </>
    );
  }
  return <SupplierPaymentForm supplierId={supplier.id} supplierName={supplier.name} expenses={expenses} />;
}

/** Vista previa de cómo se imputa un pago (misma regla que pay_supplier en la base). */
function allocate(debts: ExpenseWithRefs[], amount: number) {
  const result: { expense: ExpenseWithRefs; applied: number; rest: number }[] = [];
  let left = cents(amount);
  for (const e of debts) {
    const bal = cents(expenseBalance(e));
    const applied = Math.min(left, bal);
    left -= applied;
    result.push({ expense: e, applied: applied / 100, rest: (bal - applied) / 100 });
  }
  return result;
}

function SupplierPaymentForm({ supplierId, supplierName, expenses }: { supplierId: string; supplierName: string; expenses: ExpenseWithRefs[] }) {
  const dismiss = useDismiss();
  const { replace } = useOverlay();
  const pay = usePaySupplier();
  const undo = useDeleteExpensePayments();

  const pending = useMemo(
    () =>
      expenses
        .filter((e) => expenseBalance(e) > 0)
        .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.created_at.localeCompare(b.created_at)),
    [expenses],
  );
  const currencies = useMemo(() => {
    const set = new Set(pending.map((e) => e.currency));
    return (["ARS", "USD"] as const).filter((c) => set.has(c));
  }, [pending]);

  const [currency, setCurrency] = useState<Currency>(currencies[0] ?? "ARS");
  const [amount, setAmount] = useState<number | null>(null);
  const [paidOn, setPaidOn] = useState(isoDate(new Date()));
  const [method, setMethod] = useState<PaymentMethod>("transferencia");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const debts = pending.filter((e) => e.currency === currency);
  const total = round2(debts.reduce((t, e) => t + expenseBalance(e), 0));

  const allocation = allocate(debts, amount ?? 0);

  const newExpense = () => replace({ type: "expense-form", defaults: { supplierId, paid: true, description: supplierName } });

  const submit = async () => {
    setError(null);
    if (!amount || amount <= 0) return setError("Ingresá el monto que pagaste.");
    if (cents(amount) > cents(total)) return setError(`El pago supera la deuda en ${currency} (${money(total, currency, { decimals: true })}).`);
    try {
      const ids = await pay.mutateAsync({ supplierId, currency, amount: round2(amount), paidOn, method, notes: notes.trim() || null });
      const settles = cents(amount) === cents(total);
      toast.success(`Pago a ${supplierName} · ${money(amount, currency, { decimals: true })}`, {
        description: settles ? "Cuenta saldada" : `Quedan ${money(round2(total - amount), currency, { decimals: true })} por pagar`,
        action: { label: "Deshacer", onClick: () => undo.mutate(ids) },
      });
      dismiss();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (pending.length === 0) {
    return (
      <>
        <SheetHeader title="Pago a proveedor" subtitle={supplierName} />
        <SheetBody>
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No hay deudas pendientes con este proveedor ✓</p>
        </SheetBody>
        <SheetFooter>
          <Button size="lg" className="flex-1" onClick={newExpense}>
            <Plus className="size-4" /> Cargar un gasto ya pagado
          </Button>
        </SheetFooter>
      </>
    );
  }

  return (
    <>
      <SheetHeader title="Pago a proveedor" subtitle={supplierName} />
      <SheetBody className="space-y-5">
        {currencies.length > 1 ? (
          <Segmented
            stretch
            value={currency}
            onChange={(c) => {
              setCurrency(c);
              setAmount(null);
            }}
            options={currencies.map((c) => ({ value: c, label: c === "ARS" ? "Deuda en pesos" : "Deuda en dólares" }))}
          />
        ) : null}

        <div className="rounded-2xl border border-warning/25 bg-warning-soft/70 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Deuda total{currencies.length > 1 ? ` en ${currency}` : ""}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#7a520f]">{money(total, currency, { decimals: true })}</p>
          <p className="mt-0.5 text-xs text-muted">
            {debts.length} {debts.length === 1 ? "factura pendiente" : "facturas pendientes"} · el pago se aplica primero a la que vence antes
          </p>
        </div>

        <Field label="Monto pagado">
          <MoneyInput size="lg" value={amount} onChange={setAmount} currency={currency} autoFocus />
        </Field>
        <AmountChips options={[{ label: `Todo (${money(total, currency)})`, value: total }]} onPick={setAmount} />

        <SheetSection title="Cómo se aplica" className="!mt-4">
          <div className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line">
            {allocation.map(({ expense: e, applied, rest }) => (
              <div key={e.id} className={cn("flex items-center gap-3 bg-surface px-3.5 py-2.5", amount && applied === 0 && "opacity-50")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{e.description}</p>
                  <p className="text-xs text-muted">
                    Vence {fmt(e.due_on, "d MMM")} · saldo {money(expenseBalance(e), e.currency, { decimals: true })}
                  </p>
                </div>
                {amount && applied > 0 ? (
                  rest === 0 ? (
                    <Badge tone="success" className="h-5 px-2 text-[10px]">
                      Salda
                    </Badge>
                  ) : (
                    <span className="text-right text-xs text-muted">
                      <span className="block font-semibold tabular-nums text-ink">−{money(applied, e.currency, { decimals: true })}</span>
                      quedan {money(rest, e.currency, { decimals: true })}
                    </span>
                  )
                ) : null}
              </div>
            ))}
          </div>
          {amount && cents(amount) > cents(total) ? <p className="mt-2 text-xs font-medium text-danger">Supera la deuda pendiente.</p> : null}
        </SheetSection>

        <Field label="Fecha de pago">
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <MethodPicker value={method} onChange={setMethod} />
        <Field label="Notas">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nº de comprobante, detalle…" />
        </Field>
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
        <button type="button" onClick={newExpense} className="w-full text-center text-xs font-medium text-accent-ink hover:underline">
          ¿Es una compra nueva que ya pagaste? Cargala como gasto
        </button>
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
          Cancelar
        </Button>
        <Button size="lg" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={pay.isPending}>
          Registrar pago
        </Button>
      </SheetFooter>
    </>
  );
}
