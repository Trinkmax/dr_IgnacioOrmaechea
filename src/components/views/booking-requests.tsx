"use client";

import { useMemo, useState } from "react";
import { endOfDay, isSameDay, startOfDay, subDays } from "date-fns";
import {
  AlertTriangle,
  Bell,
  BellRing,
  CalendarCheck2,
  Check,
  Copy,
  ExternalLink,
  Inbox,
  MessageCircle,
  Phone,
  Plus,
  Share2,
  Trash2,
  UserRoundCheck,
  UserRoundPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar, Badge, Card, EmptyState, PageHeader, SectionTitle, Segmented, Skeleton, Switch, TreatmentTag } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { useOverlay } from "@/components/shell/overlay-store";
import {
  bookingUrl,
  fillTemplate,
  useBookingHistory,
  useBookingHours,
  useConfirmBooking,
  useDeclineBooking,
  usePendingBookings,
  useSaveBookingHours,
  useSetTreatmentOnline,
  type HourDraft,
} from "@/lib/queries/booking";
import { useAppointmentsRange } from "@/lib/queries/agenda";
import { useSettings, useTreatments, useUpdateSettings } from "@/lib/queries/catalog";
import { useRole } from "@/lib/queries/session";
import { capitalize, durationLabel, fmt, since, time } from "@/lib/format";
import { cn, errorMessage, firstName, whatsappLink } from "@/lib/utils";
import { BOOKING_STATUS_META, KIND_META, WEEKDAYS, type BookingRequestWithRefs, type CalendarAppointment, type Settings } from "@/lib/types";

type Tab = "pendientes" | "historial" | "ajustes";

export function BookingRequestsView() {
  const { isAdmin } = useRole();
  const [tab, setTab] = useState<Tab>("pendientes");
  const { data: pending = [] } = usePendingBookings();

  const options: { value: Tab; label: string; count?: number }[] = [
    { value: "pendientes", label: "Pendientes", count: pending.length },
    { value: "historial", label: "Historial" },
  ];
  if (isAdmin) options.push({ value: "ajustes", label: "Horarios y ajustes" });

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="Solicitudes de turno" subtitle="Lo que piden las pacientes desde la página de reservas" actions={<ShareActions />} />
      <NotificationsHint />
      <Segmented className="mt-6" value={tab} onChange={setTab} options={options} />
      <div className="mt-5">
        {tab === "pendientes" ? <PendingList requests={pending} /> : null}
        {tab === "historial" ? <HistoryList /> : null}
        {tab === "ajustes" && isAdmin ? <BookingSettings /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compartir el link
// ---------------------------------------------------------------------------
function ShareActions() {
  const url = bookingUrl();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado", { description: url });
    } catch {
      toast.error("No se pudo copiar. Copialo a mano: " + url);
    }
  };
  const share = async () => {
    const text = "Reservá tu turno con el Dr. Ignacio Ormaechea:";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Reservá tu turno", text, url });
        return;
      } catch {
        // cancelado por el usuario
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
    }
  };
  return (
    <>
      <Button variant="secondary" onClick={copy}>
        <Copy className="size-4" /> Copiar link
      </Button>
      <Button variant="secondary" onClick={share} className="hidden sm:inline-flex">
        <Share2 className="size-4" /> Compartir
      </Button>
      <a href="/reservar" target="_blank" rel="noreferrer">
        <Button>
          <ExternalLink className="size-4" /> Ver página
        </Button>
      </a>
    </>
  );
}

/** Avisos del sistema (aunque la app esté en otra pestaña). */
function NotificationsHint() {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [permission, setPermission] = useState(() => (supported ? Notification.permission : "denied"));
  if (!supported || permission !== "default") return null;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/25 bg-accent-soft/60 px-4 py-3">
      <span className="flex size-9 items-center justify-center rounded-xl bg-surface text-accent-ink shadow-card">
        <Bell className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">
        <b className="font-semibold text-ink">Activá los avisos en este dispositivo</b> para enterarte de cada solicitud nueva aunque estés en otra pestaña.
      </p>
      <Button
        size="sm"
        variant="soft"
        onClick={async () => {
          const result = await Notification.requestPermission();
          setPermission(result);
          if (result === "granted") toast.success("Listo: te vamos a avisar de cada solicitud nueva");
        }}
      >
        <BellRing className="size-3.5" /> Activar avisos
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pendientes
// ---------------------------------------------------------------------------
function PendingList({ requests }: { requests: BookingRequestWithRefs[] }) {
  const { isLoading } = usePendingBookings();
  // Turnos de la agenda alrededor de lo pedido: para avisar choques y mostrar cómo viene el día.
  const range = useMemo(() => {
    if (!requests.length) return null;
    const starts = requests.map((r) => new Date(r.starts_at).getTime());
    return { from: startOfDay(new Date(Math.min(...starts))), to: endOfDay(new Date(Math.max(...starts))) };
  }, [requests]);
  const { data: appts = [] } = useAppointmentsRange(range?.from ?? new Date(0), range?.to ?? new Date(0), Boolean(range));

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-44 rounded-card" />
        ))}
      </div>
    );
  }
  if (!requests.length) {
    return (
      <Card>
        <EmptyState
          icon={<Inbox />}
          title="No hay solicitudes pendientes"
          description="Cuando una paciente pida un turno desde la página de reservas, aparece acá y te avisamos al instante."
        />
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <RequestCard key={r.id} request={r} appointments={appts} />
      ))}
    </div>
  );
}

function RequestCard({ request: r, appointments }: { request: BookingRequestWithRefs; appointments: CalendarAppointment[] }) {
  const { data: settings } = useSettings();
  const { open } = useOverlay();
  const confirmDialog = useConfirm();
  const confirm = useConfirmBooking();
  const decline = useDeclineBooking();
  const [declining, setDeclining] = useState(false);
  const [reply, setReply] = useState("");

  const start = new Date(r.starts_at);
  const end = new Date(r.ends_at);
  const conflicts = appointments.filter((a) => a.status !== "cancelado" && new Date(a.starts_at) < end && new Date(a.ends_at) > start);
  const sameDay = appointments.filter((a) => a.status !== "cancelado" && a.patient_id && isSameDay(new Date(a.starts_at), start));
  const wa = whatsappLink(r.phone);

  const onConfirm = async (force = false) => {
    try {
      const appointmentId = await confirm.mutateAsync({ id: r.id, force });
      const message = confirmMessage(r, settings);
      const link = whatsappLink(r.phone, message);
      toast.success(`Turno de ${firstName(r.full_name)} confirmado`, {
        description: "Ya está en la agenda.",
        action: link ? { label: "Avisar por WhatsApp", onClick: () => window.open(link, "_blank", "noopener") } : undefined,
        cancel: appointmentId ? { label: "Ver turno", onClick: () => open({ type: "appointment", id: appointmentId }) } : undefined,
      });
    } catch (e) {
      const err = e as { hint?: string };
      if (!force && err?.hint === "overlap") {
        const ok = await confirmDialog({
          title: "Se superpone con otro turno",
          description: "En ese horario ya hay algo en la agenda. ¿Querés confirmarlo igual?",
          confirmLabel: "Confirmar igual",
        });
        if (ok) return onConfirm(true);
        return;
      }
      toast.error(errorMessage(e));
    }
  };

  const onDecline = async () => {
    try {
      await decline.mutateAsync({ id: r.id, reply });
      const link = whatsappLink(r.phone, declineMessage(r, reply, settings));
      toast(`Solicitud de ${firstName(r.full_name)} descartada`, {
        description: "El horario vuelve a quedar libre.",
        action: link ? { label: "Avisar por WhatsApp", onClick: () => window.open(link, "_blank", "noopener") } : undefined,
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-4 md:flex-row md:p-5">
        {/* Fecha pedida */}
        <div className="flex shrink-0 items-center gap-3 md:w-40 md:flex-col md:items-start md:gap-1 md:border-r md:border-line md:pr-5">
          <div className="w-14 rounded-xl bg-subtle py-1.5 text-center md:w-auto md:bg-transparent md:p-0 md:text-left">
            <p className="text-[11px] font-semibold uppercase text-muted">{fmt(start, "EEE")}</p>
            <p className="font-display text-2xl leading-none text-ink md:text-[30px]">{fmt(start, "d")}</p>
            <p className="text-[11px] text-muted md:hidden">{fmt(start, "MMM")}</p>
          </div>
          <div>
            <p className="hidden text-[13px] capitalize text-muted md:block">{fmt(start, "MMMM")}</p>
            <p className="text-lg font-semibold tabular-nums text-ink">{time(start)} h</p>
            <p className="text-xs text-muted">{durationLabel(Math.round((end.getTime() - start.getTime()) / 60_000))}</p>
          </div>
        </div>

        {/* Paciente */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name={r.full_name} size={34} />
            <p className="min-w-0 truncate text-[15px] font-semibold text-ink">{r.full_name}</p>
            {r.patient ? (
              <button type="button" onClick={() => open({ type: "patient", id: r.patient!.id })}>
                <Badge tone="info" className="hover:underline">
                  <UserRoundCheck className="size-3" /> Ya es paciente
                </Badge>
              </button>
            ) : (
              <Badge tone="accent">
                <UserRoundPlus className="size-3" /> Nueva
              </Badge>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-2">
            {r.treatment ? <TreatmentTag name={r.treatment.name} color={r.treatment.color} /> : null}
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3.5 text-muted" /> {r.phone}
            </span>
            {r.dni ? <span>DNI {r.dni}</span> : null}
            {r.email ? <span className="truncate">{r.email}</span> : null}
            {r.source ? <span className="text-muted">Vino por {r.source}</span> : null}
          </div>
          {r.notes ? <p className="mt-3 rounded-xl bg-sunken/70 px-3 py-2 text-[13px] leading-relaxed text-ink-2">“{r.notes}”</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>Pedido {since(r.created_at)}</span>
            <span>
              Ese día: {sameDay.length ? `${sameDay.length} ${sameDay.length === 1 ? "turno" : "turnos"}` : "agenda libre"}
            </span>
          </div>
          {conflicts.length ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Se superpone con {conflicts.map((c) => `${c.patient?.full_name ?? c.title ?? "un bloqueo"} (${time(c.starts_at)})`).join(", ")}.
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {declining ? (
        <div className="border-t border-line bg-subtle p-4 md:px-5">
          <Field label="Motivo (opcional)" hint="La paciente lo ve en la página de reservas y en el WhatsApp que le mandes">
            <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Ese día el Dr. está en quirófano. ¿Te sirve el jueves a la misma hora?" autoFocus />
          </Field>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              Volver
            </Button>
            <Button variant="danger" onClick={onDecline} loading={decline.isPending}>
              Descartar solicitud
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-subtle px-4 py-3 md:px-5">
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-[#1d6b3c] transition-colors hover:bg-[#e7f6ec]">
              <MessageCircle className="size-4" /> <span className="hidden sm:inline">Escribirle</span>
            </a>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button variant="danger-ghost" onClick={() => setDeclining(true)}>
              <X className="size-4" /> Descartar
            </Button>
            <Button variant="success" onClick={() => onConfirm()} loading={confirm.isPending}>
              <Check className="size-4" /> Confirmar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function confirmMessage(r: BookingRequestWithRefs, settings: Settings | undefined) {
  const template =
    settings?.booking_confirm_template ?? "Hola {nombre}! Tu turno quedó confirmado para el {fecha} a las {hora} ({tratamiento}). ¡Te esperamos!";
  return fillTemplate(template, {
    nombre: firstName(r.full_name),
    fecha: fmt(r.starts_at, "EEEE d 'de' MMMM"),
    hora: time(r.starts_at),
    tratamiento: r.treatment?.name ?? "consulta",
  });
}

function declineMessage(r: BookingRequestWithRefs, reply: string, settings: Settings | undefined) {
  const clinic = settings?.clinic_name ?? "el consultorio";
  const reason = reply.trim() ? ` ${reply.trim()}` : "";
  return `Hola ${firstName(r.full_name)}! Te escribimos del consultorio del ${clinic}. No pudimos confirmar tu turno del ${fmt(r.starts_at, "EEEE d 'de' MMMM")} a las ${time(r.starts_at)}.${reason} ¿Querés que busquemos otro horario?`;
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------
function HistoryList() {
  const { open } = useOverlay();
  const { data: settings } = useSettings();
  const [from] = useState(() => subDays(startOfDay(new Date()), 90).toISOString());
  const { data: history = [], isLoading } = useBookingHistory(from);

  const summary = useMemo(() => {
    const decided = history.filter((h) => h.status !== "cancelado");
    const confirmed = history.filter((h) => h.status === "confirmado").length;
    return { confirmed, rate: decided.length ? Math.round((confirmed / decided.length) * 100) : null };
  }, [history]);

  if (isLoading) return <Skeleton className="h-72 rounded-card" />;
  if (!history.length) {
    return (
      <Card>
        <EmptyState icon={<CalendarCheck2 />} title="Todavía no hay historial" description="Las solicitudes confirmadas, descartadas o canceladas de los últimos 90 días aparecen acá." />
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-4 md:px-5">
        <SectionTitle
          title="Últimos 90 días"
          subtitle={`${history.length} solicitudes resueltas · ${summary.confirmed} confirmadas${summary.rate != null ? ` (${summary.rate}%)` : ""}`}
        />
      </div>
      <ul className="divide-y divide-line/70">
        {history.map((r) => {
          const meta = BOOKING_STATUS_META[r.status];
          const wa = r.status === "confirmado" ? whatsappLink(r.phone, confirmMessage(r, settings)) : null;
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
              <Avatar name={r.full_name} size={32} />
              <button
                type="button"
                disabled={!r.appointment_id}
                onClick={() => r.appointment_id && open({ type: "appointment", id: r.appointment_id })}
                className="min-w-0 flex-1 text-left disabled:cursor-default"
              >
                <p className="truncate text-sm font-semibold text-ink">{r.full_name}</p>
                <p className="truncate text-xs text-muted">
                  {capitalize(fmt(r.starts_at, "EEE d MMM"))} · {time(r.starts_at)} · {r.treatment?.name ?? "Turno"}
                  {r.reply ? ` · “${r.reply}”` : ""}
                </p>
              </button>
              {wa ? (
                <a href={wa} target="_blank" rel="noreferrer" title="Enviar confirmación por WhatsApp" className="flex size-8 items-center justify-center rounded-lg text-[#1d6b3c] hover:bg-[#e7f6ec]">
                  <MessageCircle className="size-4" />
                </a>
              ) : null}
              <Badge tone={meta.tone} className="hidden sm:inline-flex">
                {meta.label}
              </Badge>
              <span className={cn("size-2 shrink-0 rounded-full sm:hidden", { success: "bg-success", danger: "bg-danger", warning: "bg-warning" }[meta.tone as string] ?? "bg-faint")} aria-label={meta.label} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Horarios y ajustes (admin)
// ---------------------------------------------------------------------------
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function BookingSettings() {
  const { data: settings } = useSettings();
  const { data: hours } = useBookingHours();
  if (!settings || !hours) return <Skeleton className="h-96 rounded-card" />;
  return (
    <div className="space-y-5">
      <HoursEditor key={hours.map((h) => h.id).join()} initial={hours.map((h) => ({ weekday: h.weekday, start_time: h.start_time.slice(0, 5), end_time: h.end_time.slice(0, 5) }))} />
      <OnlineTreatments />
      <PortalOptions key={settings.updated_at} settings={settings} />
    </div>
  );
}

function HoursEditor({ initial }: { initial: HourDraft[] }) {
  const save = useSaveBookingHours();
  const [rows, setRows] = useState(initial);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const update = (index: number, patch: Partial<HourDraft>) => setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRange = (weekday: number) => {
    const last = rows.filter((r) => r.weekday === weekday).at(-1);
    const startH = last ? Math.min(Number(last.end_time.slice(0, 2)) + 1, 22) : 10;
    setRows((list) => [...list, { weekday, start_time: `${String(startH).padStart(2, "0")}:00`, end_time: `${String(Math.min(startH + 3, 23)).padStart(2, "0")}:00` }]);
  };

  const onSave = async () => {
    const invalid = rows.find((r) => !r.start_time || !r.end_time || r.end_time <= r.start_time);
    if (invalid) return toast.error(`Revisá el horario del ${WEEKDAYS[invalid.weekday].toLowerCase()}: el fin tiene que ser después del inicio.`);
    try {
      await save.mutateAsync(rows);
      toast.success("Horarios de reservas guardados");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="p-4 md:p-6">
      <SectionTitle
        title="Horarios para reservar online"
        subtitle="Las pacientes solo ven horarios dentro de estas franjas y que estén libres en la agenda. Para bloquear un día puntual, cargá un bloqueo en la agenda."
      />
      <div className="mt-5 divide-y divide-line/70">
        {WEEK_ORDER.map((weekday) => {
          const dayRows = rows.map((r, index) => ({ ...r, index })).filter((r) => r.weekday === weekday);
          return (
            <div key={weekday} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <p className={cn("w-28 shrink-0 pt-2.5 text-sm font-medium", dayRows.length ? "text-ink" : "text-muted")}>{WEEKDAYS[weekday]}</p>
              <div className="flex flex-1 flex-col gap-2">
                {dayRows.length === 0 ? <p className="pt-2.5 text-sm text-faint">Sin reservas online</p> : null}
                {dayRows.map((r) => (
                  <div key={r.index} className="flex items-center gap-2">
                    <Input type="time" step={900} value={r.start_time} onChange={(e) => update(r.index, { start_time: e.target.value })} className="w-32" aria-label="Desde" />
                    <span className="text-sm text-muted">a</span>
                    <Input type="time" step={900} value={r.end_time} onChange={(e) => update(r.index, { end_time: e.target.value })} className="w-32" aria-label="Hasta" />
                    <Button size="icon-sm" variant="ghost" aria-label="Quitar franja" onClick={() => setRows((list) => list.filter((_, i) => i !== r.index))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => addRange(weekday)} className="self-start">
                <Plus className="size-3.5" /> Franja
              </Button>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={onSave} loading={save.isPending} disabled={!dirty}>
          Guardar horarios
        </Button>
      </div>
    </Card>
  );
}

function OnlineTreatments() {
  const { data: treatments = [] } = useTreatments();
  const setOnline = useSetTreatmentOnline();
  const active = treatments.filter((t) => t.active);
  return (
    <Card className="p-4 md:p-6">
      <SectionTitle title="Qué se puede reservar" subtitle="Elegí qué tratamientos aparecen en la página. Lo habitual es la consulta inicial; las cirugías se agendan después de la consulta." />
      <ul className="mt-4 divide-y divide-line/70">
        {active.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            <TreatmentTag name={t.name} color={t.color} />
            <span className="min-w-0 flex-1 truncate text-xs text-muted">
              {KIND_META[t.kind].label} · {durationLabel(t.duration_min)}
            </span>
            <Switch
              checked={t.online_booking}
              label={`Reservable online: ${t.name}`}
              onChange={(online) =>
                setOnline.mutate(
                  { id: t.id, online },
                  {
                    onSuccess: () => toast.success(online ? `${t.name} ya se puede reservar online` : `${t.name} ya no aparece en la página`),
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PortalOptions({ settings }: { settings: Settings }) {
  const update = useUpdateSettings();
  const [form, setForm] = useState({
    booking_enabled: settings.booking_enabled,
    booking_min_notice_hours: settings.booking_min_notice_hours,
    booking_horizon_days: settings.booking_horizon_days,
    booking_step_min: settings.booking_step_min,
    booking_intro: settings.booking_intro,
    booking_confirm_template: settings.booking_confirm_template,
    clinic_phone: settings.clinic_phone ?? "",
    clinic_address: settings.clinic_address ?? "",
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    try {
      await update.mutateAsync({ ...form, clinic_phone: form.clinic_phone.trim() || null, clinic_address: form.clinic_address.trim() || null });
      toast.success("Ajustes de reservas guardados");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const preview = fillTemplate(form.booking_confirm_template, { nombre: "María", fecha: "jueves 20 de noviembre", hora: "10:30", tratamiento: "Consulta inicial" });

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionTitle title="Página de reservas" subtitle="Lo que ven las pacientes y cómo se reparten los horarios" />
        <Switch checked={form.booking_enabled} onChange={(v) => set("booking_enabled", v)} label="Recibir reservas online" />
      </div>
      {!form.booking_enabled ? <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">Las reservas están pausadas: la página muestra un mensaje para escribir por WhatsApp.</p> : null}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Anticipación mínima" hint="Para no recibir turnos de último momento">
          <Select value={form.booking_min_notice_hours} onChange={(e) => set("booking_min_notice_hours", Number(e.target.value))}>
            {[0, 2, 4, 12, 24, 48, 72].map((h) => (
              <option key={h} value={h}>
                {h === 0 ? "Sin mínimo" : h < 24 ? `${h} horas` : `${h / 24} ${h === 24 ? "día" : "días"}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Se puede reservar hasta" hint="Cuántos días hacia adelante">
          <Select value={form.booking_horizon_days} onChange={(e) => set("booking_horizon_days", Number(e.target.value))}>
            {[7, 14, 21, 30, 45, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} días
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Turnos cada" hint="Separación entre horarios ofrecidos">
          <Select value={form.booking_step_min} onChange={(e) => set("booking_step_min", Number(e.target.value))}>
            {[10, 15, 20, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </Select>
        </Field>
        <Field label="WhatsApp del consultorio" hint="Para el botón “¿Dudas?” de la página" className="sm:col-span-1">
          <Input value={form.clinic_phone} onChange={(e) => set("clinic_phone", e.target.value)} type="tel" placeholder="11 5555 1234" />
        </Field>
        <Field label="Dirección" className="sm:col-span-2">
          <Input value={form.clinic_address} onChange={(e) => set("clinic_address", e.target.value)} placeholder="Av. Siempreviva 742, CABA" />
        </Field>
        <Field label="Texto de bienvenida" className="sm:col-span-3">
          <Textarea rows={2} value={form.booking_intro} onChange={(e) => set("booking_intro", e.target.value)} />
        </Field>
        <Field label="Mensaje de confirmación por WhatsApp" hint="Variables: {nombre}, {fecha}, {hora}, {tratamiento}" className="sm:col-span-3">
          <Textarea rows={3} value={form.booking_confirm_template} onChange={(e) => set("booking_confirm_template", e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 rounded-2xl rounded-tl-md bg-[#e7f6ec] px-4 py-3 text-sm leading-relaxed text-[#1d3b29]">{preview}</div>
      <div className="mt-5 flex justify-end">
        <Button onClick={save} loading={update.isPending}>
          Guardar ajustes
        </Button>
      </div>
    </Card>
  );
}

