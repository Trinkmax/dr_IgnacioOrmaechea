"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calculator, Clock, Plus, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { Badge, EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { useOverlay } from "@/components/shell/overlay-store";
import { useRecurringExpenses, useSettings, useTreatments } from "@/lib/queries/catalog";
import { useRole } from "@/lib/queries/session";
import { profitBreakdown, treatmentCostArs, treatmentPriceArs } from "@/lib/money-helpers";
import { durationLabel, money, percent, toArs } from "@/lib/format";
import { colorVars } from "@/lib/colors";
import { cn, normalize } from "@/lib/utils";
import { KIND_META, type TreatmentKind } from "@/lib/types";

type Filter = "todos" | TreatmentKind;

export function TreatmentsView() {
  const { open } = useOverlay();
  const { isAdmin } = useRole();
  const { data: treatments = [], isLoading } = useTreatments();
  const { data: settings } = useSettings();
  const { data: recurring = [] } = useRecurringExpenses(isAdmin);
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const usdRate = settings?.usd_rate ?? 1;
  const fixedPerHour = settings
    ? recurring.filter((r) => r.active).reduce((t, r) => t + toArs(r.amount, r.currency, usdRate), 0) / Number(settings.monthly_hours || 1)
    : 0;

  const groups = useMemo(() => {
    const q = normalize(query);
    const list = treatments.filter((t) => (showInactive || t.active) && (filter === "todos" || t.kind === filter) && (!q || normalize(t.name).includes(q)));
    return (["cirugia", "procedimiento", "consulta"] as TreatmentKind[])
      .map((kind) => ({ kind, items: list.filter((t) => t.kind === kind) }))
      .filter((g) => g.items.length);
  }, [treatments, filter, query, showInactive]);

  const counts = useMemo(() => {
    const active = treatments.filter((t) => t.active);
    return {
      cirugia: active.filter((t) => t.kind === "cirugia").length,
      procedimiento: active.filter((t) => t.kind === "procedimiento").length,
      consulta: active.filter((t) => t.kind === "consulta").length,
    };
  }, [treatments]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Tratamientos"
        subtitle={isAdmin ? "Precios de venta, duración y estructura de costos de cada tratamiento" : "Lista de precios vigente"}
        actions={
          isAdmin ? (
            <>
              <Link href="/calculadora" className="hidden sm:block">
                <Button variant="secondary">
                  <Calculator className="size-4" /> Calculadora
                </Button>
              </Link>
              <Button onClick={() => open({ type: "treatment-form" })}>
                <Plus className="size-4" /> Nuevo
              </Button>
            </>
          ) : null
        }
      />

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tratamiento" className={cn(controlClass, "h-11 pl-10 shadow-card")} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "todos", label: "Todos" },
              { value: "cirugia", label: "Cirugías", count: counts.cirugia },
              { value: "procedimiento", label: "Procedimientos", count: counts.procedimiento },
              { value: "consulta", label: "Consultas", count: counts.consulta },
            ]}
          />
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className={cn("h-9 shrink-0 rounded-xl border px-3 text-[13px] font-medium", showInactive ? "border-brand bg-brand text-white" : "border-line bg-surface text-muted")}
            >
              Inactivos
            </button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-36 rounded-card" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="Sin tratamientos" description={query ? `No hay coincidencias para “${query}”.` : "Cargá tus tratamientos con precio y costos."} />
      ) : (
        groups.map((group) => (
          <section key={group.kind} className="mt-7">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{KIND_META[group.kind].plural}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((t) => {
                const priceArs = treatmentPriceArs(t, usdRate);
                const costArs = treatmentCostArs(t, usdRate);
                const b = profitBreakdown({ priceArs, directArs: costArs, durationMin: t.duration_min, fixedPerHour, taxPercent: Number(settings?.tax_percent ?? 0) });
                const marginTone = b.margin >= 40 ? "success" : b.margin >= 15 ? "warning" : "danger";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => open({ type: "treatment-form", treatmentId: t.id })}
                    style={colorVars(t.color)}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface p-4 text-left shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lift",
                      !t.active && "opacity-60",
                    )}
                  >
                    <span className="absolute inset-x-0 top-0 h-1 bg-[var(--tc)]" aria-hidden />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-ink">{t.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                          <Clock className="size-3" /> {durationLabel(t.duration_min)}
                          {!t.active ? " · inactivo" : ""}
                        </p>
                      </div>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--tc-soft)]">
                        <span className="size-2.5 rounded-full bg-[var(--tc)]" />
                      </span>
                    </div>
                    <p className="mt-4 font-display text-[24px] leading-none tracking-[-0.03em] tabular-nums text-ink">{money(t.price, t.currency)}</p>
                    {t.currency === "USD" ? <p className="mt-1 text-xs tabular-nums text-muted">≈ {money(priceArs)}</p> : <p className="mt-1 text-xs text-transparent">·</p>}
                    {isAdmin ? (
                      <div className="mt-4 border-t border-line pt-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted">
                            Costo <b className="font-semibold text-ink-2">{money(costArs)}</b>
                          </span>
                          {priceArs > 0 ? <Badge tone={marginTone}>{percent(b.margin)} margen</Badge> : <Badge>Sin precio</Badge>}
                        </div>
                        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-sunken">
                          {priceArs > 0 ? (
                            <>
                              <span className="h-full bg-[#3b78b8]" style={{ width: `${Math.min(100, (costArs / priceArs) * 100)}%` }} />
                              <span className="h-full bg-[#c0643f]" style={{ width: `${Math.min(100, (b.fixedArs / priceArs) * 100)}%` }} />
                            </>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[11px] text-muted">
                          Ganancia neta <b className="font-semibold text-ink-2">{money(b.profitArs)}</b> · {money(b.profitPerHour)}/h
                        </p>
                      </div>
                    ) : t.description ? (
                      <p className="mt-3 line-clamp-2 text-xs text-muted">{t.description}</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
