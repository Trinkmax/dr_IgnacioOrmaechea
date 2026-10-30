"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { TreatmentTag } from "@/components/ui/misc";
import { PatientPicker } from "@/components/ui/patient-picker";
import { SheetBody, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm";
import { useDismiss } from "@/components/shell/overlay-store";
import { usePatientAppointments } from "@/lib/queries/agenda";
import { useSettings } from "@/lib/queries/catalog";
import { useDeletePayment, usePatientPayments, useSavePayment } from "@/lib/queries/money";
import { useRole } from "@/lib/queries/session";
import { getSupabase } from "@/lib/supabase/client";
import { appointmentPaid } from "@/lib/money-helpers";
import { capitalize, fmt, isoDate, money, relativeDay } from "@/lib/format";
import { cn, errorMessage } from "@/lib/utils";
import { METHOD_META, METHOD_ORDER, type Currency, type Payment, type PaymentMethod } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

const CONCEPTS = ["Seña", "Pago parcial", "Saldo", "Pago total", "Consulta"];

export function PaymentFormSheet({ paymentId, patientId, appointmentId }: { paymentId?: string; patientId?: string; appointmentId?: string }) {
  const { data: existing, isLoading } = useQuery({
    queryKey: ["payments", "one", paymentId ?? "none"],
    queryFn: async (): Promise<Payment | null> => {
      const { data, error } = await getSupabase().from("payments").select("*").eq("id", paymentId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(paymentId),
  });
  const { data: settings, isLoading: loadingSettings } = useSettings();
  if ((paymentId && isLoading) || loadingSettings) {
    return (
      <>
        <SheetHeader title={paymentId ? "Editar cobro" : "Registrar cobro"} />
        <SheetBody>
          <div className="skeleton h-72" />
        </SheetBody>
      </>
    );
  }
  return (
    <PaymentForm
      key={existing?.id ?? "new"}
      existing={existing ?? null}
      patientId={patientId}
      appointmentId={appointmentId}
      usdRate={settings?.usd_rate ?? 1}
    />
  );
}

function PaymentForm({
  existing,
  patientId: initialPatientId,
  appointmentId: initialAppointmentId,
  usdRate: currentRate,
}: {
  existing: Payment | null;
  patientId?: string;
  appointmentId?: string;
  usdRate: number;
}) {
  const dismiss = useDismiss();
  const confirm = useConfirm();
  const { isAdmin } = useRole();
  const save = useSavePayment();
  const remove = useDeletePayment();

  const [patientId, setPatientId] = useState<string | null>(existing?.patient_id ?? initialPatientId ?? null);
  const { data: appointments = [], isLoading: loadingAppts } = usePatientAppointments(patientId);
  const { data: patientPayments = [] } = usePatientPayments(patientId);

  const open = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== "cancelado" && a.status !== "ausente" && a.price > 0)
        .map((a) => ({ appt: a, ...appointmentPaid(a) }))
        .filter((x) => x.balance > 0 || x.appt.id === existing?.appointment_id || x.appt.id === initialAppointmentId)
        .sort((a, b) => new Date(a.appt.starts_at).getTime() - new Date(b.appt.starts_at).getTime()),
    [appointments, existing?.appointment_id, initialAppointmentId],
  );

  const [appointmentId, setAppointmentId] = useState<string | null>(existing ? existing.appointment_id : (initialAppointmentId ?? null));
  const [autoPicked, setAutoPicked] = useState(Boolean(existing) || Boolean(initialAppointmentId));
  const [amount, setAmount] = useState<number | null>(existing?.amount ?? null);
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? "ARS");
  const [usdRate, setUsdRate] = useState<number | null>(existing?.usd_rate ?? currentRate);
  const [method, setMethod] = useState<PaymentMethod>(existing?.method ?? "efectivo");
  const [concept, setConcept] = useState(existing?.concept ?? "");
  const [paidOn, setPaidOn] = useState(existing?.paid_on ?? isoDate(new Date()));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const selected = open.find((o) => o.appt.id === appointmentId) ?? null;

  // Al elegir paciente, preseleccionar su próximo saldo pendiente con monto y moneda.
  if (!autoPicked && !loadingAppts && patientId) {
    setAutoPicked(true);
    const first = open[0];
    if (first) {
      setAppointmentId(first.appt.id);
      setCurrency(first.appt.currency);
      setAmount(first.balance);
      setConcept(first.paid > 0 ? "Saldo" : first.appt.treatment?.kind === "cirugia" ? "Seña" : "Pago total");
    }
  }
  // Si vino con turno preseleccionado, completar con su saldo.
  const [prefilled, setPrefilled] = useState(Boolean(existing));
  if (!prefilled && selected) {
    setPrefilled(true);
    setCurrency(selected.appt.currency);
    setAmount(selected.balance);
    setConcept(selected.paid > 0 ? "Saldo" : selected.appt.treatment?.kind === "cirugia" ? "Seña" : "Pago total");
  }

  const pickAppointment = (id: string | null) => {
    setAppointmentId(id);
    const o = open.find((x) => x.appt.id === id);
    if (o && !existing) {
      setCurrency(o.appt.currency);
      setAmount(o.balance);
      setConcept(o.paid > 0 ? "Saldo" : o.appt.treatment?.kind === "cirugia" ? "Seña" : "Pago total");
    }
  };

  const rate = usdRate && usdRate > 0 ? usdRate : currentRate;
  const equivalence =
    amount && selected && selected.appt.currency !== currency
      ? currency === "USD"
        ? money(amount * rate, "ARS")
        : money(amount / rate, "USD")
      : amount && currency === "USD"
        ? money(amount * rate, "ARS")
        : null;

  const remaining = selected
    ? Math.max(0, selected.balance - (amount ? (selected.appt.currency === currency ? amount : currency === "USD" ? amount * rate : amount / rate) : 0))
    : null;

  const submit = async () => {
    setError(null);
    if (!patientId) return setError("Elegí el paciente.");
    if (!amount || amount <= 0) return setError("Ingresá el monto cobrado.");
    if (!rate || rate <= 0) return setError("Revisá la cotización del dólar.");
    try {
      await save.mutateAsync({
        id: existing?.id,
        values: {
          patient_id: patientId,
          appointment_id: appointmentId,
          amount,
          currency,
          usd_rate: rate,
          method,
          concept: concept.trim() || null,
          paid_on: paidOn,
          notes: notes.trim() || null,
        },
      });
      toast.success(existing ? "Cobro actualizado" : `Cobro registrado · ${money(amount, currency)}`, {
        description: remaining != null && !existing ? (remaining > 0.009 ? `Queda un saldo de ${money(remaining, selected!.appt.currency)}` : "¡Saldo cancelado!") : undefined,
      });
      dismiss();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: "¿Anular este cobro?",
      description: `${money(existing.amount, existing.currency)} del ${fmt(existing.paid_on, "d 'de' MMMM")}. El saldo del paciente vuelve a quedar pendiente.`,
      confirmLabel: "Anular cobro",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success("Cobro anulado");
      dismiss();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const lastPayment = patientPayments[0];

  return (
    <>
      <SheetHeader title={existing ? "Editar cobro" : "Registrar cobro"} subtitle={existing ? capitalize(fmt(existing.paid_on, "EEEE d 'de' MMMM")) : "Ingreso de dinero de un paciente"} />
      <SheetBody className="space-y-5">
        <Field label="Paciente">
          <PatientPicker
            value={patientId}
            onChange={(p) => {
              setPatientId(p?.id ?? null);
              setAppointmentId(null);
              setAutoPicked(false);
            }}
            autoFocus={!patientId}
          />
        </Field>

        {patientId ? (
          <Field label="¿A qué corresponde?">
            {loadingAppts ? (
              <div className="skeleton h-16" />
            ) : (
              <div className="space-y-2">
                {open.map(({ appt, balance, price }) => (
                  <button
                    key={appt.id}
                    type="button"
                    onClick={() => pickAppointment(appt.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow]",
                      appointmentId === appt.id ? "border-accent bg-accent-soft/50 ring-4 ring-accent/10" : "border-line bg-surface hover:border-line-strong",
                    )}
                  >
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", appointmentId === appt.id ? "border-accent" : "border-line-strong")}>
                      {appointmentId === appt.id ? <span className="size-2 rounded-full bg-accent" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      {appt.treatment ? <TreatmentTag name={appt.treatment.name} color={appt.treatment.color} /> : <span className="text-sm font-medium">Turno</span>}
                      <span className="mt-1 block text-xs text-muted">
                        {capitalize(relativeDay(appt.starts_at))} · total {money(price, appt.currency)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[11px] text-muted">Saldo</span>
                      <span className="text-sm font-semibold tabular-nums text-danger">{money(balance, appt.currency)}</span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => pickAppointment(null)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    appointmentId === null ? "border-accent bg-accent-soft/50" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                  )}
                >
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", appointmentId === null ? "border-accent" : "border-line-strong")}>
                    {appointmentId === null ? <span className="size-2 rounded-full bg-accent" /> : null}
                  </span>
                  Sin turno asociado (pago a cuenta, producto, etc.)
                </button>
              </div>
            )}
          </Field>
        ) : null}

        <Field
          label="Monto"
          aside={
            selected && !existing ? (
              <span className="flex gap-1">
                <QuickAmount onClick={() => (setCurrency(selected.appt.currency), setAmount(selected.balance))}>Saldo</QuickAmount>
                <QuickAmount onClick={() => (setCurrency(selected.appt.currency), setAmount(Math.round(selected.balance / 2)))}>50%</QuickAmount>
              </span>
            ) : null
          }
        >
          <MoneyInput size="lg" value={amount} onChange={setAmount} currency={currency} onCurrencyChange={setCurrency} autoFocus={Boolean(patientId) && !existing} />
        </Field>

        {currency === "USD" || (selected && selected.appt.currency !== currency) ? (
          <div className="flex items-center gap-3 rounded-xl bg-subtle px-3 py-2.5">
            <span className="text-[13px] text-ink-2">Cotización del dólar</span>
            <div className="ml-auto w-36">
              <MoneyInput value={usdRate} onChange={setUsdRate} currency="ARS" className="h-9" />
            </div>
          </div>
        ) : null}
        {equivalence ? <p className="-mt-3 text-right text-xs text-muted">Equivale a {equivalence}</p> : null}

        <Field label="Medio de pago">
          <div className="grid grid-cols-3 gap-1.5">
            {METHOD_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  "h-10 rounded-xl border text-[13px] font-medium transition-colors",
                  method === m ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                )}
              >
                {METHOD_META[m].label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Concepto">
            <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Seña, saldo…" list="payment-concepts" />
            <datalist id="payment-concepts">
              {CONCEPTS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Fecha de cobro">
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>

        <Field label="Notas">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nº de operación, quién pagó, etc." />
        </Field>

        {lastPayment && !existing ? (
          <p className="text-xs text-muted">
            Último cobro de este paciente: {money(lastPayment.amount, lastPayment.currency)} el {fmt(lastPayment.paid_on, "d MMM")}
          </p>
        ) : null}
        {!isAdmin && !existing ? <p className="text-xs text-muted">Una vez registrado, solo el Dr. puede modificarlo o anularlo.</p> : null}
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
      </SheetBody>
      <SheetFooter>
        {existing && isAdmin ? (
          <Button variant="danger-ghost" size="icon" aria-label="Anular cobro" onClick={onDelete}>
            <Trash2 className="size-[18px]" />
          </Button>
        ) : (
          <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
            Cancelar
          </Button>
        )}
        <Button size="lg" variant="success" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={save.isPending}>
          {existing ? "Guardar cambios" : amount ? `Cobrar ${money(amount, currency)}` : "Registrar cobro"}
        </Button>
      </SheetFooter>
    </>
  );
}

function QuickAmount({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-6 rounded-md bg-sunken px-2 text-[11px] font-semibold text-ink-2 transition-colors hover:bg-line">
      {children}
    </button>
  );
}
