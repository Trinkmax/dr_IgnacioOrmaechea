import { addDays, addMinutes, differenceInMinutes, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import type { CalendarAppointment } from "@/lib/types";

export const HOUR_PX = 64;
export const PX_PER_MIN = HOUR_PX / 60;
export const SNAP_MIN = 15;

export type CalendarView = "day" | "3day" | "week" | "month";

export const dayKey = (date: Date) => format(date, "yyyy-MM-dd");

export function snap(minutes: number, step = SNAP_MIN) {
  return Math.round(minutes / step) * step;
}

export function visibleDays(view: CalendarView, anchor: Date): Date[] {
  const start = startOfDay(anchor);
  if (view === "day") return [start];
  if (view === "3day") return [0, 1, 2].map((i) => addDays(start, i));
  if (view === "week") {
    const monday = startOfWeek(start, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }
  const first = startOfWeek(startOfMonth(start), { weekStartsOn: 1 });
  const last = endOfWeek(endOfMonth(start), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return days;
}

export function rangeFor(view: CalendarView, anchor: Date) {
  const days = visibleDays(view, anchor);
  return { from: days[0], to: addDays(days[days.length - 1], 1) };
}

export function shiftAnchor(view: CalendarView, anchor: Date, dir: 1 | -1) {
  if (view === "day") return addDays(anchor, dir);
  if (view === "3day") return addDays(anchor, 3 * dir);
  if (view === "week") return addDays(anchor, 7 * dir);
  const d = new Date(anchor);
  d.setDate(1);
  d.setMonth(d.getMonth() + dir);
  return d;
}

/** Minutos desde la medianoche local. */
export function minutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function atMinutes(day: Date, minutes: number) {
  return addMinutes(startOfDay(day), minutes);
}

export function durationMin(appt: Pick<CalendarAppointment, "starts_at" | "ends_at">) {
  return Math.max(SNAP_MIN, differenceInMinutes(new Date(appt.ends_at), new Date(appt.starts_at)));
}

/** Columnas para turnos superpuestos dentro de un mismo día. */
export function layoutOverlaps<T extends { id: string; start: number; end: number }>(events: T[]) {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const result = new Map<string, { col: number; cols: number }>();
  let cluster: T[] = [];
  let clusterEnd = -Infinity;
  let columns: number[] = [];

  const flush = () => {
    for (const e of cluster) result.get(e.id)!.cols = columns.length;
    cluster = [];
    columns = [];
    clusterEnd = -Infinity;
  };

  for (const e of sorted) {
    if (cluster.length && e.start >= clusterEnd) flush();
    let col = columns.findIndex((end) => end <= e.start);
    if (col === -1) {
      col = columns.length;
      columns.push(e.end);
    } else {
      columns[col] = e.end;
    }
    result.set(e.id, { col, cols: 1 });
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  if (cluster.length) flush();
  return result;
}

/** Rango horario visible: el horario de atención, ampliado si hay turnos fuera de él. */
export function hourBounds(appointments: CalendarAppointment[], days: Date[], dayStart: number, dayEnd: number) {
  let start = dayStart;
  let end = dayEnd;
  const keys = new Set(days.map(dayKey));
  for (const a of appointments) {
    const s = new Date(a.starts_at);
    if (!keys.has(dayKey(s))) continue;
    const e = new Date(a.ends_at);
    start = Math.min(start, s.getHours());
    const endHour = dayKey(e) === dayKey(s) ? Math.ceil(minutesOfDay(e) / 60) : 24;
    end = Math.max(end, endHour);
  }
  return { startHour: Math.max(0, start), endHour: Math.min(24, Math.max(end, start + 1)) };
}
