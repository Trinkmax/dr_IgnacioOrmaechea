import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { Currency } from "@/lib/types";

const arsFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export const CURRENCY_PREFIX: Record<Currency, string> = { ARS: "$", USD: "US$" };

/** $ 1.250.000 · US$ 5.500 */
export function money(amount: number | null | undefined, currency: Currency = "ARS", opts?: { decimals?: boolean; sign?: boolean }) {
  const value = amount ?? 0;
  const abs = Math.abs(value);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const body = opts?.decimals && hasCents ? decimalFormatter.format(abs) : arsFormatter.format(Math.round(abs));
  const sign = value < 0 ? "−" : opts?.sign && value > 0 ? "+" : "";
  return `${sign}${CURRENCY_PREFIX[currency]} ${body}`;
}

/** $ 12,4 M · $ 850 mil · US$ 5,5 mil */
export function moneyCompact(amount: number | null | undefined, currency: Currency = "ARS") {
  const value = amount ?? 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const prefix = CURRENCY_PREFIX[currency];
  if (abs >= 1_000_000) return `${sign}${prefix} ${percentFormatter.format(abs / 1_000_000)} M`;
  if (abs >= 10_000) return `${sign}${prefix} ${arsFormatter.format(Math.round(abs / 1000))} mil`;
  return `${sign}${prefix} ${arsFormatter.format(Math.round(abs))}`;
}

export function number(value: number | null | undefined) {
  return arsFormatter.format(Math.round(value ?? 0));
}

export function percent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${percentFormatter.format(value)}%`;
}

/** Convierte a pesos con la cotización dada. */
export function toArs(amount: number, currency: Currency, usdRate: number) {
  return currency === "USD" ? amount * usdRate : amount;
}

export function toUsd(amount: number, currency: Currency, usdRate: number) {
  return currency === "USD" ? amount : amount / usdRate;
}

/** Parsea montos escritos a la argentina: "1.250.000,50" o "1250000.5" */
export function parseAmount(input: string): number | null {
  const raw = input.trim().replace(/\s|\$|US/gi, "");
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if ((raw.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Formato mientras se escribe: agrega puntos de miles y respeta la coma decimal. */
export function formatAmountInput(input: string) {
  const cleaned = input.replace(/[^\d,]/g, "");
  const [intPart, ...decParts] = cleaned.split(",");
  const intDigits = intPart.replace(/^0+(?=\d)/, "");
  const withDots = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decParts.length === 0) return withDots;
  return `${withDots || "0"},${decParts.join("").slice(0, 2)}`;
}

export function amountToInput(value: number | null | undefined) {
  if (value == null || value === 0) return "";
  const [intPart, decPart] = value.toFixed(2).split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart === "00" ? withDots : `${withDots},${decPart}`;
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------
export function toDate(value: string | Date) {
  return typeof value === "string" ? parseISO(value) : value;
}

export function fmt(value: string | Date, pattern: string) {
  return format(toDate(value), pattern, { locale: es });
}

export const time = (value: string | Date) => fmt(value, "HH:mm");

/** "hoy", "mañana", "ayer" o "jue 30 oct" */
export function relativeDay(value: string | Date, long = false) {
  const date = toDate(value);
  if (isToday(date)) return "hoy";
  if (isTomorrow(date)) return "mañana";
  if (isYesterday(date)) return "ayer";
  return format(date, long ? "EEEE d 'de' MMMM" : "EEE d MMM", { locale: es });
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function since(value: string | Date) {
  return formatDistanceToNowStrict(toDate(value), { locale: es, addSuffix: true });
}

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Fecha local "yyyy-MM-dd" (sin desfasaje de zona horaria). */
export function isoDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function age(birthDate: string | null | undefined) {
  if (!birthDate) return null;
  const b = parseISO(birthDate);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years--;
  return years >= 0 && years < 130 ? years : null;
}
