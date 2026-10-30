"use client";

import { useState, type ReactNode } from "react";
import { money, moneyCompact, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

// Paleta validada (light, superficie blanca): CVD ΔE 20, contraste ≥ 3:1.
export const SERIES = {
  income: "#3b78b8",
  expense: "#b4592f",
};
// Composición de precio (calculadora), orden validado para segmentos adyacentes.
export const COMPOSITION = ["#3b78b8", "#c0643f", "#8a63c2", "#2a9d6e"] as const;

function niceStep(max: number, count: number) {
  const raw = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = [1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10;
  return unit * pow;
}

export type MonthDatum = { key: string; label: string; longLabel: string; income: number; expense: number };

/** Ingresos vs egresos por mes: barras agrupadas, un solo eje, tooltip por columna. */
export function IncomeExpenseChart({ data, height = 220 }: { data: MonthDatum[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const rawMax = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const step = niceStep(rawMax, 4);
  const top = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const active = hover != null ? data[hover] : null;

  return (
    <div className="select-none">
      <div className="mb-5 flex items-center gap-4 text-xs text-ink-2">
        <LegendDot color={SERIES.income}>Ingresos</LegendDot>
        <LegendDot color={SERIES.expense}>Egresos</LegendDot>
      </div>
      <div className="relative flex" style={{ height }}>
        <div className="relative w-12 shrink-0">
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted" style={{ bottom: `${(t / top) * 100}%` }}>
              {t === 0 ? "0" : moneyCompact(t).replace("$ ", "")}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className={cn("absolute inset-x-0 border-t", t === 0 ? "border-line-strong" : "border-dashed border-line")} style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <div
                key={d.key}
                className="relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover((h) => (h === i ? null : i))}
              >
                <div className={cn("absolute inset-x-1 inset-y-0 rounded-lg transition-colors", hover === i && "bg-sunken/70")} />
                <div className="relative flex h-full items-end gap-[2px]">
                  <Bar value={d.income} top={top} color={SERIES.income} />
                  <Bar value={d.expense} top={top} color={SERIES.expense} />
                </div>
              </div>
            ))}
          </div>
          {active && hover != null ? (
            <div
              className="pointer-events-none absolute z-10 w-48 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-xs shadow-pop"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%`, top: 4 }}
            >
              <p className="mb-1.5 font-semibold capitalize text-ink">{active.longLabel}</p>
              <TooltipRow color={SERIES.income} label="Ingresos" value={money(active.income)} />
              <TooltipRow color={SERIES.expense} label="Egresos" value={money(active.expense)} />
              <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 font-semibold">
                <span className="text-ink-2">Resultado</span>
                <span className={cn("tabular-nums", active.income - active.expense >= 0 ? "text-ink" : "text-danger")}>{money(active.income - active.expense)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="ml-12 mt-2 flex">
        {data.map((d, i) => (
          <span key={d.key} className={cn("flex-1 text-center text-[11px] capitalize", hover === i ? "font-semibold text-ink" : "text-muted")}>
            {d.label}
          </span>
        ))}
      </div>
      {/* Las tablas ignoran el tamaño de 1px de sr-only: se envuelve en un div. */}
      <div className="sr-only">
      <table>
        <caption>Ingresos y egresos por mes</caption>
        <thead>
          <tr>
            <th>Mes</th>
            <th>Ingresos</th>
            <th>Egresos</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.longLabel}</td>
              <td>{money(d.income)}</td>
              <td>{money(d.expense)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Bar({ value, top, color }: { value: number; top: number; color: string }) {
  const pct = top > 0 ? (value / top) * 100 : 0;
  return (
    <div
      className="w-3 rounded-t-[4px] transition-[height] duration-500 ease-out sm:w-4"
      style={{ height: `${Math.max(pct, value > 0 ? 1.5 : 0)}%`, background: color }}
      aria-hidden
    />
  );
}

function LegendDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="inline-flex items-center gap-1.5 text-ink-2">
        <span className="size-2 rounded-[2px]" style={{ background: color }} aria-hidden />
        {label}
      </span>
      <span className="font-medium tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** Lista con barras horizontales de una sola serie (magnitud). La identidad va en la etiqueta. */
export function BarList({
  items,
  formatValue = (v) => money(v),
  emptyLabel = "Sin datos todavía",
}: {
  items: { key: string; label: ReactNode; value: number; marker?: ReactNode; hint?: ReactNode }[];
  formatValue?: (v: number) => string;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((t, i) => t + i.value, 0);
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key} title={`${formatValue(item.value)} · ${percent((item.value / Math.max(total, 1)) * 100)}`}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 text-ink">
              {item.marker}
              <span className="truncate">{item.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-ink-2">
              <span className="font-semibold text-ink">{formatValue(item.value)}</span>
              {item.hint ? <span className="ml-1.5 text-muted">{item.hint}</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
