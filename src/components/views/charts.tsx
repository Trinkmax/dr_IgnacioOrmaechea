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

// ---------------------------------------------------------------------------
// Columnas (simples o apiladas) con línea de referencia opcional
// ---------------------------------------------------------------------------
export type ColumnSeries = { name: string; color: string };
export type ColumnDatum = { key: string; label: string; longLabel: string; values: number[]; dim?: boolean; extra?: string };

/** Columnas sobre un solo eje. Varias series = segmentos apilados con 2px de separación. */
export function ColumnChart({
  data,
  series,
  formatValue = (v) => String(Math.round(v)),
  formatTick,
  reference,
  height = 200,
  caption,
}: {
  data: ColumnDatum[];
  series: ColumnSeries[];
  formatValue?: (v: number) => string;
  formatTick?: (v: number) => string;
  reference?: { value: number; label: string };
  height?: number;
  caption: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => d.values.reduce((t, v) => t + v, 0));
  const rawMax = Math.max(1, ...totals, reference?.value ?? 0);
  const step = niceStep(rawMax, 4);
  const top = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const active = hover != null ? data[hover] : null;
  const stacked = series.length > 1;
  const tick = formatTick ?? formatValue;

  return (
    <div className="select-none">
      {stacked ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
          {series.map((s) => (
            <LegendDot key={s.name} color={s.color}>
              {s.name}
            </LegendDot>
          ))}
        </div>
      ) : null}
      <div className="relative flex" style={{ height }}>
        <div className="relative w-10 shrink-0">
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted" style={{ bottom: `${(t / top) * 100}%` }}>
              {tick(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className={cn("absolute inset-x-0 border-t", t === 0 ? "border-line-strong" : "border-line/70")} style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          {reference ? (
            <div className="pointer-events-none absolute inset-x-0 z-[1] border-t-[1.5px] border-ink-2/60" style={{ bottom: `${(reference.value / top) * 100}%` }}>
              <span className="absolute -top-[18px] right-0 rounded bg-surface/90 px-1 text-[10px] font-medium text-ink-2">{reference.label}</span>
            </div>
          ) : null}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => {
              const total = totals[i];
              const lastNonZero = d.values.reduce((last, v, idx) => (v > 0 ? idx : last), -1);
              return (
                <div
                  key={d.key}
                  className="relative flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover((h) => (h === i ? null : i))}
                >
                  <div className={cn("absolute inset-x-0.5 inset-y-0 rounded-lg transition-colors", hover === i && "bg-sunken/70")} />
                  <div
                    className={cn("relative mx-[18%] flex w-full max-w-[24px] flex-col-reverse gap-[2px] transition-[height] duration-500 ease-out", d.dim && "opacity-45")}
                    style={{ height: `${(total / top) * 100}%` }}
                    aria-hidden
                  >
                    {d.values.map((v, idx) =>
                      v > 0 ? (
                        <div
                          key={idx}
                          className={cn("min-h-[2px] w-full", idx === lastNonZero && "rounded-t-[4px]")}
                          style={{ flexGrow: v, flexBasis: 0, background: series[idx]?.color }}
                        />
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {active && hover != null ? (
            <div
              className="pointer-events-none absolute z-10 w-48 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-xs shadow-pop"
              style={{ left: `${Math.min(Math.max(((hover + 0.5) / data.length) * 100, 22), 78)}%`, top: 4 }}
            >
              <p className="mb-1.5 font-semibold text-ink first-letter:uppercase">{active.longLabel}</p>
              {series.map((s, idx) => (
                <TooltipRow key={s.name} color={s.color} label={s.name} value={formatValue(active.values[idx] ?? 0)} />
              ))}
              {stacked ? (
                <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 font-semibold">
                  <span className="text-ink-2">Total</span>
                  <span className="tabular-nums text-ink">{formatValue(totals[hover])}</span>
                </div>
              ) : null}
              {active.extra ? <p className="mt-1.5 text-muted">{active.extra}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="ml-10 mt-2 flex">
        {data.map((d, i) => (
          <span key={d.key} className={cn("flex-1 truncate text-center text-[11px]", hover === i ? "font-semibold text-ink" : "text-muted")}>
            {d.label}
          </span>
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th>Período</th>
              {series.map((s) => (
                <th key={s.name}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td>{d.longLabel}</td>
                {d.values.map((v, idx) => (
                  <td key={idx}>{formatValue(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapa de calor (secuencial, un solo tono)
// ---------------------------------------------------------------------------
const HEAT = "#3b78b8";

export function Heatmap({
  rows,
  cols,
  matrix,
  describe,
  caption,
}: {
  rows: string[];
  cols: string[];
  matrix: number[][];
  describe: (row: number, col: number, value: number) => string;
  caption: string;
}) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const max = Math.max(1, ...matrix.flat());
  const fill = (v: number) => (v <= 0 ? "var(--color-sunken)" : `color-mix(in oklab, ${HEAT} ${Math.round(18 + 82 * (v / max))}%, white)`);
  const peak = matrix.flatMap((r, ri) => r.map((v, ci) => ({ v, ri, ci }))).sort((a, b) => b.v - a.v)[0];

  return (
    <div className="select-none">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `2.5rem repeat(${cols.length}, minmax(0, 1fr))` }}>
        <span />
        {cols.map((c, ci) => (
          <span key={c} className={cn("pb-1 text-center text-[10px] tabular-nums text-muted", ci % 2 === 1 && "max-sm:invisible")}>
            {c}
          </span>
        ))}
        {rows.map((r, ri) => (
          <div key={r} className="contents">
            <span className="flex items-center text-[11px] font-medium text-ink-2">{r}</span>
            {cols.map((c, ci) => {
              const v = matrix[ri]?.[ci] ?? 0;
              const isHover = hover?.[0] === ri && hover?.[1] === ci;
              return (
                <div
                  key={c}
                  title={describe(ri, ci, v)}
                  onMouseEnter={() => setHover([ri, ci])}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover([ri, ci])}
                  className={cn("h-7 rounded-[4px] transition-shadow", isHover && "ring-2 ring-ink/70 ring-offset-1 ring-offset-surface")}
                  style={{ background: fill(v) }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p className="min-h-4 text-ink-2">
          {hover
            ? describe(hover[0], hover[1], matrix[hover[0]]?.[hover[1]] ?? 0)
            : peak && peak.v > 0
              ? `Pico: ${describe(peak.ri, peak.ci, peak.v)}`
              : "Sin turnos en el período"}
        </p>
        <span className="inline-flex items-center gap-1.5">
          Menos
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <span key={t} className="size-3 rounded-[3px]" style={{ background: t === 0 ? "var(--color-sunken)" : fill(t * max) }} />
          ))}
          Más
        </span>
      </div>
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th>Día</th>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r}>
                <td>{r}</td>
                {cols.map((c, ci) => (
                  <td key={c}>{matrix[ri]?.[ci] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
