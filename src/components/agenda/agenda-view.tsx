"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { addDays, addMinutes, endOfWeek, format, isSameDay, isToday, startOfDay, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ClipboardList, MousePointerClick, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { useOverlay } from "@/components/shell/overlay-store";
import { usePlacement } from "@/components/agenda/placement";
import { TimeGrid, type GridPreview } from "@/components/agenda/time-grid";
import { MonthGrid } from "@/components/agenda/month-grid";
import { MonthChipView, type DragData } from "@/components/agenda/event-card";
import { WaitlistDragCard, WaitlistPanel } from "@/components/agenda/waitlist-panel";
import {
  PX_PER_MIN,
  SNAP_MIN,
  atMinutes,
  dayKey,
  durationMin,
  hourBounds,
  minutesOfDay,
  shiftAnchor,
  snap,
  visibleDays,
  type CalendarView,
} from "@/components/agenda/calendar-utils";
import {
  useAddToWaitlist,
  useAppointmentsRange,
  useCreateAppointment,
  useDeleteAppointment,
  useRemoveFromWaitlist,
  useUpdateAppointment,
  useWaitlist,
} from "@/lib/queries/agenda";
import { useSettings } from "@/lib/queries/catalog";
import { useIsDesktop, useLocalState, useNow } from "@/lib/hooks";
import { capitalize, fmt, time } from "@/lib/format";
import { cn, errorMessage, firstName } from "@/lib/utils";
import type { CalendarAppointment, WaitlistWithRefs } from "@/lib/types";

type DragState =
  | { kind: "appointment"; appt: CalendarAppointment }
  | { kind: "resize"; appt: CalendarAppointment }
  | { kind: "waitlist"; item: WaitlistWithRefs };

function waitlistAsAppointment(item: WaitlistWithRefs): CalendarAppointment {
  return {
    id: `wait-${item.id}`,
    patient_id: item.patient_id,
    treatment_id: item.treatment_id,
    title: null,
    starts_at: new Date().toISOString(),
    ends_at: new Date().toISOString(),
    status: "pendiente",
    price: item.treatment?.price ?? 0,
    currency: item.treatment?.currency ?? "ARS",
    notes: null,
    created_by: null,
    created_at: item.created_at,
    updated_at: item.created_at,
    patient: item.patient,
    treatment: item.treatment ? { id: item.treatment.id, name: item.treatment.name, color: item.treatment.color, kind: item.treatment.kind, duration_min: item.treatment.duration_min } : null,
    payments: [],
  };
}

export function AgendaView() {
  const isDesktop = useIsDesktop();
  const now = useNow(60_000);
  const { open, stack } = useOverlay();
  const placement = usePlacement();
  const { data: settings } = useSettings();
  const [storedView, setStoredView] = useLocalState<CalendarView>("agenda:view", "week");
  const [showCancelled, setShowCancelled] = useLocalState("agenda:cancelled", false);
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const scrollRef = useRef<HTMLDivElement>(null);

  const view: CalendarView = !isDesktop && storedView === "week" ? "3day" : isDesktop && storedView === "3day" ? "week" : storedView;
  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);

  // En mobile pedimos la semana completa para los puntitos de la tira de días.
  const fetchFrom = useMemo(() => {
    const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
    return days[0] < weekStart ? days[0] : weekStart;
  }, [anchor, days]);
  const fetchTo = useMemo(() => {
    const weekEnd = addDays(startOfDay(endOfWeek(anchor, { weekStartsOn: 1 })), 1);
    const last = addDays(days[days.length - 1], 1);
    return last > weekEnd ? last : weekEnd;
  }, [anchor, days]);

  const { data: raw = [], isFetching } = useAppointmentsRange(fetchFrom, fetchTo);
  const appointments = useMemo(() => (showCancelled ? raw : raw.filter((a) => a.status !== "cancelado")), [raw, showCancelled]);
  const { data: waitlist = [] } = useWaitlist();

  const update = useUpdateAppointment();
  const create = useCreateAppointment();
  const remove = useDeleteAppointment();
  const removeWaitlist = useRemoveFromWaitlist();
  const addWaitlist = useAddToWaitlist();

  const workStart = settings?.day_start ?? 8;
  const workEnd = settings?.day_end ?? 20;
  const { startHour, endHour } = useMemo(() => hourBounds(appointments, days, workStart, workEnd), [appointments, days, workStart, workEnd]);

  // -------------------------------------------------------------------------
  // Drag & drop
  // -------------------------------------------------------------------------
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreviewState] = useState<GridPreview | null>(null);
  const previewRef = useRef<GridPreview | null>(null);
  const setPreview = (next: GridPreview | null | ((prev: GridPreview | null) => GridPreview | null)) => {
    const value = typeof next === "function" ? next(previewRef.current) : next;
    previewRef.current = value;
    setPreviewState(value);
  };
  const pointer = useRef({ x: 0, y: 0 });
  const startPointer = useRef({ x: 0, y: 0 });
  const grabOffset = useRef(0);
  const lastDragEnd = useRef(0);
  const dragRef = useRef<DragState | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  // Detección por la posición real del puntero y el rectángulo vivo de cada columna/celda.
  const collision = useCallback<CollisionDetection>(({ droppableContainers }) => {
    const { x, y } = pointer.current;
    for (const container of droppableContainers) {
      const rect = container.node.current?.getBoundingClientRect();
      if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return [{ id: container.id }];
    }
    return [];
  }, []);

  // Seguimiento del puntero durante el arrastre. Se engancha de forma síncrona al empezar
  // (no en un efecto) para no perder un "soltar" que llegue antes del próximo render.
  const trackingCleanup = useRef<(() => void) | null>(null);
  const stopTracking = () => {
    trackingCleanup.current?.();
    trackingCleanup.current = null;
  };
  useEffect(() => stopTracking, []);

  const targetFromPointer = (dropDay: Date, current: DragState): GridPreview | null => {
    const el = document.querySelector<HTMLElement>(`[data-col="${dayKey(dropDay)}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const duration = current.kind === "waitlist" ? (current.item.treatment?.duration_min ?? 60) : durationMin(current.appt);
    const offset = current.kind === "appointment" ? grabOffset.current : Math.min(15, duration / 2);
    const fromTop = (pointer.current.y - rect.top) / PX_PER_MIN - offset;
    const minStart = startHour * 60;
    const maxStart = endHour * 60 - Math.min(duration, SNAP_MIN * 2);
    const startMin = Math.max(minStart, Math.min(maxStart, minStart + snap(fromTop)));
    const start = atMinutes(dropDay, startMin);
    const appt = current.kind === "waitlist" ? waitlistAsAppointment(current.item) : current.appt;
    return { appt, day: dropDay, start, end: addMinutes(start, duration) };
  };

  const startTracking = () => {
    stopTracking();
    const fromTouch = (e: TouchEvent) => {
      const t = e.touches[0] ?? e.changedTouches[0];
      if (t) pointer.current = { x: t.clientX, y: t.clientY };
    };
    const onMouse = (e: MouseEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    const onTouchMove = (e: TouchEvent) => {
      fromTouch(e);
      if (e.cancelable) e.preventDefault(); // iOS: que no scrollee la página mientras se arrastra
    };
    // Red de seguridad: si la librería no llegó a reportar el fin (gesto rapidísimo),
    // completar el movimiento igual con la posición real donde se soltó.
    const onRelease = (e: MouseEvent | TouchEvent) => {
      if ("clientX" in e) onMouse(e);
      else fromTouch(e);
      window.setTimeout(() => {
        if (dragRef.current) finishDrop(pointer.current.y - startPointer.current.y);
      }, 160);
    };
    window.addEventListener("mousemove", onMouse, true);
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    window.addEventListener("mouseup", onRelease, true);
    window.addEventListener("touchend", onRelease, true);
    window.addEventListener("touchcancel", onRelease, true);
    trackingCleanup.current = () => {
      window.removeEventListener("mousemove", onMouse, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("mouseup", onRelease, true);
      window.removeEventListener("touchend", onRelease, true);
      window.removeEventListener("touchcancel", onRelease, true);
    };
  };

  /** Columna (o celda del mes) que está realmente debajo del puntero. */
  const dayUnderPointer = (attr: "data-col" | "data-cell") => {
    const { x, y } = pointer.current;
    for (const el of document.elementsFromPoint(x, y)) {
      const key = el.getAttribute(attr);
      if (key) return days.find((d) => dayKey(d) === key) ?? null;
    }
    return null;
  };

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (!data) return;
    const coords = getEventCoordinates(event.activatorEvent);
    if (coords) {
      pointer.current = coords;
      startPointer.current = coords;
    }
    startTracking();
    let next: DragState | null = null;
    if (data.kind === "appointment") {
      // Minutos entre el inicio del turno y el punto donde se agarró la tarjeta,
      // medidos sobre la columna real (independiente del scroll).
      const start = new Date(data.appt.starts_at);
      const col = document.querySelector<HTMLElement>(`[data-col="${dayKey(start)}"]`);
      grabOffset.current =
        col && coords ? startHour * 60 + (coords.y - col.getBoundingClientRect().top) / PX_PER_MIN - minutesOfDay(start) : 0;
      next = { kind: "appointment", appt: data.appt };
    } else if (data.kind === "resize") {
      next = { kind: "resize", appt: data.appt };
    } else {
      const item = waitlist.find((w) => w.id === data.itemId);
      if (item) next = { kind: "waitlist", item };
    }
    dragRef.current = next;
    setDrag(next);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
  };

  const onDragMove = (event: DragMoveEvent) => {
    const current = dragRef.current;
    if (!current || view === "month") return;
    if (current.kind === "resize") {
      const start = new Date(current.appt.starts_at);
      const originalEnd = new Date(current.appt.ends_at).getTime();
      const deltaMin = snap(event.delta.y / PX_PER_MIN);
      const end = new Date(Math.max(start.getTime() + SNAP_MIN * 60_000, originalEnd + deltaMin * 60_000));
      setPreview({ appt: current.appt, day: start, start, end });
      return;
    }
    const over = event.over?.data.current as { kind?: string; day?: Date } | undefined;
    if (over?.kind !== "col" || !over.day) {
      setPreview(null);
      return;
    }
    const next = targetFromPointer(over.day, current);
    setPreview((prev) =>
      prev && next && prev.start.getTime() === next.start.getTime() && prev.end.getTime() === next.end.getTime() && dayKey(prev.day) === dayKey(next.day)
        ? prev
        : next,
    );
  };

  const resetDrag = () => {
    stopTracking();
    dragRef.current = null;
    setDrag(null);
    setPreview(null);
    lastDragEnd.current = Date.now();
  };

  const commitMove = (appt: CalendarAppointment, start: Date, end: Date, resized: boolean) => {
    if (start.toISOString() === new Date(appt.starts_at).toISOString() && end.toISOString() === new Date(appt.ends_at).toISOString()) return;
    const previous = { starts_at: appt.starts_at, ends_at: appt.ends_at };
    update.mutate(
      { id: appt.id, patch: { starts_at: start.toISOString(), ends_at: end.toISOString() } },
      { onError: (e) => toast.error(errorMessage(e)) },
    );
    const overlaps = appointments.some((a) => a.id !== appt.id && a.status !== "cancelado" && new Date(a.starts_at) < end && new Date(a.ends_at) > start);
    toast.success(resized ? "Duración actualizada" : `Turno movido${appt.patient ? ` · ${firstName(appt.patient.full_name)}` : ""}`, {
      description: `${capitalize(fmt(start, "EEE d MMM"))} · ${time(start)} – ${time(end)}${overlaps ? " · se superpone con otro turno" : ""}`,
      action: { label: "Deshacer", onClick: () => update.mutate({ id: appt.id, patch: previous }) },
    });
  };

  const scheduleFromWaitlist = async (item: WaitlistWithRefs, start: Date, end: Date) => {
    try {
      const created = await create.mutateAsync({
        patient_id: item.patient_id,
        treatment_id: item.treatment_id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        price: item.treatment?.price ?? 0,
        currency: item.treatment?.currency ?? "ARS",
        notes: item.notes,
      });
      removeWaitlist.mutate(item.id);
      toast.success(`${item.patient?.full_name ?? "Paciente"} agendado`, {
        description: `${capitalize(fmt(start, "EEEE d 'de' MMMM"))} · ${time(start)}`,
        action: {
          label: "Deshacer",
          onClick: async () => {
            await remove.mutateAsync(created.id);
            addWaitlist.mutate({ patient_id: item.patient_id, treatment_id: item.treatment_id, notes: item.notes });
          },
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onDragEnd = (event: DragEndEvent) => finishDrop(event.delta.y);

  function finishDrop(deltaY: number) {
    const current = dragRef.current;
    if (!current) return resetDrag();

    // El destino se calcula con la posición final real del puntero (no con la última
    // vista previa renderizada), así un "soltar" rápido cae exactamente donde se ve.
    if (view === "month") {
      const day = dayUnderPointer("data-cell");
      resetDrag();
      if (!day) return;
      if (current.kind === "appointment") {
        const s = new Date(current.appt.starts_at);
        if (isSameDay(s, day)) return;
        const start = atMinutes(day, minutesOfDay(s));
        commitMove(current.appt, start, addMinutes(start, durationMin(current.appt)), false);
      } else if (current.kind === "waitlist") {
        open({
          type: "appointment-form",
          defaults: {
            startsAt: atMinutes(day, workStart * 60 + 60).toISOString(),
            patientId: current.item.patient_id,
            treatmentId: current.item.treatment_id ?? undefined,
            durationMin: current.item.treatment?.duration_min,
            waitlistId: current.item.id,
          },
        });
      }
      return;
    }

    let p: GridPreview | null = null;
    if (current.kind === "resize") {
      const start = new Date(current.appt.starts_at);
      const originalEnd = new Date(current.appt.ends_at).getTime();
      const end = new Date(Math.max(start.getTime() + SNAP_MIN * 60_000, originalEnd + snap(deltaY / PX_PER_MIN) * 60_000));
      p = { appt: current.appt, day: start, start, end };
    } else {
      const day = dayUnderPointer("data-col");
      p = day ? targetFromPointer(day, current) : null;
    }
    resetDrag();
    if (!p) return;
    if (current.kind === "waitlist") void scheduleFromWaitlist(current.item, p.start, p.end);
    else commitMove(current.appt, p.start, p.end, current.kind === "resize");
  }

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------
  const onOpen = useCallback(
    (id: string) => {
      if (Date.now() - lastDragEnd.current < 300) return;
      open({ type: "appointment", id });
    },
    [open],
  );

  const onSlot = useCallback(
    (start: Date) => {
      if (Date.now() - lastDragEnd.current < 300) return;
      const item = placement.item;
      if (item) {
        placement.cancel();
        open({
          type: "appointment-form",
          defaults: {
            startsAt: start.toISOString(),
            patientId: item.patient_id,
            treatmentId: item.treatment_id ?? undefined,
            durationMin: item.treatment?.duration_min,
            waitlistId: item.id,
          },
        });
        return;
      }
      open({ type: "appointment-form", defaults: { startsAt: start.toISOString() } });
    },
    [open, placement],
  );

  const setView = (v: CalendarView) => setStoredView(v);
  const goToday = () => setAnchor(startOfDay(new Date()));
  const shift = (dir: 1 | -1) => setAnchor((a) => shiftAnchor(view, a, dir));
  const onDayClick = useCallback(
    (d: Date) => {
      setAnchor(startOfDay(d));
      setStoredView("day");
    },
    [setStoredView],
  );

  // Atajos de teclado (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stack.length || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === "t") setAnchor(startOfDay(new Date()));
      else if (key === "arrowleft") setAnchor((a) => shiftAnchor(view, a, -1));
      else if (key === "arrowright") setAnchor((a) => shiftAnchor(view, a, 1));
      else if (key === "d") setStoredView("day");
      else if (key === "s" || key === "w") setStoredView("week");
      else if (key === "m") setStoredView("month");
      else if (key === "n") open({ type: "appointment-form" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack.length, view, setStoredView, open]);

  // Deslizar para cambiar de día (mobile)
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipe.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || dragRef.current || view === "month") return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Date.now() - s.t < 600 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) shift(dx < 0 ? 1 : -1);
  };

  const title = useMemo(() => {
    if (view === "month") return capitalize(format(anchor, "MMMM yyyy", { locale: es }));
    if (view === "day") return capitalize(format(anchor, isDesktop ? "EEEE d 'de' MMMM" : "MMMM yyyy", { locale: es }));
    const first = days[0];
    const last = days[days.length - 1];
    if (!isDesktop) return capitalize(format(first, "MMMM yyyy", { locale: es }));
    return first.getMonth() === last.getMonth()
      ? `${format(first, "d", { locale: es })} – ${format(last, "d 'de' MMMM", { locale: es })}`
      : `${format(first, "d MMM", { locale: es })} – ${format(last, "d MMM", { locale: es })}`;
  }, [view, anchor, days, isDesktop]);

  const viewOptions = isDesktop
    ? [
        { value: "day" as const, label: "Día" },
        { value: "week" as const, label: "Semana" },
        { value: "month" as const, label: "Mes" },
      ]
    : [
        { value: "day" as const, label: "Día" },
        { value: "3day" as const, label: "3 días" },
        { value: "month" as const, label: "Mes" },
      ];

  const draggingId = drag && drag.kind !== "waitlist" ? drag.appt.id : drag?.kind === "waitlist" ? drag.item.id : null;

  return (
    <div className="flex h-[calc(100dvh-9rem-1px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col md:h-dvh">
      {/* Barra de herramientas */}
      <div className="shrink-0 border-b border-line bg-canvas px-3 pb-2.5 pt-3 md:px-6 md:pb-4 md:pt-6">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate font-display text-[26px] leading-none text-ink md:text-[34px]">
            {title}
            {isFetching ? <span className="ml-2 inline-block size-1.5 animate-pulse rounded-full bg-accent align-middle" aria-hidden /> : null}
          </h1>
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="secondary" size="sm" onClick={goToday} className="h-9">
              Hoy
            </Button>
            <div className="flex items-center rounded-xl border border-line bg-surface shadow-card">
              <button type="button" onClick={() => shift(-1)} aria-label="Anterior" className="flex size-9 items-center justify-center rounded-l-xl text-ink-2 hover:bg-subtle">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" onClick={() => shift(1)} aria-label="Siguiente" className="flex size-9 items-center justify-center rounded-r-xl text-ink-2 hover:bg-subtle">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <Segmented value={view} onChange={setView} options={viewOptions} />
            <button
              type="button"
              onClick={() => setShowCancelled((v) => !v)}
              className={cn(
                "h-9 rounded-xl border px-3 text-[13px] font-medium transition-colors",
                showCancelled ? "border-brand bg-brand text-white" : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              Cancelados
            </button>
            <Button variant="secondary" className="h-9 xl:hidden" onClick={() => open({ type: "waitlist" })}>
              <ClipboardList className="size-4" />
              Por agendar
              {waitlist.length ? <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold text-accent-ink">{waitlist.length}</span> : null}
            </Button>
            <Button className="h-9" onClick={() => open({ type: "appointment-form" })}>
              <Plus className="size-4" /> Turno
            </Button>
          </div>
          <div className="flex items-center gap-1.5 md:hidden">
            <button
              type="button"
              onClick={() => open({ type: "waitlist" })}
              className="relative flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 shadow-card"
              aria-label="Por agendar"
            >
              <ClipboardList className="size-4" />
              {waitlist.length ? (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">{waitlist.length}</span>
              ) : null}
            </button>
            <button type="button" onClick={goToday} className="h-9 rounded-xl border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-card">
              Hoy
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 md:hidden">
          <Segmented stretch value={view} onChange={setView} options={viewOptions} className="flex-1" />
        </div>

        {view !== "month" && !isDesktop ? (
          <WeekStrip anchor={anchor} days={days} appointments={appointments} onSelect={(d) => setAnchor(startOfDay(d))} onShift={(dir) => setAnchor((a) => addDays(a, 7 * dir))} />
        ) : null}

        {placement.item ? (
          <div className="mt-3 flex animate-rise items-center gap-3 rounded-2xl bg-brand px-4 py-2.5 text-white shadow-lift">
            <MousePointerClick className="size-4 shrink-0 text-[#d9b8a4]" />
            <p className="min-w-0 flex-1 truncate text-[13px]">
              Tocá un horario para agendar a <b className="font-semibold">{placement.item.patient?.full_name}</b>
              {placement.item.treatment ? ` · ${placement.item.treatment.name}` : ""}
            </p>
            <button type="button" onClick={placement.cancel} className="flex size-7 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20" aria-label="Cancelar">
              <X className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={resetDrag}
        autoScroll={{ threshold: { x: 0, y: 0.12 }, acceleration: 12 }}
      >
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {view === "month" ? (
              <MonthGrid
                days={days}
                anchor={anchor}
                appointments={appointments}
                draggingId={draggingId}
                compact={!isDesktop}
                onOpen={onOpen}
                onDay={onDayClick}
              />
            ) : (
              <TimeGrid
                days={days}
                appointments={appointments}
                startHour={startHour}
                endHour={endHour}
                workStart={workStart}
                workEnd={workEnd}
                now={now}
                preview={preview}
                draggingId={drag && drag.kind !== "waitlist" ? drag.appt.id : null}
                isDragging={Boolean(drag)}
                placing={Boolean(placement.item)}
                showHeader={view !== "day" || isDesktop}
                scrollRef={scrollRef}
                onOpen={onOpen}
                onSlot={onSlot}
                onDayClick={onDayClick}
              />
            )}
          </div>
          <WaitlistPanel
            items={waitlist}
            draggingId={drag?.kind === "waitlist" ? drag.item.id : null}
            onAdd={() => open({ type: "waitlist-form" })}
            onRemove={(id) => removeWaitlist.mutate(id)}
            onPlace={(item) => placement.start(item)}
          />
        </div>
        <DragOverlay dropAnimation={null}>
          {drag?.kind === "waitlist" ? (
            <WaitlistDragCard item={drag.item} />
          ) : drag?.kind === "appointment" && view === "month" ? (
            <div className="w-40 rotate-[-2deg] rounded-md shadow-pop">
              <MonthChipView appt={drag.appt} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function WeekStrip({
  anchor,
  days,
  appointments,
  onSelect,
  onShift,
}: {
  anchor: Date;
  days: Date[];
  appointments: CalendarAppointment[];
  onSelect: (d: Date) => void;
  onShift: (dir: 1 | -1) => void;
}) {
  const monday = startOfWeek(anchor, { weekStartsOn: 1 });
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const counts = new Map<string, number>();
  for (const a of appointments) {
    const k = dayKey(new Date(a.starts_at));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const selected = new Set(days.map(dayKey));
  return (
    <div className="mt-3 flex items-center gap-1">
      <button type="button" onClick={() => onShift(-1)} aria-label="Semana anterior" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted active:bg-sunken">
        <ChevronLeft className="size-4" />
      </button>
      <div className="grid flex-1 grid-cols-7 gap-1">
        {week.map((d) => {
          const k = dayKey(d);
          const isSel = selected.has(k);
          const today = isToday(d);
          const count = counts.get(k) ?? 0;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors",
                isSel ? "bg-brand text-white" : today ? "bg-accent-soft text-accent-ink" : "text-ink-2 active:bg-sunken",
              )}
            >
              <span className={cn("text-[10px] font-semibold uppercase", isSel ? "text-white/70" : "text-muted")}>{format(d, "EEEEE", { locale: es })}</span>
              <span className="text-[15px] font-semibold tabular-nums leading-none">{format(d, "d")}</span>
              <span className={cn("mt-0.5 size-1 rounded-full", count ? (isSel ? "bg-white/80" : "bg-accent") : "bg-transparent")} />
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onShift(1)} aria-label="Semana siguiente" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted active:bg-sunken">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
