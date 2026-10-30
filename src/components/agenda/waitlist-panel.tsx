"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { ClipboardList, GripVertical, Plus, X } from "lucide-react";
import { colorVars } from "@/lib/colors";
import { durationLabel, since } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WaitlistWithRefs } from "@/lib/types";
import type { DragData } from "@/components/agenda/event-card";

export function WaitlistPanel({
  items,
  draggingId,
  onAdd,
  onRemove,
  onPlace,
}: {
  items: WaitlistWithRefs[];
  draggingId: string | null;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onPlace: (item: WaitlistWithRefs) => void;
}) {
  return (
    <aside className="hidden w-[272px] shrink-0 flex-col border-l border-line bg-subtle/60 xl:flex">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Por agendar</h2>
          <p className="text-xs text-muted">Arrastrá a un horario</p>
        </div>
        <button type="button" onClick={onAdd} aria-label="Agregar a Por agendar" className="flex size-8 items-center justify-center rounded-lg bg-surface text-ink-2 shadow-card transition-colors hover:bg-sunken">
          <Plus className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center">
            <ClipboardList className="mx-auto size-5 text-faint" />
            <p className="mt-2 text-[13px] font-medium text-ink-2">Lista vacía</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Sumá pacientes que esperan fecha de cirugía o tratamiento.</p>
          </div>
        ) : (
          items.map((item) => <WaitlistCard key={item.id} item={item} dimmed={draggingId === item.id} onRemove={onRemove} onPlace={onPlace} />)
        )}
      </div>
    </aside>
  );
}

const WaitlistCard = memo(function WaitlistCard({
  item,
  dimmed,
  onRemove,
  onPlace,
}: {
  item: WaitlistWithRefs;
  dimmed: boolean;
  onRemove: (id: string) => void;
  onPlace: (item: WaitlistWithRefs) => void;
}) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `wait:${item.id}`, data: { kind: "waitlist", itemId: item.id } satisfies DragData });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onDoubleClick={() => onPlace(item)}
      style={colorVars(item.treatment?.color ?? "stone")}
      className={cn(
        "no-callout group relative cursor-grab touch-manipulation rounded-2xl border border-line bg-surface p-3 pl-3.5 shadow-card transition-[opacity,box-shadow] hover:shadow-lift active:cursor-grabbing",
        dimmed && "opacity-40",
      )}
    >
      <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-[var(--tc)]" aria-hidden />
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{item.patient?.full_name}</p>
          <p className="truncate text-xs text-[var(--tc-ink)]">{item.treatment?.name ?? "Tratamiento a definir"}</p>
          <p className="mt-1 text-[11px] text-muted">
            {item.treatment ? `${durationLabel(item.treatment.duration_min)} · ` : ""}
            {since(item.created_at)}
          </p>
          {item.notes ? <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-2">{item.notes}</p> : null}
        </div>
        <button
          type="button"
          aria-label="Quitar de Por agendar"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => onRemove(item.id)}
          className="flex size-6 items-center justify-center rounded-md text-faint opacity-0 transition-opacity hover:bg-sunken hover:text-ink group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
});

export function WaitlistDragCard({ item }: { item: WaitlistWithRefs }) {
  return (
    <div style={colorVars(item.treatment?.color ?? "stone")} className="w-56 rotate-[-2deg] rounded-2xl border border-[var(--tc-ring)] bg-surface p-3 pl-3.5 shadow-pop">
      <p className="truncate text-[13px] font-semibold text-ink">{item.patient?.full_name}</p>
      <p className="truncate text-xs text-[var(--tc-ink)]">{item.treatment?.name ?? "Tratamiento a definir"}</p>
    </div>
  );
}
