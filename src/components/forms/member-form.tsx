"use client";

import { useState } from "react";
import { Eye, EyeOff, RefreshCw, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SheetBody, SheetFooter, SheetHeader } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm";
import { useDismiss } from "@/components/shell/overlay-store";
import { useMembers, useTeamMutation } from "@/lib/queries/catalog";
import { useMe } from "@/lib/queries/session";
import { cn, errorMessage } from "@/lib/utils";
import type { Member, Role } from "@/lib/types";

function suggestPassword() {
  const words = ["Bisturi", "Sutura", "Quirofano", "Consulta", "Agenda", "Clinica", "Turno", "Dermis"];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}-${Math.floor(1000 + Math.random() * 9000)}`;
}

const ROLES: { value: Role; title: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "asistente",
    title: "Secretaría / asistente",
    description: "Agenda, pacientes, por agendar y registro de cobros. No ve costos, gastos ni ganancias.",
    icon: <UserRound className="size-5" />,
  },
  {
    value: "admin",
    title: "Administrador",
    description: "Acceso total: finanzas, costos, proveedores, configuración y equipo.",
    icon: <ShieldCheck className="size-5" />,
  },
];

export function MemberFormSheet({ userId }: { userId?: string }) {
  const { data: members = [], isLoading } = useMembers();
  const existing = members.find((m) => m.user_id === userId) ?? null;
  if (userId && isLoading) {
    return (
      <>
        <SheetHeader title="Equipo" />
        <SheetBody>
          <div className="skeleton h-64" />
        </SheetBody>
      </>
    );
  }
  return <MemberForm key={existing?.user_id ?? "new"} existing={existing} />;
}

function MemberForm({ existing }: { existing: Member | null }) {
  const dismiss = useDismiss();
  const confirm = useConfirm();
  const { data: me } = useMe();
  const team = useTeamMutation();
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState(existing ? "" : suggestPassword());
  const [showPassword, setShowPassword] = useState(!existing);
  const [role, setRole] = useState<Role>(existing?.role ?? "asistente");
  const [error, setError] = useState<string | null>(null);
  const isSelf = existing?.user_id === me?.userId;

  const submit = async () => {
    setError(null);
    try {
      if (existing) {
        await team.mutateAsync({
          action: "update",
          userId: existing.user_id,
          fullName: fullName.trim(),
          role: isSelf ? undefined : role,
          password: password ? password : undefined,
        });
        toast.success("Cambios guardados", { description: password ? "Avisale la nueva contraseña." : undefined });
      } else {
        await team.mutateAsync({ action: "create", fullName: fullName.trim(), email: email.trim(), password, role });
        toast.success(`${fullName.trim()} ya puede ingresar`, { description: `Usuario: ${email.trim()} · Contraseña: ${password}`, duration: 12000 });
      }
      dismiss();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onRemove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `¿Quitar el acceso a ${existing.full_name}?`,
      description: "Ya no va a poder ingresar al sistema. Lo que cargó (turnos, cobros) se conserva.",
      confirmLabel: "Quitar acceso",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await team.mutateAsync({ action: "remove", userId: existing.user_id });
      toast.success("Acceso quitado");
      dismiss();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <SheetHeader title={existing ? existing.full_name : "Sumar al equipo"} subtitle={existing ? existing.email : "Creá el acceso y compartile los datos"} />
      <SheetBody className="space-y-5">
        <Field label="Nombre">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej.: Laura Fernández" autoFocus={!existing} />
        </Field>
        {!existing ? (
          <Field label="Email (usuario para ingresar)">
            <Input type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="secretaria@consultorio.com" />
          </Field>
        ) : null}
        <Field
          label={existing ? "Nueva contraseña (opcional)" : "Contraseña inicial"}
          hint={existing ? "Dejalo vacío para no cambiarla." : "Mínimo 8 caracteres. Puede cambiarla después desde Ajustes."}
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ocultar" : "Mostrar"} className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-sunken">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button variant="secondary" size="icon" aria-label="Generar contraseña" onClick={() => (setPassword(suggestPassword()), setShowPassword(true))}>
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </Field>
        <Field label="Permisos">
          <div className="space-y-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                disabled={isSelf}
                onClick={() => setRole(r.value)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-[border-color,background-color] disabled:opacity-60",
                  role === r.value ? "border-accent bg-accent-soft/50 ring-4 ring-accent/10" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", role === r.value ? "bg-accent text-white" : "bg-sunken text-ink-2")}>{r.icon}</span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{r.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{r.description}</span>
                </span>
              </button>
            ))}
            {isSelf ? <p className="text-xs text-muted">No podés cambiar tu propio rol.</p> : null}
          </div>
        </Field>
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}
      </SheetBody>
      <SheetFooter>
        {existing && !isSelf ? (
          <Button variant="danger-ghost" size="icon" aria-label="Quitar acceso" onClick={onRemove}>
            <Trash2 className="size-[18px]" />
          </Button>
        ) : (
          <Button variant="secondary" size="lg" className="flex-1 md:flex-none" onClick={dismiss}>
            Cancelar
          </Button>
        )}
        <Button size="lg" className="flex-[2] md:ml-auto md:flex-none md:px-8" onClick={submit} loading={team.isPending}>
          {existing ? "Guardar" : "Crear acceso"}
        </Button>
      </SheetFooter>
    </>
  );
}
