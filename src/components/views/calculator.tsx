"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { Badge, Card, ColorDot, PageHeader, SectionTitle, Segmented, Switch } from "@/components/ui/misc";
import { AdminOnly } from "@/components/views/admin-only";
import { COMPOSITION } from "@/components/views/charts";
import { useRecurringExpenses, useSaveTreatment, useSettings, useTreatments, useUpdateSettings, type CostDraft } from "@/lib/queries/catalog";
import { niceRound, priceForMargin, profitBreakdown, treatmentCostArs, treatmentPriceArs } from "@/lib/money-helpers";
import { durationLabel, money, percent, toArs } from "@/lib/format";
import { cn, errorMessage } from "@/lib/utils";
import { KIND_META, type Currency, type TreatmentKind, type TreatmentWithCosts } from "@/lib/types";

type Row = CostDraft & { key: string };
const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function CalculatorView() {
  return (
    <AdminOnly>
      <Calculator />
    </AdminOnly>
  );
}

function Calculator() {
  const { data: treatments = [] } = useTreatments();
  const { data: settings } = useSettings();
  if (!settings || !treatments.length) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
        <PageHeader title="Calculadora de costos" subtitle="Cargando datos…" />
        <div className="skeleton mt-8 h-96 rounded-card" />
      </div>
    );
  }
  return <CalculatorInner treatments={treatments} settings={settings} />;
}

function CalculatorInner({ treatments, settings }: { treatments: TreatmentWithCosts[]; settings: NonNullable<ReturnType<typeof useSettings>["data"]> }) {
  const { data: recurring = [] } = useRecurringExpenses();
  const saveTreatment = useSaveTreatment();
  const updateSettings = useUpdateSettings();
  const usdRate = Number(settings.usd_rate);

  const first = treatments.find((t) => t.kind === "cirugia") ?? treatments[0];
  const [treatmentId, setTreatmentId] = useState<string>(first?.id ?? "");
  const [rows, setRows] = useState<Row[]>(() => toRows(first));
  const [duration, setDuration] = useState(first?.duration_min ?? 60);
  const [mode, setMode] = useState<"precio" | "margen">("precio");
  const [price, setPrice] = useState<number | null>(first?.price ?? null);
  const [currency, setCurrency] = useState<Currency>(first?.currency ?? "USD");
  const [targetMargin, setTargetMargin] = useState(50);
  const [includeFixed, setIncludeFixed] = useState(true);
  const [monthlyHours, setMonthlyHours] = useState(Number(settings.monthly_hours));
  const [tax, setTax] = useState(Number(settings.tax_percent));

  const selected = treatments.find((t) => t.id === treatmentId) ?? null;
  const fixedMonthly = recurring.filter((r) => r.active).reduce((t, r) => t + toArs(r.amount, r.currency, usdRate), 0);
  const fixedPerHour = monthlyHours > 0 ? fixedMonthly / monthlyHours : 0;
  const directArs = rows.reduce((t, r) => t + toArs(r.amount || 0, r.currency, usdRate), 0);
  const fixedArs = includeFixed ? (fixedPerHour * duration) / 60 : 0;

  const suggestedArs = priceForMargin({ directArs, fixedArs, taxPercent: tax, marginPercent: targetMargin });
  const suggested = suggestedArs == null ? null : niceRound(currency === "USD" ? suggestedArs / usdRate : suggestedArs, currency);
  const effectivePrice = mode === "margen" ? (suggested ?? 0) : (price ?? 0);
  const priceArs = toArs(effectivePrice, currency, usdRate);
  const b = profitBreakdown({ priceArs, directArs, durationMin: duration, fixedPerHour, taxPercent: tax, includeFixed });
  const breakEvenArs = (directArs + fixedArs) / Math.max(0.01, 1 - tax / 100);

  const load = (id: string) => {
    setTreatmentId(id);
    const t = treatments.find((x) => x.id === id);
    setRows(toRows(t));
    if (t) {
      setDuration(t.duration_min);
      setPrice(t.price);
      setCurrency(t.currency);
    } else {
      setPrice(null);
    }
  };

  const save = async () => {
    if (!selected) return;
    try {
      await saveTreatment.mutateAsync({
        id: selected.id,
        values: {
          name: selected.name,
          kind: selected.kind,
          duration_min: Math.round(duration),
          price: effectivePrice,
          currency,
          color: selected.color,
          description: selected.description,
          active: selected.active,
          sort_order: selected.sort_order,
        },
        costs: rows.map(({ concept, amount, currency: c, supplier_id }) => ({ concept, amount, currency: c, supplier_id })),
      });
      toast.success(`${selected.name} actualizado`, { description: `Precio ${money(effectivePrice, currency)} · costo ${money(directArs)}` });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const saveDefaults = async () => {
    try {
      await updateSettings.mutateAsync({ monthly_hours: monthlyHours, tax_percent: tax });
      toast.success("Guardado como predeterminado");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const segments = [
    { label: "Costos directos", value: b.directArs, color: COMPOSITION[0] },
    { label: "Gastos fijos", value: b.fixedArs, color: COMPOSITION[1] },
    { label: "Impuestos", value: b.taxArs, color: COMPOSITION[2] },
    { label: "Ganancia", value: Math.max(0, b.profitArs), color: COMPOSITION[3] },
  ];
  const segTotal = Math.max(1, segments.reduce((t, s) => t + s.value, 0));
  const dirty =
    selected &&
    (selected.price !== effectivePrice ||
      selected.currency !== currency ||
      selected.duration_min !== duration ||
      JSON.stringify(selected.costs.map((c) => [c.concept, c.amount, c.currency, c.supplier_id])) !== JSON.stringify(rows.map((r) => [r.concept, r.amount, r.currency, r.supplier_id])));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="Calculadora de costos" subtitle="Cuánto te queda realmente de cada tratamiento, y a qué precio conviene venderlo" />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <Card className="p-4 md:p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_150px]">
              <Field label="Tratamiento">
                <Select value={treatmentId} onChange={(e) => load(e.target.value)}>
                  <option value="">Personalizado (en blanco)</option>
                  {(["cirugia", "procedimiento", "consulta"] as TreatmentKind[]).map((kind) => (
                    <optgroup key={kind} label={KIND_META[kind].plural}>
                      {treatments
                        .filter((t) => t.kind === kind)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="Duración (min)" hint={durationLabel(duration || 0)}>
                <Input type="number" inputMode="numeric" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)} />
              </Field>
            </div>
          </Card>

          <Card className="p-4 md:p-5">
            <SectionTitle
              title="Costos directos"
              subtitle="Lo que gastás cada vez que lo hacés"
              action={
                selected ? (
                  <button type="button" onClick={() => load(selected.id)} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
                    <RotateCcw className="size-3.5" /> Restaurar
                  </button>
                ) : null
              }
            />
            <div className="mt-4 space-y-2">
              {rows.map((r) => (
                <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <Input value={r.concept} onChange={(e) => setRows((list) => list.map((x) => (x.key === r.key ? { ...x, concept: e.target.value } : x)))} placeholder="Concepto" className="h-10" />
                  <button
                    type="button"
                    aria-label="Quitar"
                    onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                    className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger sm:order-3"
                  >
                    <X className="size-4" />
                  </button>
                  <MoneyInput
                    className="col-span-2 h-10 sm:order-2 sm:col-span-1"
                    value={r.amount || null}
                    onChange={(v) => setRows((list) => list.map((x) => (x.key === r.key ? { ...x, amount: v ?? 0 } : x)))}
                    currency={r.currency}
                    onCurrencyChange={(c) => setRows((list) => list.map((x) => (x.key === r.key ? { ...x, currency: c } : x)))}
                  />
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setRows((list) => [...list, { key: newKey(), concept: "", amount: 0, currency: "ARS", supplier_id: null }])}>
                <Plus className="size-3.5" /> Agregar costo
              </Button>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="text-muted">Total costos directos</span>
              <span className="font-semibold tabular-nums text-ink">
                {money(directArs)} <span className="font-normal text-muted">· {money(directArs / usdRate, "USD")}</span>
              </span>
            </div>
          </Card>

          <Card className="p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <SectionTitle title="Gastos fijos prorrateados" subtitle="Alquiler, sueldos, servicios… repartidos por hora de trabajo" />
              <Switch checked={includeFixed} onChange={setIncludeFixed} label="Incluir gastos fijos" />
            </div>
            <div className={cn("mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3", !includeFixed && "opacity-50")}>
              <div className="rounded-xl bg-subtle p-3">
                <p className="text-xs text-muted">Gastos fijos / mes</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{money(fixedMonthly)}</p>
              </div>
              <Field label="Horas de trabajo / mes">
                <Input type="number" inputMode="numeric" min={1} value={monthlyHours} onChange={(e) => setMonthlyHours(Number(e.target.value) || 0)} className="h-10" />
              </Field>
              <div className="rounded-xl bg-subtle p-3">
                <p className="text-xs text-muted">Costo por hora</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{money(fixedPerHour)}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Impuestos y comisiones (% del precio)" hint="IIBB, comisiones de tarjeta / Mercado Pago, etc.">
                <Input type="number" inputMode="decimal" min={0} max={90} step={0.5} value={tax} onChange={(e) => setTax(Number(e.target.value) || 0)} className="h-10" />
              </Field>
              {monthlyHours !== Number(settings.monthly_hours) || tax !== Number(settings.tax_percent) ? (
                <Button variant="ghost" size="sm" onClick={saveDefaults} loading={updateSettings.isPending}>
                  Guardar como predeterminado
                </Button>
              ) : null}
            </div>
          </Card>

          <Card className="p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle title="Precio de venta" />
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "precio", label: "Tengo un precio" },
                  { value: "margen", label: "Quiero un margen" },
                ]}
              />
            </div>
            {mode === "precio" ? (
              <div className="mt-4">
                <MoneyInput size="lg" value={price} onChange={setPrice} currency={currency} onCurrencyChange={setCurrency} />
                <p className="mt-2 text-xs text-muted">
                  Precio mínimo para no perder: <b className="font-semibold text-ink-2">{money(currency === "USD" ? breakEvenArs / usdRate : breakEvenArs, currency)}</b>
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={85}
                    step={1}
                    value={targetMargin}
                    onChange={(e) => setTargetMargin(Number(e.target.value))}
                    className="h-2 flex-1 cursor-pointer accent-[#26201c]"
                    aria-label="Margen objetivo"
                  />
                  <span className="w-16 text-right font-display text-3xl tabular-nums text-ink">{targetMargin}%</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-subtle p-4">
                  <div>
                    <p className="text-xs text-muted">Precio sugerido</p>
                    <p className="font-display text-3xl tabular-nums text-ink">{suggested ? money(suggested, currency) : "—"}</p>
                  </div>
                  <Segmented
                    size="sm"
                    value={currency}
                    onChange={setCurrency}
                    options={[
                      { value: "USD", label: "USD" },
                      { value: "ARS", label: "ARS" },
                    ]}
                  />
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Resultado */}
        <div className="lg:col-span-5">
          <div className="space-y-4 lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-card bg-brand p-5 text-white shadow-lift">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-white/60">Ganancia neta por {selected ? selected.name.toLowerCase() : "tratamiento"}</span>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", b.margin >= 40 ? "bg-[#d9efe1] text-[#2b6b47]" : b.margin >= 15 ? "bg-[#fbecd0] text-[#8a5a12]" : "bg-[#f8e5e2] text-[#9c3a31]")}>
                  {percent(b.margin)} margen
                </span>
              </div>
              <p className={cn("mt-2 font-display text-[44px] leading-none tabular-nums", b.profitArs < 0 && "text-[#f3b2a9]")}>{money(b.profitArs)}</p>
              <p className="mt-1.5 text-sm tabular-nums text-white/60">
                ≈ {money(b.profitArs / usdRate, "USD")} · {money(b.profitPerHour)} por hora
              </p>

              <div className="mt-5">
                <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-white/10">
                  {segments.map((s) =>
                    s.value > 0 ? <span key={s.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / segTotal) * 100}%`, background: s.color }} title={`${s.label}: ${money(s.value)}`} /> : null,
                  )}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {segments.map((s) => (
                    <li key={s.label} className="flex items-center gap-2 text-white/75">
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                      <span className="flex-1">{s.label}</span>
                      <span className="tabular-nums text-white">{priceArs > 0 ? percent((s.value / priceArs) * 100) : "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <Card className="p-4 md:p-5">
              <dl className="space-y-2.5 text-sm">
                <Line label="Precio de venta" value={money(priceArs)} hint={currency === "USD" ? money(effectivePrice, "USD") : undefined} strong />
                <Line label="− Costos directos" value={money(b.directArs)} />
                <Line label="− Gastos fijos prorrateados" value={money(b.fixedArs)} hint={includeFixed ? `${durationLabel(duration)} × ${money(fixedPerHour)}/h` : "no incluidos"} />
                <Line label={`− Impuestos y comisiones (${tax}%)`} value={money(b.taxArs)} />
                <div className="border-t border-line pt-2.5">
                  <Line label="= Ganancia neta" value={money(b.profitArs)} strong tone={b.profitArs < 0 ? "danger" : "success"} />
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">Cotización usada: {money(usdRate)} por dólar (se cambia en Ajustes).</p>
              {selected ? (
                <Button className="mt-4 w-full" size="lg" onClick={save} loading={saveTreatment.isPending} disabled={!dirty}>
                  <Save className="size-4" /> {dirty ? `Guardar en ${selected.name}` : "Sin cambios para guardar"}
                </Button>
              ) : null}
            </Card>
          </div>
        </div>
      </div>

      <Ranking treatments={treatments} usdRate={usdRate} fixedPerHour={fixedPerHour} tax={tax} onPick={load} />
    </div>
  );
}

function Line({ label, value, hint, strong, tone }: { label: string; value: string; hint?: string; strong?: boolean; tone?: "danger" | "success" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("text-ink-2", strong && "font-semibold text-ink")}>
        {label}
        {hint ? <span className="ml-1.5 text-xs font-normal text-muted">{hint}</span> : null}
      </dt>
      <dd className={cn("tabular-nums", strong ? "font-semibold" : "text-ink-2", tone === "danger" && "text-danger", tone === "success" && "text-success")}>{value}</dd>
    </div>
  );
}

function Ranking({ treatments, usdRate, fixedPerHour, tax, onPick }: { treatments: TreatmentWithCosts[]; usdRate: number; fixedPerHour: number; tax: number; onPick: (id: string) => void }) {
  const [sort, setSort] = useState<"hora" | "margen" | "ganancia">("hora");
  const rows = useMemo(
    () =>
      treatments
        .filter((t) => t.active && t.price > 0)
        .map((t) => {
          const b = profitBreakdown({ priceArs: treatmentPriceArs(t, usdRate), directArs: treatmentCostArs(t, usdRate), durationMin: t.duration_min, fixedPerHour, taxPercent: tax });
          return { t, b };
        })
        .sort((x, y) => (sort === "hora" ? y.b.profitPerHour - x.b.profitPerHour : sort === "margen" ? y.b.margin - x.b.margin : y.b.profitArs - x.b.profitArs)),
    [treatments, usdRate, fixedPerHour, tax, sort],
  );
  const maxPerHour = Math.max(1, ...rows.map((r) => r.b.profitPerHour));

  return (
    <Card className="mt-6 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4 md:px-5">
        <SectionTitle title="Ranking de rentabilidad" subtitle="Qué tratamiento deja más por cada hora de tu tiempo" />
        <Segmented
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: "hora", label: "Por hora" },
            { value: "margen", label: "Margen %" },
            { value: "ganancia", label: "Ganancia" },
          ]}
        />
      </div>
      <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,1.4fr)] gap-4 bg-subtle px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted md:grid">
        <span>Tratamiento</span>
        <span className="text-right">Precio</span>
        <span className="text-right">Ganancia</span>
        <span className="text-right">Margen</span>
        <span>Por hora</span>
      </div>
      <ul className="divide-y divide-line/70">
        {rows.map(({ t, b }, i) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => {
                onPick(t.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm transition-colors hover:bg-subtle md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,1.4fr)] md:px-5"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="w-5 shrink-0 text-xs tabular-nums text-faint">{i + 1}</span>
                <ColorDot color={t.color} />
                <span className="truncate font-medium text-ink">{t.name}</span>
              </span>
              <span className="text-right tabular-nums text-ink-2 max-md:hidden">{money(t.price, t.currency)}</span>
              <span className="text-right tabular-nums text-ink-2 max-md:hidden">{money(b.profitArs)}</span>
              <span className="text-right md:block">
                <Badge tone={b.margin >= 40 ? "success" : b.margin >= 15 ? "warning" : "danger"}>{percent(b.margin)}</Badge>
              </span>
              <span className="col-span-2 flex items-center gap-2 md:col-span-1">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(0, (b.profitPerHour / maxPerHour) * 100)}%` }} />
                </span>
                <span className="w-24 text-right text-xs font-semibold tabular-nums text-ink">{money(b.profitPerHour)}/h</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function toRows(t: TreatmentWithCosts | undefined | null): Row[] {
  return (t?.costs ?? []).map((c) => ({ key: c.id, concept: c.concept, amount: c.amount, currency: c.currency, supplier_id: c.supplier_id }));
}
