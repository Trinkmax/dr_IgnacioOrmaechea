"use client";

import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useDroppable } from "@dnd-kit/core";
import { isSameDay, isToday, isWeekend } from "date-fns";
import { Plus } from "lucide-react";
import { fmt, time } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarAppointment } from "@/lib/types";
import { HOUR_PX, PX_PER_MIN, atMinutes, dayKey, layoutOverlaps, minutesOfDay } from "@/components/agenda/calendar-utils";
import { TimeGridCard } from "@/components/agenda/event-card";

export type GridPreview = {
  appt: CalendarAppointment;
  day: Date;
  start: Date;
  end: Date;
};

type Props = {
  days: Date[];
  appointments: CalendarAppointment[];
  startHour: number;
  endHour: number;
  workStart: number;
  workEnd: number;
  now: Date;
  preview: GridPreview | null;
  draggingId: string | null;
  isDragging: boolean;
  placing: boolean;
  showHeader: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onOpen: (id: string) => void;
  onSlot: (start: Date) => void;
  onDayClick: (day: Date) => void;
};

export function TimeGrid(props: Props) {
  const { days, appointments, startHour, endHour, now, scrollRef, showHeader } = props;
  const totalHours = endHour - startHour;
  const gridHeight = totalHours * HOUR_PX;
  const hours = Array.from({ length: totalHours }, (_, i) => startHour + i);
  const firstDay = dayKey(days[0]);

  // Posicionar el scroll: hora actual si hoy está visible, si no el primer turno.
  const positionedFor = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || positionedFor.current === firstDay) return;
    positionedFor.current = firstDay;
    const todayVisible = days.some((d) => isToday(d));
    let targetMin: number;
    if (todayVisible) {
      targetMin = minutesOfDay(new Date()) - 60;
    } else {
      const visible = appointments.filter((a) => days.some((d) => isSameDay(new Date(a.starts_at), d)));
      targetMin = visible.length ? Math.min(...visible.map((a) => minutesOfDay(new Date(a.starts_at)))) - 30 : startHour * 60;
    }
    el.scrollTo({ top: Math.max(0, (targetMin - startHour * 60) * PX_PER_MIN) });
  }, [firstDay, days, appointments, startHour, scrollRef]);

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" data-calendar-scroll>
      {showHeader ? (
        <div className="sticky top-0 z-20 flex border-b border-line bg-surface/95 backdrop-blur">
          <div className="w-12 shrink-0 md:w-14" />
          {days.map((d) => {
            const today = isToday(d);
            return (
              <button
                key={dayKey(d)}
                type="button"
                onClick={() => props.onDayClick(d)}
                className="flex min-w-0 flex-1 flex-col items-center gap-0.5 border-l border-line/70 py-2 transition-colors first:border-l-0 hover:bg-subtle"
              >
                <span className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", today ? "text-accent-ink" : "text-muted")}>{fmt(d, "EEE")}</span>
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full font-display text-[15px] leading-none",
                    today ? "bg-brand text-white" : "text-ink",
                  )}
                >
                  {fmt(d, "d")}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="relative flex" style={{ height: gridHeight }}>
        {/* Horas */}
        <div className="relative w-12 shrink-0 md:w-14" aria-hidden>
          {hours.map((h, i) => (
            <span
              key={h}
              className={cn("absolute right-2 text-[10.5px] tabular-nums text-muted", i === 0 ? "translate-y-0.5" : "-translate-y-1/2")}
              style={{ top: i * HOUR_PX }}
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
          {days.some((d) => isToday(d)) && minutesOfDay(now) >= startHour * 60 && minutesOfDay(now) <= endHour * 60 ? (
            <span
              className="absolute right-1 z-10 -translate-y-1/2 rounded-md bg-accent px-1 py-px text-[10px] font-semibold tabular-nums text-white"
              style={{ top: (minutesOfDay(now) - startHour * 60) * PX_PER_MIN }}
            >
              {time(now)}
            </span>
          ) : null}
        </div>

        {days.map((d) => (
          <DayColumn key={dayKey(d)} day={d} {...props} />
        ))}
      </div>
    </div>
  );
}

const DayColumn = memo(function DayColumn({
  day,
  appointments,
  startHour,
  endHour,
  workStart,
  workEnd,
  now,
  preview,
  draggingId,
  isDragging,
  placing,
  onOpen,
  onSlot,
}: Props & { day: Date }) {
  const key = dayKey(day);
  const { setNodeRef, isOver } = useDroppable({ id: `col:${key}`, data: { kind: "col", day } });
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const dayStartMin = startHour * 60;
  const dayEndMin = endHour * 60;

  const items = useMemo(() => {
    const dayStart = atMinutes(day, 0).getTime();
    const dayEnd = dayStart + 24 * 60 * 60_000;
    const list = appointments
      .filter((a) => new Date(a.starts_at).getTime() < dayEnd && new Date(a.ends_at).getTime() > dayStart)
      .map((a) => {
        const s = Math.max(new Date(a.starts_at).getTime(), dayStart);
        const e = Math.min(new Date(a.ends_at).getTime(), dayEnd);
        return { id: a.id, appt: a, start: (s - dayStart) / 60_000, end: (e - dayStart) / 60_000 };
      });
    const layout = layoutOverlaps(list);
    return list.map((item) => ({ ...item, ...layout.get(item.id)! }));
  }, [appointments, day]);

  const today = isToday(day);
  const nowMin = minutesOfDay(now);
  const showPreview = preview && dayKey(preview.day) === key;

  const minuteFromEvent = (clientY: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return dayStartMin + (clientY - rect.top) / PX_PER_MIN;
  };

  return (
    <div
      ref={setNodeRef}
      data-col={key}
      onClick={(e) => {
        const min = Math.floor(minuteFromEvent(e.clientY, e.currentTarget) / 30) * 30;
        onSlot(atMinutes(day, Math.max(dayStartMin, Math.min(min, dayEndMin - 30))));
      }}
      onMouseMove={(e) => {
        if (isDragging) return;
        const min = Math.floor(minuteFromEvent(e.clientY, e.currentTarget) / 30) * 30;
        if (min !== hoverMin) setHoverMin(min);
      }}
      onMouseLeave={() => setHoverMin(null)}
      className={cn(
        "time-grid-lines relative min-w-0 flex-1 border-l border-line/70",
        isWeekend(day) && "bg-subtle/60",
        isOver && "bg-accent-soft/30",
        placing ? "cursor-copy" : "cursor-default",
      )}
      style={{ ["--hour-h" as string]: `${HOUR_PX}px` }}
    >
      {/* Fuera del horario de atención */}
      {workStart > startHour ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-[#efe9e1]/45" style={{ height: (workStart - startHour) * HOUR_PX }} />
      ) : null}
      {workEnd < endHour ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#efe9e1]/45" style={{ height: (endHour - workEnd) * HOUR_PX }} />
      ) : null}

      {/* Sugerencia al pasar el mouse */}
      {hoverMin != null && !isDragging && !items.some((i) => i.start < hoverMin + 30 && i.end > hoverMin) ? (
        <div
          className="pointer-events-none absolute inset-x-1 hidden items-center gap-1 rounded-lg border border-dashed border-accent/50 bg-accent-soft/40 px-2 text-[11px] font-medium text-accent-ink [@media(pointer:fine)]:flex"
          style={{ top: (hoverMin - dayStartMin) * PX_PER_MIN + 1, height: 30 * PX_PER_MIN - 2 }}
        >
          <Plus className="size-3" /> {time(atMinutes(day, hoverMin))}
        </div>
      ) : null}

      {items.map((item) => {
        const top = (item.start - dayStartMin) * PX_PER_MIN;
        const height = Math.max((item.end - item.start) * PX_PER_MIN - 2, 18);
        const width = 100 / item.cols;
        return (
          <TimeGridCard
            key={item.id}
            appt={item.appt}
            height={height}
            dimmed={draggingId === item.id}
            onOpen={onOpen}
            style={{
              top: top + 1,
              height,
              left: `calc(${item.col * width}% + 2px)`,
              width: `calc(${width}% - 4px)`,
            }}
          />
        );
      })}

      {showPreview ? (
        <TimeGridCard
          appt={{ ...preview.appt, starts_at: preview.start.toISOString(), ends_at: preview.end.toISOString() }}
          ghost
          height={Math.max(((preview.end.getTime() - preview.start.getTime()) / 60_000) * PX_PER_MIN - 2, 18)}
          previewLabel={`${time(preview.start)} – ${time(preview.end)}`}
          style={{
            top: (minutesOfDay(preview.start) - dayStartMin) * PX_PER_MIN + 1,
            height: Math.max(((preview.end.getTime() - preview.start.getTime()) / 60_000) * PX_PER_MIN - 2, 18),
            left: 2,
            right: 2,
          }}
        />
      ) : null}

      {today && nowMin >= dayStartMin && nowMin <= dayEndMin ? (
        <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: (nowMin - dayStartMin) * PX_PER_MIN }}>
          <div className="relative h-[2px] bg-accent">
            <span className="absolute -left-[5px] -top-[4px] size-[10px] rounded-full bg-accent ring-2 ring-surface" />
          </div>
        </div>
      ) : null}
    </div>
  );
});
