"use client";

import { memo, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { isSameMonth, isToday } from "date-fns";
import { colorVars } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { CalendarAppointment } from "@/lib/types";
import { dayKey } from "@/components/agenda/calendar-utils";
import { MonthChip } from "@/components/agenda/event-card";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function MonthGrid({
  days,
  anchor,
  appointments,
  draggingId,
  compact,
  onOpen,
  onDay,
}: {
  days: Date[];
  anchor: Date;
  appointments: CalendarAppointment[];
  draggingId: string | null;
  compact: boolean;
  onOpen: (id: string) => void;
  onDay: (day: Date) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const a of appointments) {
      const k = dayKey(new Date(a.starts_at));
      const list = map.get(k);
      if (list) list.push(a);
      else map.set(k, [a]);
    }
    return map;
  }, [appointments]);

  const weeks = days.length / 7;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {days.map((d) => (
          <MonthCell
            key={dayKey(d)}
            day={d}
            inMonth={isSameMonth(d, anchor)}
            items={byDay.get(dayKey(d)) ?? []}
            draggingId={draggingId}
            compact={compact}
            onOpen={onOpen}
            onDay={onDay}
          />
        ))}
      </div>
    </div>
  );
}

const MonthCell = memo(function MonthCell({
  day,
  inMonth,
  items,
  draggingId,
  compact,
  onOpen,
  onDay,
}: {
  day: Date;
  inMonth: boolean;
  items: CalendarAppointment[];
  draggingId: string | null;
  compact: boolean;
  onOpen: (id: string) => void;
  onDay: (day: Date) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${dayKey(day)}`, data: { kind: "cell", day } });
  const today = isToday(day);
  const max = compact ? 0 : 3;
  const visible = items.slice(0, max);
  const extra = items.length - visible.length;

  return (
    <div
      ref={setNodeRef}
      data-cell={dayKey(day)}
      onClick={() => onDay(day)}
      className={cn(
        "flex min-h-0 min-w-0 cursor-pointer flex-col gap-1 border-b border-r border-line/70 p-1 transition-colors md:p-1.5 [&:nth-child(7n)]:border-r-0",
        !inMonth && "bg-subtle/70",
        isOver ? "bg-accent-soft/60" : "hover:bg-subtle",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums md:size-7 md:text-[13px]",
            today ? "bg-brand text-white" : inMonth ? "text-ink" : "text-faint",
          )}
        >
          {day.getDate()}
        </span>
        {compact && items.length ? <span className="text-[10px] font-semibold text-muted">{items.length}</span> : null}
      </div>
      {compact ? (
        <div className="flex flex-wrap gap-[3px] px-0.5">
          {items.slice(0, 6).map((a) => (
            <span key={a.id} style={colorVars(a.patient_id ? a.treatment?.color : "stone")} className="size-[6px] rounded-full bg-[var(--tc)]" />
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
          {visible.map((a) => (
            <MonthChip key={a.id} appt={a} onOpen={onOpen} dimmed={draggingId === a.id} />
          ))}
          {extra > 0 ? <span className="px-1.5 text-[11px] font-medium text-muted">+{extra} más</span> : null}
        </div>
      )}
    </div>
  );
});
