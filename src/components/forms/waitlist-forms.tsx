"use client";

import { useState } from "react";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { EmptyState, TreatmentTag } from "@/components/ui/misc";
import { PatientPicker } from "@/components/ui/patient-picker";
import { SheetBody, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { useDismiss, useOverlay } from "@/components/shell/overlay-store";
import { useAddToWaitlist, useRemoveFromWaitlist, useWaitlist } from "@/lib/queries/agenda";
import { useTreatments } from "@/lib/queries/catalog";
import { useIsDesktop } from "@/lib/hooks";
import { money, since } from "@/lib/format";
import { errorMessage } from "@/lib/utils";
import { KIND_META, type TreatmentKind, type WaitlistWithRefs } from "@/lib/types";
import { usePlacement } from "@/components/agenda/placement";

export function WaitlistFormSheet({ patientId: initialPatient }: { patientId?: string }) {
  const dismiss = useDismiss();
  const { data: treatments = [] } = useTreatments();
  const add = useAddToWaitlist();
  const [patientId, setPatientId] = useState<string | null>(initialPatient ?? null);
  const [treatmentId, setTreatmentId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!patientId) return setError("Elegí el paciente.");
    try {
      await add.mutateAsync({ patient_id: patientId, treatment_id: treatmentId || null, notes: notes.trim() || null });
      toast.success("Agregado a Por agendar", { description: "Arrastralo al calendario cuando tengas la fecha." });
      dismiss();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <SheetHeader title="Agregar a Por agendar" subtitle="Pacientes que esperan fecha (ej.: cirugía a coordinar)" />
      <SheetBody className="space-y-5">
        <Field label="Paciente">
          <PatientPicker value={patientId} onChange={(p) => setPatientId(p?.id ?? null)} autoFocus={!patientId} />
        </Field>
        <Field label="Tratamiento">
          <Select value={treatmentId} onChange={(e) => setTreatmentId(e.target.value)}>
            <option value="">A definir</option>
            {(["cirugia", "procedimiento", "consulta"] as TreatmentKind[]).map((kind) => (
              <optgroup key={kind} label={KIND_META[kind].plural}>
                {treatments
                  .filter((t) => t.kind === kind && t.active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Notas">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej.: prefiere viernes, espera resultado de estudios, quiere operarse en marzo" />
        </Field>
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
          Cancelar
        </Button>
        <Button size="lg" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={add.isPending}>
          Agregar
        </Button>
      </SheetFooter>
    </>
  );
}

/** Lista "Por agendar" en mobile: tocar un paciente activa el modo "tocá un horario". */
export function WaitlistSheet() {
  const { data: items = [], isLoading } = useWaitlist();
  const { push, close } = useOverlay();
  const { start } = usePlacement();
  const isDesktop = useIsDesktop();
  const remove = useRemoveFromWaitlist();

  const place = (item: WaitlistWithRefs) => {
    start(item);
    close();
    if (!isDesktop) toast("Tocá un horario libre en la agenda", { description: `Para agendar a ${item.patient?.full_name ?? "este paciente"}` });
  };

  return (
    <>
      <SheetHeader title="Por agendar" subtitle={items.length ? `${items.length} pacientes esperando fecha` : "Pacientes esperando fecha"} />
      <SheetBody>
        {isLoading ? (
          <div className="skeleton h-40" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ClipboardList />}
            title="Nadie esperando fecha"
            description="Cuando un paciente quiere operarse pero todavía no hay fecha, sumalo acá y después lo ubicás en la agenda."
          />
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <button type="button" onClick={() => place(item)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-ink">{item.patient?.full_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {item.treatment ? <TreatmentTag name={item.treatment.name} color={item.treatment.color} /> : <span className="text-xs text-muted">Tratamiento a definir</span>}
                    <span className="text-[11px] text-faint">{since(item.created_at)}</span>
                  </div>
                  {item.notes ? <p className="mt-1.5 line-clamp-2 text-xs text-ink-2">{item.notes}</p> : null}
                  {item.treatment ? <p className="mt-1 text-xs text-muted">{money(item.treatment.price, item.treatment.currency)}</p> : null}
                </button>
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" onClick={() => place(item)}>
                    Agendar
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Quitar de la lista" onClick={() => remove.mutate(item.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetBody>
      <SheetFooter>
        <Button size="lg" variant="secondary" className="w-full" onClick={() => push({ type: "waitlist-form" })}>
          <Plus className="size-4" />
          Agregar paciente
        </Button>
      </SheetFooter>
    </>
  );
}
