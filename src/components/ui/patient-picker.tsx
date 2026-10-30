"use client";

import { useMemo, useState } from "react";
import { Phone, Plus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { usePatients, useSavePatient } from "@/lib/queries/patients";
import { cn, errorMessage, normalize } from "@/lib/utils";
import type { Patient } from "@/lib/types";

/** Buscador de pacientes con alta rápida (nombre + teléfono) sin salir del formulario. */
export function PatientPicker({
  value,
  onChange,
  autoFocus,
}: {
  value: string | null;
  onChange: (patient: Patient | null) => void;
  autoFocus?: boolean;
}) {
  const { data: patients = [], isLoading } = usePatients();
  const savePatient = useSavePatient();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  const selected = useMemo(() => patients.find((p) => p.id === value) ?? null, [patients, value]);

  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return patients.slice(0, 6);
    const digits = query.replace(/\D/g, "");
    return patients
      .filter((p) => normalize(p.full_name).includes(q) || (digits.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(digits)) || (p.dni ?? "").includes(q))
      .slice(0, 8);
  }, [patients, query]);

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-subtle px-3 py-2.5">
        <Avatar name={selected.full_name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{selected.full_name}</p>
          <p className="truncate text-xs text-muted">{selected.phone || "Sin teléfono"}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          Cambiar
        </Button>
      </div>
    );
  }

  const createPatient = async () => {
    const name = query.trim().replace(/\s+/g, " ");
    if (name.length < 2) return;
    try {
      const patient = await savePatient.mutateAsync({ values: { full_name: name, phone: newPhone.trim() || null } });
      toast.success(`${patient.full_name} agregado a pacientes`);
      setCreating(false);
      setQuery("");
      setNewPhone("");
      onChange(patient);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const trimmed = query.trim();
  const showCreate = trimmed.length >= 2;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setCreating(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[active]) onChange(results[active]);
              else if (showCreate) setCreating(true);
            }
          }}
          placeholder="Buscar por nombre, teléfono o DNI"
          className={cn(controlClass, "h-11 pl-10")}
          aria-label="Buscar paciente"
        />
      </div>

      {creating ? (
        <div className="animate-rise rounded-xl border border-accent/30 bg-accent-soft/50 p-3">
          <p className="text-[13px] font-medium text-ink">
            Nuevo paciente: <span className="font-semibold">{trimmed}</span>
          </p>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                autoFocus
                inputMode="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createPatient())}
                placeholder="Celular (opcional)"
                className={cn(controlClass, "h-10 pl-9")}
              />
            </div>
            <Button onClick={createPatient} loading={savePatient.isPending}>
              Crear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {isLoading ? (
          <p className="px-3 py-3 text-sm text-muted">Cargando pacientes…</p>
        ) : results.length === 0 && !showCreate ? (
          <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted">
            <UserRound className="size-4" /> Escribí el nombre para buscar o crear.
          </p>
        ) : null}
        <ul role="listbox" className="divide-y divide-line/70">
          {results.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => onChange(p)}
                className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors", i === active ? "bg-subtle" : "hover:bg-subtle")}
              >
                <Avatar name={p.full_name} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{p.full_name}</span>
                  {p.phone ? <span className="block truncate text-xs text-muted">{p.phone}</span> : null}
                </span>
              </button>
            </li>
          ))}
          {showCreate && !creating ? (
            <li>
              <button
                type="button"
                onMouseEnter={() => setActive(results.length)}
                onClick={() => setCreating(true)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium text-accent-ink transition-colors",
                  active === results.length ? "bg-accent-soft/60" : "hover:bg-accent-soft/60",
                )}
              >
                <span className="flex size-[30px] items-center justify-center rounded-full bg-accent-soft">
                  <Plus className="size-4" />
                </span>
                Crear paciente “{trimmed}”
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
