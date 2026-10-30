import { toArs } from "@/lib/format";
import type { CalendarAppointment, Currency, TreatmentWithCosts } from "@/lib/types";

/** Pagado / saldo de un turno en la moneda del turno. */
export function appointmentPaid(appt: Pick<CalendarAppointment, "currency" | "price" | "payments">) {
  const paid = (appt.payments ?? []).reduce(
    (total, p) => total + (appt.currency === "USD" ? (p.amount_usd ?? 0) : (p.amount_ars ?? 0)),
    0,
  );
  const price = appt.price ?? 0;
  const balance = Math.max(0, Math.round((price - paid) * 100) / 100);
  return { paid, price, balance, settled: price > 0 && balance <= 0.009, ratio: price > 0 ? Math.min(1, paid / price) : 0 };
}

/** Costo directo de un tratamiento en pesos. */
export function treatmentCostArs(t: Pick<TreatmentWithCosts, "costs">, usdRate: number) {
  return (t.costs ?? []).reduce((total, c) => total + toArs(c.amount, c.currency, usdRate), 0);
}

export function treatmentPriceArs(t: { price: number; currency: Currency }, usdRate: number) {
  return toArs(t.price, t.currency, usdRate);
}

export type ProfitBreakdown = {
  priceArs: number;
  directArs: number;
  fixedArs: number;
  taxArs: number;
  profitArs: number;
  margin: number; // % sobre precio
  profitPerHour: number;
};

/** Rentabilidad: precio − costos directos − gastos fijos prorrateados por hora − impuestos. */
export function profitBreakdown(input: {
  priceArs: number;
  directArs: number;
  durationMin: number;
  fixedPerHour: number;
  taxPercent: number;
  includeFixed?: boolean;
}): ProfitBreakdown {
  const fixedArs = input.includeFixed === false ? 0 : (input.fixedPerHour * input.durationMin) / 60;
  const taxArs = (input.priceArs * input.taxPercent) / 100;
  const profitArs = input.priceArs - input.directArs - fixedArs - taxArs;
  const margin = input.priceArs > 0 ? (profitArs / input.priceArs) * 100 : 0;
  const hours = Math.max(input.durationMin, 1) / 60;
  return {
    priceArs: input.priceArs,
    directArs: input.directArs,
    fixedArs,
    taxArs,
    profitArs,
    margin,
    profitPerHour: profitArs / hours,
  };
}

/** Precio sugerido para alcanzar un margen objetivo, redondeado a un número "lindo". */
export function priceForMargin(input: { directArs: number; fixedArs: number; taxPercent: number; marginPercent: number }) {
  const denom = 1 - input.taxPercent / 100 - input.marginPercent / 100;
  if (denom <= 0.01) return null;
  return (input.directArs + input.fixedArs) / denom;
}

export function niceRound(value: number, currency: Currency) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = currency === "USD" ? (value >= 2000 ? 100 : 50) : value >= 1_000_000 ? 50_000 : value >= 100_000 ? 10_000 : 1_000;
  return Math.ceil(value / step) * step;
}
