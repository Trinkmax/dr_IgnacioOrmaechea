"use client";

import { useMemo, useState } from "react";
import { Check, Mail, MessageCircle, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Switch } from "@/components/ui/misc";
import { SheetBody, SheetFooter, SheetHeader, SheetSection } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm";
import { useDismiss, useOverlay } from "@/components/shell/overlay-store";
import { useDeleteSupplier, useSaveSupplier, useSuppliers } from "@/lib/queries/catalog";
import { useSupplierExpenses, useUpdateExpense } from "@/lib/queries/money";
import { capitalize, fmt, isoDate, money } from "@/lib/format";
import { cn, errorMessage, telLink, whatsappLink } from "@/lib/utils";
import { SUPPLIER_CATEGORIES, type ExpenseWithRefs, type Supplier } from "@/lib/types";

export function SupplierFormSheet({ supplierId }: { supplierId?: string }) {
  const { data: suppliers = [], isLoading } = useSuppliers();
  const existing = suppliers.find((s) => s.id === supplierId) ?? null;
  if (supplierId && isLoading) {
    return (
      <>
        <SheetHeader title="Proveedor" />
        <SheetBody>
          <div className="skeleton h-64" />
        </SheetBody>
      </>
    );
  }
  return <SupplierForm key={existing?.id ?? "new"} existing={existing} />;
}

function SupplierForm({ existing }: { existing: Supplier | null }) {
  const dismiss = useDismiss();
  const { replace } = useOverlay();
  const save = useSaveSupplier();
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    category: existing?.category ?? "Insumos",
    contact_name: existing?.contact_name ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    tax_id: existing?.tax_id ?? "",
    notes: existing?.notes ?? "",
    active: existing?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) return setError("Ingresá el nombre del proveedor.");
    try {
      const supplier = await save.mutateAsync({
        id: existing?.id,
        values: {
          name: form.name.trim(),
          category: form.category,
          contact_name: form.contact_name.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          tax_id: form.tax_id.trim() || null,
          notes: form.notes.trim() || null,
          active: form.active,
        },
      });
      toast.success(existing ? "Proveedor actualizado" : "Proveedor agregado");
      if (existing) dismiss();
      else replace({ type: "supplier", id: supplier.id });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <SheetHeader title={existing ? "Editar proveedor" : "Nuevo proveedor"} />
      <SheetBody className="space-y-4">
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej.: Sanatorio, Dr. Pérez (anestesia), Droguería Sur" autoFocus={!existing} />
        </Field>
        <Field label="Rubro">
          <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {SUPPLIER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {!(SUPPLIER_CATEGORIES as readonly string[]).includes(form.category) ? <option value={form.category}>{form.category}</option> : null}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Persona de contacto">
            <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
          </Field>
          <Field label="Teléfono">
            <Input inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="CUIT">
            <Input inputMode="numeric" value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="20-12345678-9" />
          </Field>
        </div>
        <Field label="Notas">
          <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="CBU / alias, condiciones de pago…" />
        </Field>
        <div className="flex items-center justify-between rounded-2xl border border-line bg-subtle p-4">
          <div>
            <p className="text-sm font-medium text-ink">Activo</p>
            <p className="text-xs text-muted">Los inactivos no aparecen al cargar gastos.</p>
          </div>
          <Switch checked={form.active} onChange={(v) => set("active", v)} label="Activo" />
        </div>
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
          Cancelar
        </Button>
        <Button size="lg" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={save.isPending}>
          {existing ? "Guardar" : "Agregar proveedor"}
        </Button>
      </SheetFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
export function SupplierSheet({ id }: { id: string }) {
  const { data: suppliers = [], isLoading } = useSuppliers();
  const supplier = suppliers.find((s) => s.id === id) ?? null;
  const { data: expenses = [] } = useSupplierExpenses(id);
  const { push } = useOverlay();
  const dismiss = useDismiss();
  const confirm = useConfirm();
  const remove = useDeleteSupplier();
  const updateExpense = useUpdateExpense();

  const { pending, paid, pendingArs, paidYearArs } = useMemo(() => {
    const pending = expenses.filter((e) => !e.paid_on).sort((a, b) => a.due_on.localeCompare(b.due_on));
    const paid = expenses.filter((e) => e.paid_on);
    const year = new Date().getFullYear();
    return {
      pending,
      paid,
      pendingArs: pending.reduce((t, e) => t + (e.amount_ars ?? 0), 0),
      paidYearArs: paid.filter((e) => e.paid_on!.startsWith(String(year))).reduce((t, e) => t + (e.amount_ars ?? 0), 0),
    };
  }, [expenses]);

  if (!supplier) {
    return (
      <>
        <SheetHeader title={isLoading ? "Cargando…" : "Proveedor no encontrado"} />
        <SheetBody>{isLoading ? <div className="skeleton h-64" /> : null}</SheetBody>
      </>
    );
  }

  const markPaid = async (expense: ExpenseWithRefs) => {
    try {
      await updateExpense.mutateAsync({ id: expense.id, patch: { paid_on: isoDate(new Date()), method: "transferencia" } });
      toast.success(`Pagado · ${money(expense.amount, expense.currency)}`, {
        action: { label: "Deshacer", onClick: () => updateExpense.mutate({ id: expense.id, patch: { paid_on: null, method: null } }) },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `¿Eliminar "${supplier.name}"?`,
      description: "Los gastos registrados se conservan sin proveedor asociado. Si ya no trabajás con él, podés desactivarlo.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(supplier.id);
      toast.success("Proveedor eliminado");
      dismiss();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const wa = whatsappLink(supplier.phone);
  const tel = telLink(supplier.phone);
  const today = isoDate(new Date());

  return (
    <>
      <SheetHeader title={supplier.name} subtitle={[supplier.category, supplier.active ? null : "Inactivo"].filter(Boolean).join(" · ")} />
      <SheetBody>
        <div className="grid grid-cols-2 gap-2">
          <div className={cn("rounded-2xl border p-3.5", pendingArs > 0 ? "border-warning/25 bg-warning-soft/70" : "border-line bg-subtle")}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Por pagar</p>
            <p className={cn("mt-1 text-lg font-semibold tabular-nums", pendingArs > 0 ? "text-[#7a520f]" : "text-ink")}>{money(pendingArs)}</p>
          </div>
          <div className="rounded-2xl border border-line bg-subtle p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Pagado en {new Date().getFullYear()}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{money(paidYearArs)}</p>
          </div>
        </div>

        {supplier.phone || supplier.email ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#e7f6ec] px-3 text-[13px] font-medium text-[#1d6b3c]">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            ) : null}
            {tel ? (
              <a href={tel} className="inline-flex h-9 items-center gap-2 rounded-xl bg-sunken px-3 text-[13px] font-medium text-ink-2">
                <Phone className="size-4" /> {supplier.phone}
              </a>
            ) : null}
            {supplier.email ? (
              <a href={`mailto:${supplier.email}`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-sunken px-3 text-[13px] font-medium text-ink-2">
                <Mail className="size-4" /> {supplier.email}
              </a>
            ) : null}
          </div>
        ) : null}

        <SheetSection
          title={`Pendientes de pago${pending.length ? ` · ${pending.length}` : ""}`}
          action={
            <button
              type="button"
              onClick={() => push({ type: "expense-form", defaults: { supplierId: supplier.id, paid: false, description: supplier.name } })}
              className="text-xs font-semibold text-accent-ink hover:underline"
            >
              + Factura
            </button>
          }
        >
          {pending.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-center text-[13px] text-muted">Nada pendiente con este proveedor ✓</p>
          ) : (
            <div className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line">
              {pending.map((e) => (
                <div key={e.id} className="flex items-center gap-3 bg-surface px-3.5 py-3">
                  <button type="button" onClick={() => push({ type: "expense-form", expenseId: e.id })} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-ink">{e.description}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                      {e.due_on < today ? <Badge tone="danger" className="h-5 px-2 text-[11px]">Vencido</Badge> : null}
                      Vence {fmt(e.due_on, "d MMM")}
                    </p>
                  </button>
                  <span className="text-sm font-semibold tabular-nums text-ink">{money(e.amount, e.currency)}</span>
                  <Button size="sm" variant="soft" onClick={() => markPaid(e)}>
                    <Check className="size-3.5" /> Pagar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SheetSection>

        {paid.length ? (
          <SheetSection title={`Historial de pagos · ${paid.length}`}>
            <div className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line">
              {paid.slice(0, 20).map((e) => (
                <button key={e.id} type="button" onClick={() => push({ type: "expense-form", expenseId: e.id })} className="flex w-full items-center gap-3 bg-surface px-3.5 py-3 text-left hover:bg-subtle">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{e.description}</p>
                    <p className="text-xs text-muted">Pagado el {capitalize(fmt(e.paid_on!, "d MMM yyyy"))}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-ink-2">{money(e.amount, e.currency)}</span>
                </button>
              ))}
            </div>
          </SheetSection>
        ) : null}

        {supplier.contact_name || supplier.tax_id || supplier.notes ? (
          <SheetSection title="Datos">
            <div className="space-y-1.5 rounded-2xl bg-subtle px-4 py-3 text-sm text-ink-2">
              {supplier.contact_name ? <p>Contacto: <span className="font-medium text-ink">{supplier.contact_name}</span></p> : null}
              {supplier.tax_id ? <p>CUIT: <span className="font-medium text-ink">{supplier.tax_id}</span></p> : null}
              {supplier.notes ? <p className="whitespace-pre-wrap">{supplier.notes}</p> : null}
            </div>
          </SheetSection>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="danger-ghost" size="icon" aria-label="Eliminar proveedor" onClick={onDelete}>
          <Trash2 className="size-[18px]" />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Editar proveedor" onClick={() => push({ type: "supplier-form", supplierId: supplier.id })}>
          <Pencil className="size-4" />
        </Button>
        <Button className="ml-auto" size="lg" onClick={() => push({ type: "expense-form", defaults: { supplierId: supplier.id, paid: true, description: supplier.name } })}>
          <Plus className="size-4" />
          Registrar pago
        </Button>
      </SheetFooter>
    </>
  );
}
