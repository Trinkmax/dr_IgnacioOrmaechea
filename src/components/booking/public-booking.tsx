"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarClock,
  CalendarX2,
  Check,
  Clock,
  Loader2,
  MapPin,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Skeleton } from "@/components/ui/misc";
import { Monogram } from "@/components/shell/nav";
import { getSupabase } from "@/lib/supabase/client";
import { useHydrated } from "@/lib/hooks";
import { durationLabel } from "@/lib/format";
import { cn, errorMessage, firstName, whatsappLink } from "@/lib/utils";
import { PATIENT_SOURCES, type BookingStatus, type TreatmentKind } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tipos de lo que devuelven las funciones públicas
// ---------------------------------------------------------------------------
type PublicTreatment = { id: string; name: string; kind: TreatmentKind; duration_min: number; description: string | null };
type BookingInfo = {
  clinic_name: string;
  clinic_tagline: string;
  clinic_phone: string | null;
  clinic_address: string | null;
  enabled: boolean;
  intro: string;
  horizon_days: number;
  min_notice_hours: number;
  timezone: string;
  treatments: PublicTreatment[];
};
type Slot = { starts_at: string; ends_at: string };
type RequestStatus = {
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  treatment: string | null;
  first_name: string;
  reply: string | null;
  created_at: string;
};

const STORAGE_KEY = "reservas:tokens";

// ---------------------------------------------------------------------------
// Fechas en la zona horaria del consultorio (no la del teléfono de la paciente)
// ---------------------------------------------------------------------------
function makeTz(timeZone: string) {
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" });
  const timeFmt = new Intl.DateTimeFormat("es-AR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const weekdayShort = new Intl.DateTimeFormat("es-AR", { timeZone, weekday: "short" });
  const dayNum = new Intl.DateTimeFormat("es-AR", { timeZone, day: "numeric" });
  const monthShort = new Intl.DateTimeFormat("es-AR", { timeZone, month: "short" });
  const long = new Intl.DateTimeFormat("es-AR", { timeZone, weekday: "long", day: "numeric", month: "long" });
  const clean = (s: string) => s.replace(".", "");
  return {
    key: (d: Date) => dayKey.format(d),
    hour: (d: Date) => Number(hour.format(d)),
    time: (d: Date) => timeFmt.format(d),
    weekday: (d: Date) => clean(weekdayShort.format(d)),
    day: (d: Date) => dayNum.format(d),
    month: (d: Date) => clean(monthShort.format(d)),
    long: (d: Date) => long.format(d),
  };
}
type Tz = ReturnType<typeof makeTz>;

function readTokens(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeTokens(tokens: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens.slice(0, 5)));
  } catch {
    // almacenamiento no disponible (modo privado): la paciente igual recibe el link
  }
}

// ---------------------------------------------------------------------------
export function PublicBooking() {
  const hydrated = useHydrated();
  // Todo depende de la fecha actual y del navegador: en el servidor solo va el esqueleto.
  if (!hydrated) return <PortalSkeleton />;
  return <Portal />;
}

function Portal() {
  const sb = getSupabase();
  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [infoError, setInfoError] = useState(false);
  const [treatmentId, setTreatmentId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [done, setDone] = useState<{ token: string; status: RequestStatus } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const loadInfo = useCallback(async () => {
    setInfoError(false);
    const { data, error } = await sb.rpc("booking_info");
    if (error || !data) return setInfoError(true);
    const parsed = data as unknown as BookingInfo;
    setInfo(parsed);
    if (parsed.treatments.length === 1) setTreatmentId(parsed.treatments[0].id);
  }, [sb]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde Supabase
    loadInfo();
  }, [loadInfo]);

  const tz = useMemo(() => makeTz(info?.timezone ?? "America/Argentina/Buenos_Aires"), [info?.timezone]);

  const loadSlots = useCallback(
    async (id: string, keepDay = false) => {
      if (!info) return;
      setSlotsLoading(true);
      setSlotsError(null);
      const from = tz.key(new Date());
      const to = tz.key(new Date(Date.now() + info.horizon_days * 86_400_000));
      const { data, error } = await sb.rpc("booking_slots", { p_treatment_id: id, p_from: from, p_to: to });
      setSlotsLoading(false);
      if (error) {
        setSlots([]);
        setSlotsError(errorMessage(error));
        return;
      }
      const list = (data ?? []) as Slot[];
      setSlots(list);
      setDayKey((current) => {
        const days = new Set(list.map((s) => tz.key(new Date(s.starts_at))));
        if (keepDay && current && days.has(current)) return current;
        return list.length ? tz.key(new Date(list[0].starts_at)) : null;
      });
    },
    [info, sb, tz],
  );

  useEffect(() => {
    if (!treatmentId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- trae horarios al elegir tratamiento
    setSlot(null);
    loadSlots(treatmentId);
  }, [treatmentId, loadSlots]);

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const key = tz.key(new Date(s.starts_at));
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    return [...map.entries()].map(([key, list]) => ({ key, date: new Date(list[0].starts_at), slots: list }));
  }, [slots, tz]);

  const daySlots = days.find((d) => d.key === dayKey)?.slots ?? [];
  const treatment = info?.treatments.find((t) => t.id === treatmentId) ?? null;

  const pickSlot = (s: Slot) => {
    setSlot(s);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  if (infoError) {
    return (
      <Shell>
        <Panel>
          <Message
            icon={<RefreshCw />}
            title="No pudimos cargar la agenda"
            description="Revisá tu conexión a internet y probá de nuevo."
            action={<Button onClick={loadInfo}>Reintentar</Button>}
          />
        </Panel>
      </Shell>
    );
  }
  if (!info) return <PortalSkeleton />;

  const contact = whatsappLink(info.clinic_phone, "Hola! Quería hacer una consulta por un turno.");

  return (
    <Shell info={info}>
      <MyRequests tz={tz} contact={info.clinic_phone} highlight={done?.token} />

      {done ? (
        <Panel>
          <Success
            tz={tz}
            status={done.status}
            onAnother={() => {
              setDone(null);
              setSlot(null);
              if (treatmentId) loadSlots(treatmentId);
            }}
          />
        </Panel>
      ) : !info.enabled || info.treatments.length === 0 ? (
        <Panel>
          <Message
            icon={<CalendarX2 />}
            title="Las reservas online están pausadas"
            description="Por ahora los turnos se dan por WhatsApp. Escribinos y te ayudamos a encontrar un horario."
            action={
              contact ? (
                <WhatsAppButton href={contact}>Escribir por WhatsApp</WhatsAppButton>
              ) : null
            }
          />
        </Panel>
      ) : (
        <Panel>
          {/* 1 · Tratamiento */}
          <Step n={1} title="¿Qué turno necesitás?" done={Boolean(treatment)}>
            <div className="grid gap-2">
              {info.treatments.map((t) => {
                const active = t.id === treatmentId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTreatmentId(t.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150",
                      active ? "border-accent bg-accent-soft/60 shadow-[0_0_0_3px_rgb(168_111_82/0.12)]" : "border-line bg-surface hover:border-line-strong hover:bg-subtle",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        active ? "border-accent bg-accent text-white" : "border-line-strong",
                      )}
                      aria-hidden
                    >
                      {active ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">{t.name}</span>
                      {t.description ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.description}</span> : null}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
                      <Clock className="size-3.5" /> {durationLabel(t.duration_min)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Step>

          {/* 2 · Día y horario */}
          {treatment ? (
            <Step n={2} title="Elegí día y horario" done={Boolean(slot)}>
              {slotsLoading && !slots ? (
                <div className="space-y-3">
                  <div className="flex gap-2 overflow-hidden">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-[76px] w-[64px] shrink-0 rounded-2xl" />
                    ))}
                  </div>
                  <Skeleton className="h-24 rounded-2xl" />
                </div>
              ) : slotsError ? (
                <Message
                  compact
                  icon={<RefreshCw />}
                  title="No pudimos traer los horarios"
                  description={slotsError}
                  action={
                    <Button variant="secondary" onClick={() => loadSlots(treatment.id)}>
                      Reintentar
                    </Button>
                  }
                />
              ) : days.length === 0 ? (
                <Message
                  compact
                  icon={<CalendarX2 />}
                  title="No quedan horarios libres"
                  description={`No hay turnos disponibles en los próximos ${info.horizon_days} días. Escribinos y te avisamos cuando se libere uno.`}
                  action={contact ? <WhatsAppButton href={contact}>Consultar por WhatsApp</WhatsAppButton> : null}
                />
              ) : (
                <>
                  <div className="no-scrollbar -mx-5 flex snap-x scroll-px-5 gap-2 sm:scroll-px-6 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6" role="listbox" aria-label="Días disponibles">
                    {days.map((d) => {
                      const active = d.key === dayKey;
                      return (
                        <button
                          key={d.key}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            setDayKey(d.key);
                            setSlot(null);
                          }}
                          className={cn(
                            "flex w-[64px] shrink-0 snap-start flex-col items-center rounded-2xl border py-2.5 transition-[background-color,border-color,color] duration-150",
                            active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink hover:border-line-strong",
                          )}
                        >
                          <span className={cn("text-[11px] font-semibold uppercase tracking-wide", active ? "text-white/70" : "text-muted")}>{tz.weekday(d.date)}</span>
                          <span className="font-display text-[22px] leading-tight">{tz.day(d.date)}</span>
                          <span className={cn("text-[11px]", active ? "text-white/70" : "text-muted")}>{tz.month(d.date)}</span>
                        </button>
                      );
                    })}
                  </div>

                  {dayKey && daySlots.length ? (
                    <div className="mt-5 space-y-4">
                      <p className="text-sm font-medium text-ink-2 first-letter:uppercase">{tz.long(new Date(daySlots[0].starts_at))}</p>
                      {(
                        [
                          ["Mañana", (h: number) => h < 13],
                          ["Tarde", (h: number) => h >= 13 && h < 19],
                          ["Noche", (h: number) => h >= 19],
                        ] as const
                      ).map(([label, test]) => {
                        const group = daySlots.filter((s) => test(tz.hour(new Date(s.starts_at))));
                        if (!group.length) return null;
                        return (
                          <div key={label}>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
                            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                              {group.map((s) => {
                                const active = slot?.starts_at === s.starts_at;
                                return (
                                  <button
                                    key={s.starts_at}
                                    type="button"
                                    onClick={() => pickSlot(s)}
                                    aria-pressed={active}
                                    className={cn(
                                      "h-11 rounded-xl border text-[15px] font-semibold tabular-nums transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96]",
                                      active ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink hover:border-accent/50 hover:bg-accent-soft/40",
                                    )}
                                  >
                                    {tz.time(new Date(s.starts_at))}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </Step>
          ) : null}

          {/* 3 · Datos */}
          {treatment && slot ? (
            <div ref={formRef} className="scroll-mt-4">
              <Step n={3} title="Tus datos" last>
                <BookingForm
                  tz={tz}
                  treatment={treatment}
                  slot={slot}
                  onSlotTaken={() => {
                    setSlot(null);
                    loadSlots(treatment.id, true);
                  }}
                  onDone={(token, status) => {
                    writeTokens([token, ...readTokens().filter((t) => t !== token)]);
                    setDone({ token, status });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              </Step>
            </div>
          ) : null}
        </Panel>
      )}

      {info.clinic_address || contact ? (
        <div className="mt-6 flex flex-col items-center gap-2 text-center text-[13px] text-muted">
          {info.clinic_address ? (
            <p className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" /> {info.clinic_address}
            </p>
          ) : null}
          {contact ? (
            <a href={contact} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-ink-2 underline-offset-4 hover:underline">
              <MessageCircle className="size-3.5" /> ¿Dudas? Escribinos por WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Formulario de datos
// ---------------------------------------------------------------------------
function BookingForm({
  tz,
  treatment,
  slot,
  onSlotTaken,
  onDone,
}: {
  tz: Tz;
  treatment: PublicTreatment;
  slot: Slot;
  onSlotTaken: () => void;
  onDone: (token: string, status: RequestStatus) => void;
}) {
  const [form, setForm] = useState({ name: "", phone: "", dni: "", email: "", source: "", notes: "", website: "" });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const start = new Date(slot.starts_at);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = form.name.trim().replace(/\s+/g, " ");
    if (name.split(" ").length < 2) return setError("Ingresá tu nombre y apellido.");
    if (form.phone.replace(/\D/g, "").length < 8) return setError("Ingresá tu celular con código de área (ej. 11 5555 1234).");
    setSending(true);
    try {
      const sb = getSupabase();
      const { data, error: rpcError } = await sb.rpc("request_booking", {
        p_treatment_id: treatment.id,
        p_starts_at: slot.starts_at,
        p_full_name: name,
        p_phone: form.phone,
        p_email: form.email,
        p_dni: form.dni,
        p_source: form.source,
        p_notes: form.notes,
        p_website: form.website,
      });
      if (rpcError) throw rpcError;
      const token = (data as { token: string }).token;
      const { data: status } = await sb.rpc("booking_status", { p_token: token });
      onDone(token, (status as unknown as RequestStatus) ?? {
        status: "pendiente",
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        treatment: treatment.name,
        first_name: firstName(name),
        reply: null,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      setSending(false);
      if (message.includes("ya no está disponible")) onSlotTaken();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-sunken/70 px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-accent-ink shadow-card">
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink first-letter:uppercase">
            {tz.long(start)} · {tz.time(start)} h
          </p>
          <p className="truncate text-xs text-muted">
            {treatment.name} · {durationLabel(treatment.duration_min)}
          </p>
        </div>
      </div>

      <Field label="Nombre y apellido">
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" placeholder="María González" className="h-12" />
      </Field>
      <Field label="Celular (WhatsApp)" hint="Te escribimos a este número para confirmar el turno">
        <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="11 5555 1234" className="h-12" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="DNI" aside={<span className="text-xs text-faint">opcional</span>}>
          <Input value={form.dni} onChange={(e) => set("dni", e.target.value)} inputMode="numeric" placeholder="30123456" className="h-12" />
        </Field>
        <Field label="Email" aside={<span className="text-xs text-faint">opcional</span>}>
          <Input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="nombre@mail.com" className="h-12" />
        </Field>
      </div>
      <Field label="¿Cómo nos conociste?" aside={<span className="text-xs text-faint">opcional</span>}>
        <Select value={form.source} onChange={(e) => set("source", e.target.value)} className="h-12">
          <option value="">Elegí una opción</option>
          {PATIENT_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="¿Algo que quieras contarnos?" aside={<span className="text-xs text-faint">opcional</span>}>
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={600} placeholder="Motivo de la consulta, preguntas…" />
      </Field>
      {/* Trampa para bots: invisible para personas. */}
      <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label>
          No completar
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
        </label>
      </div>

      {error ? <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}

      <Button type="submit" size="lg" className="w-full" loading={sending}>
        Solicitar turno
        {!sending ? <ArrowRight className="size-4" /> : null}
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted">El turno queda reservado para vos hasta que el consultorio lo confirme por WhatsApp.</p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Resultado y solicitudes guardadas en este teléfono
// ---------------------------------------------------------------------------
function Success({ tz, status, onAnother }: { tz: Tz; status: RequestStatus; onAnother: () => void }) {
  const start = new Date(status.starts_at);
  return (
    <div className="animate-rise py-4 text-center">
      <div className="relative mx-auto mb-5 flex size-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping-soft rounded-full bg-success/25" aria-hidden />
        <span className="relative flex size-16 items-center justify-center rounded-full bg-success text-white">
          <Check className="size-8" strokeWidth={2.5} />
        </span>
      </div>
      <h2 className="font-display text-[26px] leading-tight text-ink">¡Listo, {status.first_name}!</h2>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted">Recibimos tu solicitud. Te vamos a escribir por WhatsApp para confirmarte el turno.</p>
      <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-line bg-subtle p-4 text-left">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Tu solicitud</p>
        <p className="mt-1.5 text-[15px] font-semibold text-ink first-letter:uppercase">
          {tz.long(start)} · {tz.time(start)} h
        </p>
        <p className="text-sm text-ink-2">{status.treatment}</p>
        <Badge tone="warning" dot className="mt-3">
          Pendiente de confirmación
        </Badge>
      </div>
      <Button variant="secondary" className="mt-6" onClick={onAnother}>
        Pedir otro turno
      </Button>
    </div>
  );
}

function MyRequests({ tz, contact, highlight }: { tz: Tz; contact: string | null; highlight?: string }) {
  const [items, setItems] = useState<{ token: string; status: RequestStatus }[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    const fromUrl = new URLSearchParams(window.location.search).get("s");
    let tokens = readTokens();
    if (fromUrl && /^[0-9a-f-]{36}$/i.test(fromUrl) && !tokens.includes(fromUrl)) {
      tokens = [fromUrl, ...tokens];
      writeTokens(tokens);
    }
    if (!tokens.length) return setItems([]);
    const sb = getSupabase();
    const results = await Promise.all(tokens.map(async (token) => ({ token, res: await sb.rpc("booking_status", { p_token: token }) })));
    const now = Date.now();
    const keep = results
      .filter((r) => r.res.data)
      .map((r) => ({ token: r.token, status: r.res.data as unknown as RequestStatus }))
      // Se muestran las que siguen vigentes (turno a futuro o decididas hace poco).
      .filter((r) => new Date(r.status.ends_at).getTime() > now);
    writeTokens(keep.map((k) => k.token));
    setItems(keep);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee las solicitudes guardadas en el teléfono
    load();
  }, [load, highlight]);

  const visible = items.filter((i) => i.token !== highlight);
  if (!visible.length) return null;

  const cancel = async (token: string) => {
    setCancelling(token);
    await getSupabase().rpc("cancel_booking", { p_token: token });
    setCancelling(null);
    load();
  };

  return (
    <div className="mb-4 space-y-2">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Tus turnos</p>
      {visible.map(({ token, status }) => {
        const start = new Date(status.starts_at);
        const meta = {
          pendiente: { tone: "warning", label: "Esperando confirmación" },
          confirmado: { tone: "success", label: "Confirmado" },
          rechazado: { tone: "danger", label: "No pudimos confirmarlo" },
          cancelado: { tone: "neutral", label: "Cancelado" },
        }[status.status] as { tone: "warning" | "success" | "danger" | "neutral"; label: string };
        const wa = whatsappLink(contact, `Hola! Soy ${status.first_name}, tengo un turno el ${tz.long(start)} a las ${tz.time(start)}. `);
        return (
          <div key={token} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink first-letter:uppercase">
                  {tz.long(start)} · {tz.time(start)} h
                </p>
                <p className="text-sm text-muted">{status.treatment}</p>
              </div>
              <Badge tone={meta.tone} dot className="shrink-0">
                {meta.label}
              </Badge>
            </div>
            {status.reply ? <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-[13px] leading-relaxed text-ink-2">{status.reply}</p> : null}
            {status.status === "pendiente" || status.status === "confirmado" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {status.status === "pendiente" ? (
                  <Button size="sm" variant="ghost" loading={cancelling === token} onClick={() => cancel(token)}>
                    Cancelar solicitud
                  </Button>
                ) : wa ? (
                  <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-2 hover:bg-sunken">
                    <MessageCircle className="size-3.5" /> ¿Necesitás cambiarlo? Escribinos
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estructura
// ---------------------------------------------------------------------------
function Shell({ info, children }: { info?: BookingInfo; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="relative overflow-hidden bg-[#1c1714] px-5 pb-20 pt-10 text-center text-[#efe6dd] sm:pb-24 sm:pt-14">
        <div
          className="pointer-events-none absolute -right-32 -top-32 size-[420px] rounded-full opacity-[0.18]"
          style={{ background: "radial-gradient(circle at 30% 30%, #d9b8a4, transparent 62%)" }}
          aria-hidden
        />
        <Monogram light className="relative mx-auto size-14 text-[22px]" />
        <p className="relative mt-4 font-display text-[13px] uppercase tracking-[0.14em] text-white">{info?.clinic_name ?? " "}</p>
        <p className="relative mt-1 text-[11px] uppercase tracking-[0.18em] text-[#a8988a]">{info?.clinic_tagline ?? " "}</p>
        <h1 className="relative mt-6 font-display text-[32px] leading-[1.08] tracking-[-0.035em] text-white sm:text-[40px]">
          Reservá tu <span className="text-[#e6c9b6]">turno</span>
        </h1>
        {info?.intro ? <p className="relative mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#b9ab9e]">{info.intro}</p> : null}
      </header>
      <main className="relative mx-auto -mt-12 w-full max-w-xl px-4 pb-12 sm:-mt-14">{children}</main>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-[22px] border border-line/80 bg-surface p-5 shadow-lift sm:p-6">{children}</section>;
}

function Step({ n, title, done, last, children }: { n: number; title: string; done?: boolean; last?: boolean; children: ReactNode }) {
  return (
    <div className={cn("animate-rise", !last && "mb-7")}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors",
            done ? "bg-success text-white" : "bg-brand text-white",
          )}
        >
          {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
        </span>
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Message({ icon, title, description, action, compact }: { icon: ReactNode; title: string; description: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "py-4" : "py-8")}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-sunken text-muted [&_svg]:size-5">{icon}</div>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function WhatsAppButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#e7f6ec] px-4 text-sm font-semibold text-[#1d6b3c] transition-colors hover:bg-[#dcf1e4]">
      <MessageCircle className="size-4" /> {children}
    </a>
  );
}

function PortalSkeleton() {
  return (
    <Shell>
      <Panel>
        <div className="mb-3.5 flex items-center gap-2.5">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-[68px] rounded-2xl" />
          <Skeleton className="h-[68px] rounded-2xl" />
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Buscando horarios…
        </div>
      </Panel>
    </Shell>
  );
}

