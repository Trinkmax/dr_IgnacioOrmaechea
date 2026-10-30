"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, ClipboardList, MessageCircle, Pencil, Phone, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Avatar, Badge, Progress, StatusBadge, TreatmentTag } from "@/components/ui/misc";
import { useNow } from "@/lib/hooks";
import { SheetBody, SheetFooter, SheetHeader, SheetSection } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm";
import { useDismiss, useOverlay } from "@/components/shell/overlay-store";
import { usePatient, useDeletePatient, useSavePatient } from "@/lib/queries/patients";
import { usePatientAppointments } from "@/lib/queries/agenda";
import { usePatientPayments } from "@/lib/queries/money";
import { useRole } from "@/lib/queries/session";
import { appointmentPaid } from "@/lib/money-helpers";
import { age, capitalize, fmt, money, relativeDay, time } from "@/lib/format";
import { cn, errorMessage, telLink, whatsappLink } from "@/lib/utils";
import { METHOD_META, PATIENT_SOURCES, type CalendarAppointment, type Patient } from "@/lib/types";

// ---------------------------------------------------------------------------
// Alta / edición
// ---------------------------------------------------------------------------
export function PatientFormSheet({
  patientId,
  initialName,
  onSaved,
}: {
  patientId?: string;
  initialName?: string;
  onSaved?: (patient: Patient) => void;
}) {
  const { data: existing, isLoading } = usePatient(patientId);
  if (patientId && isLoading && !existing) {
    return (
      <>
        <SheetHeader title="Editar paciente" />
        <SheetBody>
          <div className="skeleton h-64" />
        </SheetBody>
      </>
    );
  }
  return <PatientForm key={existing?.id ?? "new"} existing={existing} initialName={initialName} onSaved={onSaved} />;
}

function PatientForm({ existing, initialName, onSaved }: { existing: Patient | null; initialName?: string; onSaved?: (p: Patient) => void }) {
  const dismiss = useDismiss();
  const { replace } = useOverlay();
  const save = useSavePatient();
  const [form, setForm] = useState({
    full_name: existing?.full_name ?? initialName ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    dni: existing?.dni ?? "",
    birth_date: existing?.birth_date ?? "",
    source: existing?.source ?? "",
    notes: existing?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setError(null);
    const name = form.full_name.trim().replace(/\s+/g, " ");
    if (name.length < 2) return setError("Ingresá nombre y apellido.");
    try {
      const patient = await save.mutateAsync({
        id: existing?.id,
        values: {
          full_name: name,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          dni: form.dni.trim() || null,
          birth_date: form.birth_date || null,
          source: form.source || null,
          notes: form.notes.trim() || null,
        },
      });
      toast.success(existing ? "Datos actualizados" : `${patient.full_name} agregado a pacientes`);
      if (onSaved) {
        onSaved(patient);
        dismiss();
      } else if (existing) {
        dismiss();
      } else {
        replace({ type: "patient", id: patient.id });
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <SheetHeader title={existing ? "Editar paciente" : "Nuevo paciente"} subtitle={existing ? existing.full_name : "Solo el nombre es obligatorio"} />
      <SheetBody className="space-y-4">
        <Field label="Nombre y apellido">
          <Input value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} placeholder="Ej.: María González" autoFocus={!existing} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Celular" hint="Para recordatorios por WhatsApp">
            <Input inputMode="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="11 5555 5555" autoComplete="off" />
          </Field>
          <Field label="Email">
            <Input type="email" inputMode="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="nombre@mail.com" autoComplete="off" />
          </Field>
          <Field label="DNI">
            <Input inputMode="numeric" value={form.dni} onChange={(e) => set("dni")(e.target.value)} placeholder="30.123.456" autoComplete="off" />
          </Field>
          <Field label="Fecha de nacimiento">
            <Input type="date" value={form.birth_date} onChange={(e) => set("birth_date")(e.target.value)} />
          </Field>
        </div>
        <Field label="¿Cómo nos conoció?">
          <div className="flex flex-wrap gap-1.5">
            {PATIENT_SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("source")(form.source === s ? "" : s)}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                  form.source === s ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notas clínicas y personales" hint="Antecedentes, alergias, medicación, preferencias.">
          <Textarea rows={4} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
        </Field>
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
          Cancelar
        </Button>
        <Button size="lg" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={save.isPending}>
          {existing ? "Guardar cambios" : "Crear paciente"}
        </Button>
      </SheetFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ficha del paciente
// ---------------------------------------------------------------------------
export function PatientSheet({ id }: { id: string }) {
  const { data: patient, isLoading } = usePatient(id);
  const { data: appointments = [], isLoading: loadingAppts } = usePatientAppointments(id);
  const { data: payments = [] } = usePatientPayments(id);
  const { isAdmin } = useRole();
  const { push } = useOverlay();
  const dismiss = useDismiss();
  const confirm = useConfirm();
  const remove = useDeletePatient();

  const nowDate = useNow(60_000);
  const { upcoming, past, balances, totalPaidArs } = useMemo(() => {
    const now = nowDate.getTime();
    const upcoming = appointments.filter((a) => new Date(a.ends_at).getTime() >= now && a.status !== "cancelado").reverse();
    const past = appointments.filter((a) => !(new Date(a.ends_at).getTime() >= now && a.status !== "cancelado"));
    const balances = { ARS: 0, USD: 0 };
    for (const a of appointments) {
      if (a.status === "cancelado" || a.status === "ausente") continue;
      balances[a.currency] += appointmentPaid(a).balance;
    }
    const totalPaidArs = payments.reduce((t, p) => t + (p.amount_ars ?? 0), 0);
    return { upcoming, past, balances, totalPaidArs };
  }, [appointments, payments, nowDate]);

  if (!patient) {
    return (
      <>
        <SheetHeader title={isLoading ? "Cargando…" : "Paciente no encontrado"} />
        <SheetBody>{isLoading ? <div className="skeleton h-64" /> : null}</SheetBody>
      </>
    );
  }

  const years = age(patient.birth_date);
  const wa = whatsappLink(patient.phone);
  const tel = telLink(patient.phone);
  const owes = balances.ARS > 0 || balances.USD > 0;

  const onDelete = async () => {
    const ok = await confirm({
      title: `¿Eliminar a ${patient.full_name}?`,
      description:
        payments.length > 0
          ? "Tiene cobros registrados, por lo que no se puede eliminar (para no perder el historial de caja)."
          : `Se borran también sus ${appointments.length} turnos. Esta acción no se puede deshacer.`,
      confirmLabel: payments.length > 0 ? "Entendido" : "Eliminar",
      tone: payments.length > 0 ? "default" : "danger",
    });
    if (!ok || payments.length > 0) return;
    try {
      await remove.mutateAsync(patient.id);
      toast.success("Paciente eliminado");
      dismiss();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <SheetHeader
        title={patient.full_name}
        subtitle={[years != null ? `${years} años` : null, `Paciente desde ${fmt(patient.created_at, "MMM yyyy")}`].filter(Boolean).join(" · ")}
        leading={<Avatar name={patient.full_name} size={44} />}
      />
      <SheetBody>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction href={wa} icon={<MessageCircle className="size-5" />} label="WhatsApp" tone="whatsapp" />
          <QuickAction href={tel} icon={<Phone className="size-5" />} label="Llamar" />
          <QuickAction onClick={() => push({ type: "appointment-form", defaults: { patientId: patient.id } })} icon={<CalendarPlus className="size-5" />} label="Turno" />
          <QuickAction onClick={() => push({ type: "payment-form", patientId: patient.id })} icon={<Wallet className="size-5" />} label="Cobrar" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className={cn("rounded-2xl border p-3.5", owes ? "border-danger/20 bg-danger-soft/60" : "border-line bg-subtle")}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Saldo pendiente</p>
            <p className={cn("mt-1 text-[15px] font-semibold tabular-nums", owes ? "text-danger" : "text-ink")}>
              {owes
                ? [balances.USD > 0 ? money(balances.USD, "USD") : null, balances.ARS > 0 ? money(balances.ARS, "ARS") : null].filter(Boolean).join(" + ")
                : "Al día"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-subtle p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Total abonado</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums text-ink">{money(totalPaidArs)}</p>
          </div>
        </div>

        <SheetSection title={`Próximos turnos${upcoming.length ? ` · ${upcoming.length}` : ""}`}>
          {loadingAppts ? (
            <div className="skeleton h-16" />
          ) : upcoming.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-center text-[13px] text-muted">Sin turnos próximos</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((a) => (
                <AppointmentRow key={a.id} appt={a} onClick={() => push({ type: "appointment", id: a.id })} />
              ))}
            </div>
          )}
        </SheetSection>

        {past.length ? (
          <SheetSection title={`Historial · ${past.length}`}>
            <div className="space-y-2">
              {past.slice(0, 12).map((a) => (
                <AppointmentRow key={a.id} appt={a} onClick={() => push({ type: "appointment", id: a.id })} />
              ))}
            </div>
          </SheetSection>
        ) : null}

        {payments.length ? (
          <SheetSection title={`Cobros · ${payments.length}`}>
            <div className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line">
              {payments.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => isAdmin && push({ type: "payment-form", paymentId: p.id })}
                  className={cn("flex w-full items-center gap-3 bg-surface px-3.5 py-3 text-left", isAdmin && "hover:bg-subtle")}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{p.concept || p.appointment?.treatment?.name || "Cobro"}</p>
                    <p className="truncate text-xs text-muted">
                      {capitalize(fmt(p.paid_on, "d MMM yyyy"))} · {METHOD_META[p.method].label}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-success">{money(p.amount, p.currency)}</span>
                </button>
              ))}
            </div>
          </SheetSection>
        ) : null}

        <SheetSection title="Datos">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface p-4 text-sm">
            <Info label="Celular" value={patient.phone} />
            <Info label="Email" value={patient.email} />
            <Info label="DNI" value={patient.dni} />
            <Info label="Nacimiento" value={patient.birth_date ? fmt(patient.birth_date, "d/MM/yyyy") : null} />
            <Info label="Nos conoció por" value={patient.source} />
          </dl>
        </SheetSection>

        {patient.notes ? (
          <SheetSection title="Notas">
            <p className="whitespace-pre-wrap rounded-2xl bg-subtle px-4 py-3 text-sm leading-relaxed text-ink-2">{patient.notes}</p>
          </SheetSection>
        ) : null}
      </SheetBody>
      <SheetFooter>
        {isAdmin ? (
          <Button variant="danger-ghost" size="icon" aria-label="Eliminar paciente" onClick={onDelete}>
            <Trash2 className="size-[18px]" />
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => push({ type: "waitlist-form", patientId: patient.id })}>
          <ClipboardList className="size-4" />
          <span className="hidden sm:inline">Agregar a</span> Por agendar
        </Button>
        <Button className="ml-auto" size="lg" onClick={() => push({ type: "patient-form", patientId: patient.id })}>
          <Pencil className="size-4" />
          Editar
        </Button>
      </SheetFooter>
    </>
  );
}

function QuickAction({ href, onClick, icon, label, tone }: { href?: string | null; onClick?: () => void; icon: React.ReactNode; label: string; tone?: "whatsapp" }) {
  const className = cn(
    "flex h-[68px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-medium transition-[transform,background-color] active:scale-[0.97]",
    tone === "whatsapp" ? "bg-[#e7f6ec] text-[#1d6b3c] hover:bg-[#dcf1e4]" : "bg-sunken text-ink-2 hover:bg-line",
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {icon}
        {label}
      </button>
    );
  }
  if (!href) {
    return (
      <span className={cn(className, "pointer-events-none bg-sunken text-faint")} aria-disabled>
        {icon}
        {label}
      </span>
    );
  }
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={className}>
      {icon}
      {label}
    </a>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("mt-0.5 truncate font-medium", value ? "text-ink" : "text-faint")}>{value || "—"}</dd>
    </div>
  );
}

function AppointmentRow({ appt, onClick }: { appt: CalendarAppointment; onClick: () => void }) {
  const paid = appointmentPaid(appt);
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left transition-colors hover:bg-subtle">
      <div className="w-14 shrink-0 text-center">
        <p className="text-[11px] font-medium uppercase text-muted">{fmt(appt.starts_at, "MMM")}</p>
        <p className="font-display text-2xl leading-none text-ink">{fmt(appt.starts_at, "d")}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {appt.treatment ? <TreatmentTag name={appt.treatment.name} color={appt.treatment.color} /> : <Badge>Turno</Badge>}
        </div>
        <p className="mt-1 truncate text-xs text-muted">
          {capitalize(relativeDay(appt.starts_at))} · {time(appt.starts_at)}
          {paid.price > 0 ? ` · ${paid.settled ? "pagado" : `saldo ${money(paid.balance, appt.currency)}`}` : ""}
        </p>
        {paid.price > 0 && !paid.settled ? <Progress value={paid.ratio * 100} className="mt-2 h-1" /> : null}
      </div>
      <StatusBadge status={appt.status} />
    </button>
  );
}
