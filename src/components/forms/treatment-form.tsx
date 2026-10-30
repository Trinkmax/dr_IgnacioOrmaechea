"use client";

import { useMemo, useState } from "react";
import { Link2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Segmented, Switch } from "@/components/ui/misc";
import { SheetBody, SheetFooter, SheetHeader, SheetSection } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm";
import { useDismiss } from "@/components/shell/overlay-store";
import { useDeleteTreatment, useRecurringExpenses, useSaveTreatment, useSettings, useSuppliers, useTreatments, type CostDraft } from "@/lib/queries/catalog";
import { useRole } from "@/lib/queries/session";
import { profitBreakdown } from "@/lib/money-helpers";
import { durationLabel, money, percent, toArs } from "@/lib/format";
import { COLOR_KEYS, TREATMENT_COLORS, colorVars, type TreatmentColor } from "@/lib/colors";
import { cn, errorMessage } from "@/lib/utils";
import { KIND_META, type Currency, type TreatmentKind, type TreatmentWithCosts } from "@/lib/types";

const COST_SUGGESTIONS = ["Quirófano y clínica", "Anestesista", "Ayudante", "Instrumentadora", "Implantes", "Insumos y medicación", "Internación (1 noche)", "Faja post-quirúrgica"];

export function TreatmentFormSheet({ treatmentId }: { treatmentId?: string }) {
  const { data: treatments = [], isLoading } = useTreatments();
  const { isAdmin } = useRole();
  const existing = treatments.find((t) => t.id === treatmentId) ?? null;
  if (treatmentId && isLoading) {
    return (
      <>
        <SheetHeader title="Tratamiento" />
        <SheetBody>
          <div className="skeleton h-72" />
        </SheetBody>
      </>
    );
  }
  if (!isAdmin && existing) return <TreatmentReadOnly treatment={existing} />;
  return <TreatmentForm key={existing?.id ?? "new"} existing={existing} />;
}

function TreatmentReadOnly({ treatment }: { treatment: TreatmentWithCosts }) {
  return (
    <>
      <SheetHeader title={treatment.name} subtitle={KIND_META[treatment.kind].label} />
      <SheetBody>
        <div style={colorVars(treatment.color)} className="rounded-2xl border border-[var(--tc-ring)] bg-[var(--tc-soft)] p-5">
          <p className="text-[13px] font-medium text-[var(--tc-ink)]">Precio de lista</p>
          <p className="mt-1 font-display text-3xl text-ink">{money(treatment.price, treatment.currency)}</p>
          <p className="mt-2 text-sm text-ink-2">Duración estimada: {durationLabel(treatment.duration_min)}</p>
        </div>
        {treatment.description ? <p className="mt-4 text-sm leading-relaxed text-ink-2">{treatment.description}</p> : null}
      </SheetBody>
    </>
  );
}

function TreatmentForm({ existing }: { existing: TreatmentWithCosts | null }) {
  const dismiss = useDismiss();
  const confirm = useConfirm();
  const { data: settings } = useSettings();
  const { data: suppliers = [] } = useSuppliers();
  const { data: recurring = [] } = useRecurringExpenses();
  const save = useSaveTreatment();
  const remove = useDeleteTreatment();

  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<TreatmentKind>(existing?.kind ?? "procedimiento");
  const [duration, setDuration] = useState(existing?.duration_min ?? 60);
  const [price, setPrice] = useState<number | null>(existing?.price ?? null);
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? "ARS");
  const [color, setColor] = useState<TreatmentColor>((existing?.color as TreatmentColor) ?? "rose");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [active, setActive] = useState(existing?.active ?? true);
  const [costs, setCosts] = useState<(CostDraft & { key: string })[]>(
    () => existing?.costs.map((c) => ({ key: c.id, concept: c.concept, amount: c.amount, currency: c.currency, supplier_id: c.supplier_id })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  const usdRate = settings?.usd_rate ?? 1;
  const fixedMonthly = recurring.filter((r) => r.active).reduce((t, r) => t + toArs(r.amount, r.currency, usdRate), 0);
  const fixedPerHour = settings ? fixedMonthly / Number(settings.monthly_hours || 1) : 0;

  const breakdown = useMemo(() => {
    const directArs = costs.reduce((t, c) => t + toArs(c.amount || 0, c.currency, usdRate), 0);
    return profitBreakdown({
      priceArs: toArs(price ?? 0, currency, usdRate),
      directArs,
      durationMin: duration,
      fixedPerHour,
      taxPercent: Number(settings?.tax_percent ?? 0),
    });
  }, [costs, price, currency, usdRate, duration, fixedPerHour, settings?.tax_percent]);

  const updateCost = (key: string, patch: Partial<CostDraft>) => setCosts((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const addCost = (concept = "") => {
    const supplier =
      concept === "Anestesista"
        ? suppliers.find((s) => s.name === "Anestesista")
        : concept.startsWith("Quirófano") || concept.startsWith("Internación")
          ? suppliers.find((s) => s.category === "Clínica y quirófano")
          : concept === "Implantes"
            ? suppliers.find((s) => s.category === "Implantes")
            : undefined;
    setCosts((list) => [
      ...list,
      { key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, concept, amount: 0, currency: concept === "Implantes" ? "USD" : "ARS", supplier_id: supplier?.id ?? null },
    ]);
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Ingresá el nombre del tratamiento.");
    if (!duration || duration < 5) return setError("La duración mínima es de 5 minutos.");
    try {
      await save.mutateAsync({
        id: existing?.id,
        values: {
          name: name.trim(),
          kind,
          duration_min: Math.round(duration),
          price: price ?? 0,
          currency,
          color,
          description: description.trim() || null,
          active,
          sort_order: existing?.sort_order ?? 500,
        },
        costs: costs.map(({ concept, amount, currency, supplier_id }) => ({ concept, amount, currency, supplier_id })),
      });
      toast.success(existing ? "Tratamiento actualizado" : "Tratamiento creado");
      dismiss();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `¿Eliminar "${existing.name}"?`,
      description: "Los turnos ya cargados quedan sin tratamiento asociado. Si solo dejaste de hacerlo, desactivalo para conservar el historial.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success("Tratamiento eliminado");
      dismiss();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const marginTone = breakdown.margin >= 40 ? "text-success" : breakdown.margin >= 15 ? "text-[#7a520f]" : "text-danger";

  return (
    <>
      <SheetHeader title={existing ? existing.name : "Nuevo tratamiento"} subtitle="Precio, duración y estructura de costos" />
      <SheetBody className="space-y-5">
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Rinoplastia" autoFocus={!existing} />
        </Field>
        <Segmented
          stretch
          value={kind}
          onChange={setKind}
          options={(Object.keys(KIND_META) as TreatmentKind[]).map((k) => ({ value: k, label: KIND_META[k].label }))}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Precio de venta">
            <MoneyInput value={price} onChange={setPrice} currency={currency} onCurrencyChange={setCurrency} />
          </Field>
          <Field label="Duración (min)" hint={durationLabel(duration || 0)}>
            <Input type="number" inputMode="numeric" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </Field>
        </div>

        <Field label="Color en la agenda">
          <div className="flex flex-wrap gap-2">
            {COLOR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                title={TREATMENT_COLORS[key].name}
                aria-label={TREATMENT_COLORS[key].name}
                aria-pressed={color === key}
                onClick={() => setColor(key)}
                style={{ background: TREATMENT_COLORS[key].solid }}
                className={cn(
                  "size-8 rounded-full ring-offset-2 ring-offset-surface transition-transform active:scale-90",
                  color === key ? "ring-2 ring-ink" : "hover:scale-110",
                )}
              />
            ))}
          </div>
        </Field>

        <SheetSection
          title="Estructura de costos"
          action={<span className="text-xs text-muted">{costs.length} ítems</span>}
        >
          <div className="space-y-2">
            {costs.map((c) => (
              <div key={c.key} className="rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <Input value={c.concept} onChange={(e) => updateCost(c.key, { concept: e.target.value })} placeholder="Concepto" className="h-10" />
                  <button type="button" aria-label="Quitar costo" onClick={() => setCosts((list) => list.filter((x) => x.key !== c.key))} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger">
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <MoneyInput value={c.amount || null} onChange={(v) => updateCost(c.key, { amount: v ?? 0 })} currency={c.currency} onCurrencyChange={(cur) => updateCost(c.key, { currency: cur })} className="h-10" />
                  <Select value={c.supplier_id ?? ""} onChange={(e) => updateCost(c.key, { supplier_id: e.target.value || null })} className="h-10">
                    <option value="">Sin proveedor (compra en stock)</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        Paga a: {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {c.supplier_id ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                    <Link2 className="size-3" /> Genera un pago pendiente al proveedor cuando se realiza.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => addCost()}>
              <Plus className="size-3.5" /> Agregar costo
            </Button>
            {COST_SUGGESTIONS.filter((s) => !costs.some((c) => c.concept.toLowerCase().startsWith(s.toLowerCase().slice(0, 6)))).slice(0, 5).map((s) => (
              <button key={s} type="button" onClick={() => addCost(s)} className="h-8 rounded-lg border border-dashed border-line-strong px-2.5 text-xs font-medium text-ink-2 hover:bg-subtle">
                + {s}
              </button>
            ))}
          </div>
        </SheetSection>

        <div className="rounded-2xl bg-brand p-4 text-white">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-white/60">Ganancia neta estimada</span>
            <span className={cn("rounded-full bg-white px-2 py-0.5 text-xs font-semibold", marginTone)}>{percent(breakdown.margin)} margen</span>
          </div>
          <p className="mt-1 font-display text-[28px] leading-none tracking-[-0.03em] tabular-nums">{money(breakdown.profitArs)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-white/70">
            <span>Costos: <b className="font-semibold text-white">{money(breakdown.directArs)}</b></span>
            <span>Fijos: <b className="font-semibold text-white">{money(breakdown.fixedArs)}</b></span>
            <span>Impuestos: <b className="font-semibold text-white">{money(breakdown.taxArs)}</b></span>
          </div>
          <p className="mt-2 text-[11px] text-white/50">Cotización {money(usdRate)} · gastos fijos prorrateados por hora de trabajo.</p>
        </div>

        <Field label="Descripción (opcional)">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between rounded-2xl border border-line bg-subtle p-4">
          <div>
            <p className="text-sm font-medium text-ink">Activo</p>
            <p className="text-xs text-muted">Los inactivos no se ofrecen al dar turnos.</p>
          </div>
          <Switch checked={active} onChange={setActive} label="Activo" />
        </div>
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
      </SheetBody>
      <SheetFooter>
        {existing ? (
          <Button variant="danger-ghost" size="icon" aria-label="Eliminar tratamiento" onClick={onDelete}>
            <Trash2 className="size-[18px]" />
          </Button>
        ) : (
          <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
            Cancelar
          </Button>
        )}
        <Button size="lg" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={save.isPending}>
          {existing ? "Guardar cambios" : "Crear tratamiento"}
        </Button>
      </SheetFooter>
    </>
  );
}
