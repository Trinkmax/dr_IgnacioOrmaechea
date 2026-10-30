"use client";

import { useMemo, useState } from "react";
import { addMinutes, differenceInMinutes, endOfDay, format, startOfDay } from "date-fns";
import { AlertTriangle, CalendarClock, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/misc";
import { PatientPicker } from "@/components/ui/patient-picker";
import { SheetBody, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { useDismiss, useOverlay, type AppointmentDefaults } from "@/components/shell/overlay-store";
import { useAppointment, useAppointmentsRange, useCreateAppointment, useRemoveFromWaitlist, useUpdateAppointment } from "@/lib/queries/agenda";
import { useTreatments } from "@/lib/queries/catalog";
import { capitalize, durationLabel, fmt, money, time } from "@/lib/format";
import { cn, errorMessage } from "@/lib/utils";
import { KIND_META, STATUS_META, STATUS_ORDER, type AppointmentStatus, type Currency, type TreatmentKind } from "@/lib/types";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export function AppointmentFormSheet({ appointmentId, defaults }: { appointmentId?: string; defaults?: AppointmentDefaults }) {
  const { data: existing, isLoading } = useAppointment(appointmentId);
  if (appointmentId && isLoading && !existing) {
    return (
      <>
        <SheetHeader title="Editar turno" />
        <SheetBody>
          <div className="skeleton h-40" />
        </SheetBody>
      </>
    );
  }
  return <AppointmentForm key={existing?.id ?? "new"} existing={existing ?? null} defaults={defaults} />;
}

function AppointmentForm({
  existing,
  defaults,
}: {
  existing: ReturnType<typeof useAppointment>["data"];
  defaults?: AppointmentDefaults;
}) {
  const dismiss = useDismiss();
  const { replace } = useOverlay();
  const { data: treatments = [] } = useTreatments();
  const create = useCreateAppointment();
  const update = useUpdateAppointment();
  const removeWaitlist = useRemoveFromWaitlist();

  const initialStart = existing ? new Date(existing.starts_at) : defaults?.startsAt ? new Date(defaults.startsAt) : nextSlot();
  const defaultTreatment = treatments.find((t) => t.id === (existing?.treatment_id ?? defaults?.treatmentId));

  const [mode, setMode] = useState<"turno" | "bloqueo">(existing ? (existing.patient_id ? "turno" : "bloqueo") : defaults?.block ? "bloqueo" : "turno");
  const [patientId, setPatientId] = useState<string | null>(existing?.patient_id ?? defaults?.patientId ?? null);
  const [treatmentId, setTreatmentId] = useState<string>(existing?.treatment_id ?? defaults?.treatmentId ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(format(initialStart, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState(format(initialStart, "HH:mm"));
  const [duration, setDuration] = useState<number>(
    existing
      ? differenceInMinutes(new Date(existing.ends_at), new Date(existing.starts_at))
      : (defaults?.durationMin ?? defaultTreatment?.duration_min ?? 30),
  );
  const [price, setPrice] = useState<number | null>(existing ? existing.price : (defaultTreatment?.price ?? null));
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? defaultTreatment?.currency ?? "ARS");
  const [status, setStatus] = useState<AppointmentStatus>(existing?.status ?? "pendiente");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  // Si los tratamientos llegan después del primer render, completar precio y duración.
  const [seeded, setSeeded] = useState(Boolean(existing) || Boolean(defaultTreatment) || !defaults?.treatmentId);
  if (!seeded && treatments.length) {
    setSeeded(true);
    const t = treatments.find((x) => x.id === defaults?.treatmentId);
    if (t) {
      setPrice(t.price);
      setCurrency(t.currency);
      if (!defaults?.durationMin) setDuration(t.duration_min);
    }
  }

  const startsAt = useMemo(() => {
    const d = new Date(`${date}T${startTime || "00:00"}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [date, startTime]);
  const endsAt = startsAt ? addMinutes(startsAt, duration) : null;

  // Superposiciones con otros turnos del mismo día
  const dayStart = startsAt ? startOfDay(startsAt) : startOfDay(new Date());
  const { data: dayAppointments = [] } = useAppointmentsRange(dayStart, endOfDay(dayStart), Boolean(startsAt));
  const overlaps = useMemo(() => {
    if (!startsAt || !endsAt) return [];
    return dayAppointments.filter(
      (a) =>
        a.id !== existing?.id &&
        a.status !== "cancelado" &&
        new Date(a.starts_at) < endsAt &&
        new Date(a.ends_at) > startsAt,
    );
  }, [dayAppointments, startsAt, endsAt, existing?.id]);

  const grouped = useMemo(() => {
    const groups: Record<TreatmentKind, typeof treatments> = { cirugia: [], procedimiento: [], consulta: [] };
    for (const t of treatments) if (t.active || t.id === treatmentId) groups[t.kind].push(t);
    return groups;
  }, [treatments, treatmentId]);

  const onTreatmentChange = (id: string) => {
    setTreatmentId(id);
    const t = treatments.find((x) => x.id === id);
    if (t) {
      setDuration(t.duration_min);
      setPrice(t.price);
      setCurrency(t.currency);
    }
  };

  const submit = async () => {
    setError(null);
    if (!startsAt || !endsAt) return setError("Revisá la fecha y la hora.");
    if (mode === "turno" && !patientId) return setError("Elegí o creá un paciente.");
    if (mode === "bloqueo" && !title.trim()) return setError("Poné un motivo para el bloqueo (ej.: Congreso).");

    const values = {
      patient_id: mode === "turno" ? patientId : null,
      treatment_id: mode === "turno" && treatmentId ? treatmentId : null,
      title: mode === "bloqueo" ? title.trim() : null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: mode === "bloqueo" ? ("confirmado" as const) : status,
      price: mode === "turno" ? (price ?? 0) : 0,
      currency,
      notes: notes.trim() || null,
    };

    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, patch: values });
        toast.success("Turno actualizado");
        dismiss();
      } else {
        const created = await create.mutateAsync(values);
        if (defaults?.waitlistId) removeWaitlist.mutate(defaults.waitlistId);
        toast.success(mode === "bloqueo" ? "Horario bloqueado" : "Turno agendado", {
          description: `${capitalize(fmt(startsAt, "EEEE d 'de' MMMM"))} · ${time(startsAt)} a ${time(endsAt)}`,
        });
        if (mode === "turno") replace({ type: "appointment", id: created.id });
        else dismiss();
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <>
      <SheetHeader
        title={existing ? (existing.patient_id ? "Editar turno" : "Editar bloqueo") : "Nuevo turno"}
        subtitle={startsAt ? `${capitalize(fmt(startsAt, "EEEE d 'de' MMMM"))} · ${time(startsAt)}${endsAt ? ` a ${time(endsAt)}` : ""}` : undefined}
      />
      <SheetBody className="space-y-5">
        {!existing ? (
          <Segmented
            stretch
            value={mode}
            onChange={setMode}
            options={[
              { value: "turno", label: <span className="flex items-center gap-1.5"><CalendarClock className="size-3.5" />Turno</span> },
              { value: "bloqueo", label: <span className="flex items-center gap-1.5"><Lock className="size-3.5" />Bloquear horario</span> },
            ]}
          />
        ) : null}

        {mode === "turno" ? (
          <>
            <Field label="Paciente">
              <PatientPicker value={patientId} onChange={(p) => setPatientId(p?.id ?? null)} autoFocus={!existing && !patientId} />
            </Field>
            <Field label="Tratamiento">
              <Select value={treatmentId} onChange={(e) => onTreatmentChange(e.target.value)}>
                <option value="">Sin tratamiento definido</option>
                {(Object.keys(grouped) as TreatmentKind[]).map((kind) =>
                  grouped[kind].length ? (
                    <optgroup key={kind} label={KIND_META[kind].plural}>
                      {grouped[kind].map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} · {money(t.price, t.currency)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null,
                )}
              </Select>
            </Field>
          </>
        ) : (
          <Field label="Motivo" hint="Se muestra en la agenda para que nadie dé turnos en ese horario.">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Congreso, cirugía en otra clínica, vacaciones" autoFocus={!existing} />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Hora">
            <Input type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
        </div>

        <Field label="Duración" aside={endsAt ? <span className="text-xs text-muted">termina {time(endsAt)}</span> : null}>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={cn(
                  "h-9 rounded-lg border px-3 text-[13px] font-medium transition-colors",
                  duration === d ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                )}
              >
                {durationLabel(d)}
              </button>
            ))}
            {!DURATIONS.includes(duration) ? (
              <span className="flex h-9 items-center rounded-lg border border-brand bg-brand px-3 text-[13px] font-medium text-white">{durationLabel(duration)}</span>
            ) : null}
          </div>
        </Field>

        {overlaps.length ? (
          <div className="flex gap-2.5 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2.5 text-[13px] text-[#7a520f]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              Se superpone con{" "}
              {overlaps
                .slice(0, 2)
                .map((a) => `${a.patient?.full_name ?? a.title ?? "otro turno"} (${time(a.starts_at)}–${time(a.ends_at)})`)
                .join(" y ")}
              {overlaps.length > 2 ? ` y ${overlaps.length - 2} más` : ""}.
            </div>
          </div>
        ) : null}

        {mode === "turno" ? (
          <>
            <Field label="Precio acordado" hint="Se completa con el precio del tratamiento. Podés ajustarlo (descuentos, combos).">
              <MoneyInput value={price} onChange={setPrice} currency={currency} onCurrencyChange={setCurrency} />
            </Field>
            {existing ? (
              <Field label="Estado">
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={cn(
                        "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                        status === s ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                      )}
                    >
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </Field>
            ) : null}
          </>
        ) : null}

        <Field label="Notas">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Indicaciones, estudios pre-quirúrgicos, observaciones…" />
        </Field>

        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
          Cancelar
        </Button>
        <Button size="lg" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={saving}>
          {existing ? "Guardar cambios" : mode === "bloqueo" ? "Bloquear horario" : "Agendar turno"}
        </Button>
      </SheetFooter>
    </>
  );
}

function nextSlot() {
  const d = new Date();
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(m + (30 - (m % 30)));
  return d;
}
