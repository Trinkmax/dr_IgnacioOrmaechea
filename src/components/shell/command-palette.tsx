"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { CalendarPlus, ClipboardList, Receipt, Search, Sparkles, UserPlus, Wallet } from "lucide-react";
import { Avatar, ColorDot } from "@/components/ui/misc";
import { useOverlay } from "@/components/shell/overlay-store";
import { navFor } from "@/components/shell/nav-config";
import { usePatients } from "@/lib/queries/patients";
import { useTreatments } from "@/lib/queries/catalog";
import { useRole } from "@/lib/queries/session";
import { money } from "@/lib/format";
import { normalize } from "@/lib/utils";

const groupClass =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted";

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink outline-none data-[selected=true]:bg-subtle [&_svg]:size-4 [&_svg]:text-muted";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { open: openOverlay } = useOverlay();
  const { role, isAdmin } = useRole();
  const { data: patients = [] } = usePatients();
  const { data: treatments = [] } = useTreatments();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const q = normalize(query);
  const patientResults = useMemo(() => {
    if (!q) return patients.slice(0, 5);
    const digits = query.replace(/\D/g, "");
    return patients
      .filter((p) => normalize(p.full_name).includes(q) || (digits.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(digits)) || (p.dni ?? "").includes(q))
      .slice(0, 8);
  }, [patients, q, query]);

  const treatmentMatches = q ? treatments.filter((t) => normalize(t.name).includes(q)).slice(0, 5) : [];
  const actions = [
    { label: "Nuevo turno", icon: CalendarPlus, fn: () => openOverlay({ type: "appointment-form" }) },
    { label: "Registrar cobro", icon: Wallet, fn: () => openOverlay({ type: "payment-form" }) },
    { label: "Nuevo paciente", icon: UserPlus, fn: () => openOverlay({ type: "patient-form", initialName: query.trim() || undefined }) },
    { label: "Agregar a Por agendar", icon: ClipboardList, fn: () => openOverlay({ type: "waitlist-form" }) },
    ...(isAdmin
      ? [
          { label: "Nuevo gasto", icon: Receipt, fn: () => openOverlay({ type: "expense-form" }) },
          { label: "Nuevo tratamiento", icon: Sparkles, fn: () => openOverlay({ type: "treatment-form" }) },
        ]
      : []),
  ].filter((a) => !q || normalize(a.label).includes(q));
  const navItems = navFor(role).filter((item) => !q || normalize(item.label).includes(q));

  const run = (fn: () => void) => {
    onOpenChange(false);
    setQuery("");
    window.setTimeout(fn, 60);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (onOpenChange(v), v || setQuery(""))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#1e1916]/35 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-[8vh] z-[61] w-[calc(100vw-1.5rem)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-[22px] border border-line bg-surface shadow-pop data-[state=open]:animate-rise">
          <Dialog.Title className="sr-only">Buscar</Dialog.Title>
          <Dialog.Description className="sr-only">Buscá pacientes, tratamientos o acciones</Dialog.Description>
          <Command shouldFilter={false} label="Buscar" loop>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 shrink-0 text-muted" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Buscar paciente, tratamiento o acción…"
                className="h-14 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
              />
            </div>
            <Command.List className="max-h-[min(60vh,460px)] overflow-y-auto p-2">
              <Command.Empty className="px-4 py-8 text-center text-sm text-muted">Sin resultados para “{query}”</Command.Empty>

              {patientResults.length ? (
                <Command.Group heading="Pacientes" className={groupClass}>
                  {patientResults.map((p) => (
                    <Command.Item key={p.id} value={`patient-${p.id}`} onSelect={() => run(() => openOverlay({ type: "patient", id: p.id }))} className={itemClass}>
                      <Avatar name={p.full_name} size={28} />
                      <span className="min-w-0 flex-1 truncate font-medium">{p.full_name}</span>
                      {p.phone ? <span className="text-xs text-muted">{p.phone}</span> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {treatmentMatches.length ? (
                <Command.Group heading="Tratamientos" className={groupClass}>
                  {treatmentMatches.map((t) => (
                    <Command.Item key={t.id} value={`treatment-${t.id}`} onSelect={() => run(() => openOverlay({ type: "treatment-form", treatmentId: t.id }))} className={itemClass}>
                      <ColorDot color={t.color} />
                      <span className="flex-1 truncate">{t.name}</span>
                      <span className="text-xs tabular-nums text-muted">{money(t.price, t.currency)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {actions.length ? (
                <Command.Group heading="Acciones" className={groupClass}>
                  {actions.map((a) => (
                    <Command.Item key={a.label} value={`action-${a.label}`} onSelect={() => run(a.fn)} className={itemClass}>
                      <a.icon />
                      {a.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {navItems.length ? (
                <Command.Group heading="Ir a" className={groupClass}>
                  {navItems.map((item) => (
                    <Command.Item key={item.href} value={`nav-${item.href}`} onSelect={() => run(() => router.push(item.href))} className={itemClass}>
                      <item.icon />
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
