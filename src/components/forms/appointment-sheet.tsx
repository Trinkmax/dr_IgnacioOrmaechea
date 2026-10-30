"use client";

import { differenceInMinutes } from "date-fns";
import { CalendarX2, Copy, MessageCircle, Pencil, Phone, Trash2, UserRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Progress, StatusBadge } from "@/components/ui/misc";
import { SheetBody, SheetFooter, SheetHeader, SheetSection } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm";
import { useDismiss, useOverlay } from "@/components/shell/overlay-store";
import { useAppointment, useCreateAppointment, useDeleteAppointment, useUpdateAppointment } from "@/lib/queries/agenda";
import { useSettings, useTreatments } from "@/lib/queries/catalog";
import { useRole } from "@/lib/queries/session";
import { appointmentPaid } from "@/lib/money-helpers";
import { capitalize, durationLabel, fmt, money, time } from "@/lib/format";
import { colorVars } from "@/lib/colors";
import { cn, errorMessage, firstName, telLink, whatsappLink } from "@/lib/utils";
import { STATUS_META, STATUS_ORDER, type AppointmentStatus, type CalendarAppointment, type Settings } from "@/lib/types";

export function reminderText(appt: CalendarAppointment, settings: Settings | undefined) {
  const template =
    settings?.reminder_template ??
    "Hola {nombre}! Te recordamos tu turno del {fecha} a las {hora} ({tratamiento}). ¿Nos confirmás tu asistencia?";
  return template
    .replaceAll("{nombre}", firstName(appt.patient?.full_name))
    .replaceAll("{fecha}", fmt(appt.starts_at, "EEEE d 'de' MMMM"))
    .replaceAll("{hora}", time(appt.starts_at))
    .replaceAll("{tratamiento}", appt.treatment?.name ?? "consulta");
}

export function AppointmentSheet({ id }: { id: string }) {
  const { data: appt, isLoading } = useAppointment(id);
  const { data: settings } = useSettings();
  const { data: treatments = [] } = useTreatments();
  const { isAdmin } = useRole();
  const { push } = useOverlay();
  const dismiss = useDismiss();
  const confirm = useConfirm();
  const update = useUpdateAppointment();
  const remove = useDeleteAppointment();
  const create = useCreateAppointment();

  if (!appt) {
    return (
      <>
        <SheetHeader title={isLoading ? "Cargando turno…" : "Turno no encontrado"} />
        <SheetBody>
          {isLoading ? <div className="skeleton h-48" /> : <p className="text-sm text-muted">Puede que se haya eliminado.</p>}
        </SheetBody>
      </>
    );
  }

  const isBlock = !appt.patient_id;
  const minutes = differenceInMinutes(new Date(appt.ends_at), new Date(appt.starts_at));
  const money_ = appointmentPaid(appt);
  const wa = whatsappLink(appt.patient?.phone, reminderText(appt, settings));
  const tel = telLink(appt.patient?.phone);

  const setStatus = async (status: AppointmentStatus) => {
    if (status === appt.status) return;
    const previous = appt.status;
    try {
      await update.mutateAsync({ id: appt.id, patch: { status } });
      const treatment = treatments.find((t) => t.id === appt.treatment_id);
      const payables = treatment?.costs.filter((c) => c.supplier_id && c.amount > 0).length ?? 0;
      const description =
        status === "atendido" && isAdmin && settings?.auto_payables && payables > 0
          ? `Se generaron ${payables} pagos pendientes a proveedores.`
          : undefined;
      toast.success(`Marcado como ${STATUS_META[status].label.toLowerCase()}`, {
        description,
        action: { label: "Deshacer", onClick: () => update.mutate({ id: appt.id, patch: { status: previous } }) },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: isBlock ? "¿Quitar este bloqueo?" : "¿Eliminar este turno?",
      description: isBlock
        ? "El horario vuelve a quedar libre."
        : money_.paid > 0
          ? "Los cobros registrados se conservan, pero quedan sin turno asociado. Si el paciente no viene, mejor marcalo como Cancelado."
          : "Si el paciente avisó que no viene, podés marcarlo como Cancelado para conservar el historial.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const snapshot = appt;
    try {
      await remove.mutateAsync(appt.id);
      dismiss();
      toast("Turno eliminado", {
        action: {
          label: "Deshacer",
          onClick: () =>
            create.mutate({
              patient_id: snapshot.patient_id,
              treatment_id: snapshot.treatment_id,
              title: snapshot.title,
              starts_at: snapshot.starts_at,
              ends_at: snapshot.ends_at,
              status: snapshot.status,
              price: snapshot.price,
              currency: snapshot.currency,
              notes: snapshot.notes,
            }),
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <SheetHeader
        title={isBlock ? appt.title : (appt.patient?.full_name ?? "Turno")}
        subtitle={isBlock ? "Horario bloqueado" : (appt.treatment?.name ?? "Sin tratamiento definido")}
        leading={!isBlock ? <Avatar name={appt.patient?.full_name} size={40} className="mt-0.5" /> : null}
      />
      <SheetBody>
        <div style={colorVars(appt.treatment?.color ?? "stone")} className="relative overflow-hidden rounded-2xl border border-[var(--tc-ring)] bg-[var(--tc-soft)] p-4">
          <div className="absolute inset-y-0 left-0 w-1 bg-[var(--tc)]" aria-hidden />
          <p className="text-[13px] font-medium text-[var(--tc-ink)]">{capitalize(fmt(appt.starts_at, "EEEE d 'de' MMMM"))}</p>
          <p className="mt-1 font-display text-[28px] leading-none tracking-[-0.03em] text-ink tabular-nums">
            {time(appt.starts_at)} <span className="text-[var(--tc-ink)]/60">–</span> {time(appt.ends_at)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-ink-2">{durationLabel(minutes)}</span>
            {!isBlock ? <StatusBadge status={appt.status} className="bg-white/70" /> : null}
          </div>
        </div>

        {!isBlock ? (
          <>
            <SheetSection title="Estado">
              <div className="grid grid-cols-3 gap-1.5">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      "h-10 rounded-xl border text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]",
                      appt.status === s
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-subtle",
                    )}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </SheetSection>

            <SheetSection title="Contacto">
              <div className="grid grid-cols-3 gap-2">
                <a
                  href={wa ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!wa}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-medium transition-[transform,background-color] active:scale-[0.97]",
                    wa ? "bg-[#e7f6ec] text-[#1d6b3c] hover:bg-[#dcf1e4]" : "pointer-events-none bg-sunken text-faint",
                  )}
                >
                  <MessageCircle className="size-5" />
                  Recordatorio
                </a>
                <a
                  href={tel ?? undefined}
                  aria-disabled={!tel}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-medium transition-[transform,background-color] active:scale-[0.97]",
                    tel ? "bg-sunken text-ink-2 hover:bg-line" : "pointer-events-none bg-sunken text-faint",
                  )}
                >
                  <Phone className="size-5" />
                  Llamar
                </a>
                <button
                  type="button"
                  onClick={() => appt.patient_id && push({ type: "patient", id: appt.patient_id })}
                  className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-sunken text-xs font-medium text-ink-2 transition-[transform,background-color] hover:bg-line active:scale-[0.97]"
                >
                  <UserRound className="size-5" />
                  Ficha
                </button>
              </div>
              {!appt.patient?.phone ? <p className="mt-2 text-xs text-muted">Cargá el celular del paciente para enviarle recordatorios por WhatsApp.</p> : null}
            </SheetSection>

            <SheetSection title="Cobro">
              <div className="rounded-2xl border border-line bg-surface p-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Precio</p>
                    <p className="mt-1 text-[15px] font-semibold tabular-nums text-ink">{money(money_.price, appt.currency)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Pagado</p>
                    <p className="mt-1 text-[15px] font-semibold tabular-nums text-success">{money(money_.paid, appt.currency)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Saldo</p>
                    <p className={cn("mt-1 text-[15px] font-semibold tabular-nums", money_.balance > 0 ? "text-danger" : "text-ink")}>
                      {money(money_.balance, appt.currency)}
                    </p>
                  </div>
                </div>
                {money_.price > 0 ? <Progress value={money_.ratio * 100} className="mt-3" /> : null}
                {money_.balance > 0 || money_.price === 0 ? (
                  <Button
                    variant="soft"
                    className="mt-3 w-full"
                    onClick={() => push({ type: "payment-form", patientId: appt.patient_id!, appointmentId: appt.id })}
                  >
                    <Wallet className="size-4" />
                    Registrar cobro
                  </Button>
                ) : (
                  <p className="mt-3 text-center text-[13px] font-medium text-success">Pagado en su totalidad ✓</p>
                )}
              </div>
            </SheetSection>
          </>
        ) : null}

        {appt.notes ? (
          <SheetSection title="Notas">
            <p className="whitespace-pre-wrap rounded-2xl bg-subtle px-4 py-3 text-sm leading-relaxed text-ink-2">{appt.notes}</p>
          </SheetSection>
        ) : null}

        <p className="mt-6 text-center text-xs text-faint">Creado {capitalize(fmt(appt.created_at, "d MMM yyyy, HH:mm"))}</p>
      </SheetBody>
      <SheetFooter>
        <Button variant="danger-ghost" size="icon" aria-label="Eliminar" onClick={onDelete} loading={remove.isPending}>
          {!remove.isPending ? <Trash2 className="size-[18px]" /> : null}
        </Button>
        {!isBlock && appt.status !== "cancelado" ? (
          <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => setStatus("cancelado")}>
            <CalendarX2 className="size-4" />
            Cancelar turno
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="icon"
          aria-label="Duplicar"
          title="Duplicar (agendar otro igual)"
          onClick={() =>
            push({
              type: "appointment-form",
              defaults: {
                patientId: appt.patient_id ?? undefined,
                treatmentId: appt.treatment_id ?? undefined,
                durationMin: minutes,
                block: isBlock,
              },
            })
          }
        >
          <Copy className="size-[18px]" />
        </Button>
        <Button className="ml-auto flex-1 sm:flex-none sm:px-6" size="lg" onClick={() => push({ type: "appointment-form", appointmentId: appt.id })}>
          <Pencil className="size-4" />
          Editar
        </Button>
      </SheetFooter>
    </>
  );
}
