"use client";

import { memo, type CSSProperties, type SyntheticEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CheckCheck, CircleCheck, DollarSign, Lock, UserX } from "lucide-react";
import { colorVars } from "@/lib/colors";
import { appointmentPaid } from "@/lib/money-helpers";
import { time } from "@/lib/format";
import { cn, shortName } from "@/lib/utils";
import type { CalendarAppointment } from "@/lib/types";

export type DragData =
  | { kind: "appointment"; appt: CalendarAppointment }
  | { kind: "resize"; appt: CalendarAppointment }
  | { kind: "waitlist"; itemId: string };

const stop = (e: SyntheticEvent) => e.stopPropagation();

export function StatusGlyph({ appt, className }: { appt: CalendarAppointment; className?: string }) {
  switch (appt.status) {
    case "confirmado":
      return <CircleCheck className={cn("text-[var(--tc-ink)]", className)} aria-label="Confirmado" />;
    case "atendido":
      return <CheckCheck className={cn("text-[var(--tc-ink)]", className)} aria-label="Atendido" />;
    case "ausente":
      return <UserX className={cn("text-[var(--tc-ink)]", className)} aria-label="Ausente" />;
    case "en_sala":
      return (
        <span className={cn("relative inline-flex size-2.5", className)} aria-label="En sala">
          <span className="absolute inset-0 animate-ping-soft rounded-full bg-[var(--tc)]" />
          <span className="relative inline-flex size-2.5 rounded-full bg-[var(--tc)]" />
        </span>
      );
    default:
      return null;
  }
}

export const TimeGridCard = memo(function TimeGridCard({
  appt,
  style,
  height,
  ghost,
  dimmed,
  previewLabel,
  onOpen,
  draggable = true,
}: {
  appt: CalendarAppointment;
  style: CSSProperties;
  height: number;
  ghost?: boolean;
  dimmed?: boolean;
  previewLabel?: string;
  onOpen?: (id: string) => void;
  draggable?: boolean;
}) {
  const move = useDraggable({ id: `appt:${appt.id}`, data: { kind: "appointment", appt } satisfies DragData, disabled: !draggable || ghost });
  const {
    setNodeRef: setResizeRef,
    listeners: resizeListeners,
    attributes: resizeAttributes,
  } = useDraggable({ id: `resize:${appt.id}`, data: { kind: "resize", appt } satisfies DragData, disabled: !draggable || ghost });

  const isBlock = !appt.patient_id;
  const paid = appointmentPaid(appt);
  const compact = height < 42;
  const name = isBlock ? appt.title : appt.patient?.full_name;
  const faded = appt.status === "ausente" || appt.status === "cancelado";

  return (
    <div
      ref={ghost ? undefined : move.setNodeRef}
      {...(ghost ? {} : move.listeners)}
      {...(ghost ? {} : move.attributes)}
      role="button"
      aria-label={`${name ?? "Turno"} ${time(appt.starts_at)}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!ghost) onOpen?.(appt.id);
      }}
      style={{ ...colorVars(isBlock ? "stone" : appt.treatment?.color), ...style }}
      className={cn(
        "no-callout group/card absolute overflow-hidden rounded-[10px] border text-left outline-none transition-[opacity,box-shadow,transform] duration-150",
        "touch-manipulation focus-visible:ring-2 focus-visible:ring-accent",
        isBlock
          ? "border-line-strong bg-[repeating-linear-gradient(135deg,#f3f0ec,#f3f0ec_6px,#ebe6df_6px,#ebe6df_12px)] text-ink-2"
          : "border-[var(--tc-ring)] bg-[var(--tc-soft)] text-[var(--tc-ink)]",
        appt.status === "pendiente" && !isBlock && "border-dashed",
        draggable && !ghost && "cursor-grab active:cursor-grabbing",
        ghost && "z-30 shadow-lift ring-2 ring-[var(--tc)]",
        !ghost && "hover:z-20 hover:shadow-lift",
        dimmed && "opacity-35",
        faded && "opacity-60",
      )}
    >
      {!isBlock ? <span className="absolute inset-y-0 left-0 w-[3px] bg-[var(--tc)]" aria-hidden /> : null}
      <div className={cn("flex h-full min-w-0 flex-col pl-2.5 pr-1.5", compact ? "justify-center py-0" : "py-1")}>
        {compact ? (
          <p className="flex min-w-0 items-center gap-1 truncate text-[11.5px] leading-tight">
            <span className="shrink-0 font-semibold tabular-nums">{previewLabel ?? time(appt.starts_at)}</span>
            <span className={cn("truncate font-medium", faded && "line-through")}>{isBlock ? name : shortName(name)}</span>
          </p>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <p className="min-w-0 flex-1 truncate text-[11px] font-medium tabular-nums opacity-75">
                {previewLabel ?? `${time(appt.starts_at)} – ${time(appt.ends_at)}`}
              </p>
              {isBlock ? <Lock className="size-3 shrink-0 opacity-60" /> : <StatusGlyph appt={appt} className="size-3.5 shrink-0" />}
              {!isBlock && paid.price > 0 && paid.paid > 0 ? (
                <span
                  title={paid.settled ? "Pagado" : "Pago parcial"}
                  className={cn("flex size-4 shrink-0 items-center justify-center rounded-full", paid.settled ? "bg-[#d9efe1] text-[#2b6b47]" : "bg-[#fbecd0] text-[#8a5a12]")}
                >
                  <DollarSign className="size-2.5" strokeWidth={3} />
                </span>
              ) : null}
            </div>
            <p className={cn("truncate text-[12.5px] font-semibold leading-snug text-ink", faded && "line-through")}>{name}</p>
            {height >= 58 && appt.treatment ? <p className="truncate text-[11px] leading-snug opacity-80">{appt.treatment.name}</p> : null}
          </>
        )}
      </div>
      {draggable && !ghost ? (
        // El contenedor corta la propagación para que estirar no active también "mover".
        <div onMouseDown={stop} onTouchStart={stop} onClick={stop} className="absolute inset-x-0 bottom-0 hidden h-2.5 md:block">
          <div ref={setResizeRef} {...resizeListeners} {...resizeAttributes} role="separator" aria-label="Cambiar duración" className="h-full w-full cursor-ns-resize">
            <span className="mx-auto mt-1 block h-[3px] w-6 rounded-full bg-[var(--tc)] opacity-0 transition-opacity group-hover/card:opacity-60" />
          </div>
        </div>
      ) : null}
    </div>
  );
});

/** Chip compacto para la vista mensual (presentación). */
export function MonthChipView({ appt, className }: { appt: CalendarAppointment; className?: string }) {
  const isBlock = !appt.patient_id;
  return (
    <div
      style={colorVars(isBlock ? "stone" : appt.treatment?.color)}
      className={cn(
        "flex h-[22px] w-full min-w-0 items-center gap-1 rounded-md bg-[var(--tc-soft)] px-1.5 text-[11px] text-[var(--tc-ink)]",
        appt.status === "pendiente" && "outline outline-1 -outline-offset-1 outline-dashed outline-[var(--tc-ring)]",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--tc)]" aria-hidden />
      <span className="shrink-0 font-semibold tabular-nums">{time(appt.starts_at)}</span>
      <span className="truncate">{isBlock ? appt.title : shortName(appt.patient?.full_name)}</span>
    </div>
  );
}

/** Chip arrastrable de la vista mensual. */
export const MonthChip = memo(function MonthChip({ appt, onOpen, dimmed }: { appt: CalendarAppointment; onOpen?: (id: string) => void; dimmed?: boolean }) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `mchip:${appt.id}`, data: { kind: "appointment", appt } satisfies DragData });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(appt.id);
      }}
      className={cn("no-callout w-full min-w-0 cursor-grab touch-manipulation rounded-md transition-opacity hover:brightness-[0.98] active:cursor-grabbing", dimmed && "opacity-35")}
    >
      <MonthChipView appt={appt} />
    </div>
  );
});
