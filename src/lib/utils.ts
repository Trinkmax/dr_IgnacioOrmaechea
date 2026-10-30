import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normaliza para búsquedas: minúsculas y sin acentos. */
export function normalize(text: string | null | undefined) {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const HONORIFICS = new Set(["dr", "dra", "lic", "sr", "sra", "srta", "prof"]);
const isHonorific = (word: string) => HONORIFICS.has(word.replace(/\./g, "").toLowerCase());

/** "Dr. Ignacio Ormaechea" -> "IO" (saltea títulos). */
export function initials(name: string | null | undefined) {
  const all = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const parts = all.filter((p) => !isHonorific(p));
  const words = parts.length ? parts : all;
  if (words.length === 0) return "·";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Primer nombre, salteando títulos: "Dr. Ignacio Ormaechea" -> "Ignacio". */
export function firstName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts.find((p) => !isHonorific(p));
  return first ?? parts[0] ?? "";
}

/** "María González" -> "María G." */
export function shortName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Teléfono a formato internacional para WhatsApp (asume Argentina si no tiene código). */
export function whatsappNumber(phone: string | null | undefined) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("54")) {
    // 54 + 9 + área sin 0 + número sin 15
    let rest = digits.slice(2);
    if (rest.startsWith("9")) return `54${rest}`;
    if (rest.startsWith("0")) rest = rest.slice(1);
    return `549${rest}`;
  }
  if (digits.startsWith("0")) digits = digits.slice(1);
  // Quita el "15" de celulares escritos como 11 15 xxxx xxxx
  const m = digits.match(/^(\d{2,4})15(\d{6,8})$/);
  if (m && (m[1] + m[2]).length === 10) digits = m[1] + m[2];
  if (digits.length === 10) return `549${digits}`;
  return digits;
}

export function whatsappLink(phone: string | null | undefined, text?: string) {
  const number = whatsappNumber(phone);
  if (!number) return null;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${number}${q}`;
}

export function telLink(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

export function sum<T>(items: readonly T[], pick: (item: T) => number | null | undefined) {
  let total = 0;
  for (const item of items) total += pick(item) ?? 0;
  return total;
}

export function groupBy<T, K extends string | number>(items: readonly T[], key: (item: T) => K) {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function errorMessage(error: unknown, fallback = "Algo salió mal. Probá de nuevo.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return translateError(error.message);
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return translateError(error.message);
  }
  return fallback;
}

function translateError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Tenés que confirmar tu email antes de ingresar.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sin conexión. Revisá internet y probá de nuevo.";
  if (m.includes("row-level security") || m.includes("permission denied")) {
    return "No tenés permisos para hacer esto. Pedile al Dr. que lo haga desde su cuenta.";
  }
  if (m.includes("payments_patient_id_fkey")) return "No se puede borrar: el paciente tiene cobros registrados.";
  if (m.includes("expenses_recurring_period_uidx")) return "Ese gasto fijo ya está registrado este mes.";
  if (m.includes("jwt expired")) return "Tu sesión expiró. Volvé a ingresar.";
  return message;
}
