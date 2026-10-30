"use client";

import { useState } from "react";
import { DollarSign, KeyRound, LogOut, Plus, ShieldCheck, UserRound, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Avatar, Badge, Card, PageHeader, SectionTitle, Segmented, Switch } from "@/components/ui/misc";
import { useOverlay } from "@/components/shell/overlay-store";
import { useMembers, useSettings, useTeamMutation, useUpdateSettings } from "@/lib/queries/catalog";
import { useMe, useRole, useSignOut } from "@/lib/queries/session";
import { getSupabase } from "@/lib/supabase/client";
import { money, since } from "@/lib/format";
import { cn, errorMessage } from "@/lib/utils";
import type { Settings } from "@/lib/types";

type Tab = "consultorio" | "equipo" | "cuenta";

export function SettingsView() {
  const { isAdmin } = useRole();
  const [tab, setTab] = useState<Tab>(isAdmin ? "consultorio" : "cuenta");
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="Ajustes" subtitle={isAdmin ? "Configuración del consultorio, equipo y tu cuenta" : "Tu cuenta"} />
      {isAdmin ? (
        <Segmented
          className="mt-6"
          value={tab}
          onChange={setTab}
          options={[
            { value: "consultorio", label: "Consultorio" },
            { value: "equipo", label: "Equipo" },
            { value: "cuenta", label: "Mi cuenta" },
          ]}
        />
      ) : null}
      <div className="mt-5">
        {tab === "consultorio" && isAdmin ? <ClinicSettings /> : null}
        {tab === "equipo" && isAdmin ? <TeamSettings /> : null}
        {tab === "cuenta" || !isAdmin ? <AccountSettings /> : null}
      </div>
    </div>
  );
}

function ClinicSettings() {
  const { data: settings } = useSettings();
  if (!settings) return <div className="skeleton h-96 rounded-card" />;
  return <ClinicForm key={settings.updated_at} settings={settings} />;
}

function ClinicForm({ settings }: { settings: Settings }) {
  const update = useUpdateSettings();
  const [form, setForm] = useState({
    clinic_name: settings.clinic_name,
    clinic_tagline: settings.clinic_tagline,
    usd_rate: Number(settings.usd_rate) as number | null,
    day_start: settings.day_start,
    day_end: settings.day_end,
    monthly_hours: Number(settings.monthly_hours),
    tax_percent: Number(settings.tax_percent),
    auto_payables: settings.auto_payables,
    reminder_template: settings.reminder_template,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.usd_rate || form.usd_rate <= 0) return toast.error("Ingresá una cotización válida.");
    if (form.day_end <= form.day_start) return toast.error("El horario de cierre tiene que ser posterior al de apertura.");
    try {
      await update.mutateAsync({
        ...form,
        usd_rate: form.usd_rate,
        usd_rate_updated_at: form.usd_rate !== Number(settings.usd_rate) ? new Date().toISOString() : settings.usd_rate_updated_at,
      });
      toast.success("Configuración guardada");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const preview = form.reminder_template
    .replaceAll("{nombre}", "María")
    .replaceAll("{fecha}", "jueves 6 de noviembre")
    .replaceAll("{hora}", "10:30")
    .replaceAll("{tratamiento}", "Consulta inicial");

  const hours = Array.from({ length: 25 }, (_, h) => h);

  return (
    <div className="space-y-5">
      <Card className="p-4 md:p-6">
        <SectionTitle title="Cotización del dólar" subtitle={`Se usa para pasar a pesos lo que está en USD. Actualizada ${since(settings.usd_rate_updated_at)}.`} />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Pesos por dólar" className="sm:w-64">
            <MoneyInput value={form.usd_rate} onChange={(v) => set("usd_rate", v)} currency="ARS" />
          </Field>
          <p className="flex items-center gap-1.5 pb-3 text-xs text-muted">
            <DollarSign className="size-3.5" /> US$ 1.000 = {money((form.usd_rate ?? 0) * 1000)}
          </p>
        </div>
      </Card>

      <Card className="p-4 md:p-6">
        <SectionTitle title="Consultorio" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <Input value={form.clinic_name} onChange={(e) => set("clinic_name", e.target.value)} />
          </Field>
          <Field label="Especialidad / subtítulo">
            <Input value={form.clinic_tagline} onChange={(e) => set("clinic_tagline", e.target.value)} />
          </Field>
          <Field label="Agenda: desde">
            <Select value={form.day_start} onChange={(e) => set("day_start", Number(e.target.value))}>
              {hours.slice(0, 23).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Agenda: hasta">
            <Select value={form.day_end} onChange={(e) => set("day_end", Number(e.target.value))}>
              {hours.slice(1).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-4 md:p-6">
        <SectionTitle title="Costos" subtitle="Valores que usa la calculadora para la rentabilidad" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Horas de trabajo por mes" hint="Para repartir los gastos fijos por hora">
            <Input type="number" inputMode="numeric" min={1} value={form.monthly_hours} onChange={(e) => set("monthly_hours", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Impuestos y comisiones (%)" hint="Sobre el precio de venta">
            <Input type="number" inputMode="decimal" min={0} max={90} step={0.5} value={form.tax_percent} onChange={(e) => set("tax_percent", Number(e.target.value) || 0)} />
          </Field>
        </div>
        <div className="mt-5 flex items-start justify-between gap-4 rounded-2xl border border-line bg-subtle p-4">
          <div className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
              <Zap className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Cuentas por pagar automáticas</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Al marcar una cirugía como atendida, se crean los pagos pendientes a quirófano, anestesista, ayudantes e implantes según la estructura de costos del tratamiento.
              </p>
            </div>
          </div>
          <Switch checked={form.auto_payables} onChange={(v) => set("auto_payables", v)} label="Cuentas por pagar automáticas" />
        </div>
      </Card>

      <Card className="p-4 md:p-6">
        <SectionTitle title="Recordatorio por WhatsApp" subtitle="Mensaje que se arma al tocar “Recordatorio” en un turno" />
        <Textarea className="mt-4" rows={4} value={form.reminder_template} onChange={(e) => set("reminder_template", e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["{nombre}", "{fecha}", "{hora}", "{tratamiento}"].map((v) => (
            <button key={v} type="button" onClick={() => set("reminder_template", `${form.reminder_template} ${v}`)} className="h-7 rounded-lg bg-sunken px-2 font-mono text-[11px] text-ink-2 hover:bg-line">
              {v}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-2xl rounded-tl-md bg-[#e7f6ec] px-4 py-3 text-sm leading-relaxed text-[#1d3b29]">{preview}</div>
      </Card>

      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 flex justify-end md:bottom-6">
        <Button size="lg" onClick={save} loading={update.isPending} className="shadow-lift">
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}

function TeamSettings() {
  const { data: members = [], isLoading } = useMembers();
  const { data: me } = useMe();
  const { open } = useOverlay();
  return (
    <Card className="overflow-hidden">
      <div className="flex items-end justify-between gap-3 border-b border-line px-4 py-4 md:px-6">
        <SectionTitle title="Equipo" subtitle="Quiénes pueden entrar al sistema y qué pueden ver" />
        <Button size="sm" onClick={() => open({ type: "member-form" })}>
          <Plus className="size-3.5" /> Sumar persona
        </Button>
      </div>
      {isLoading ? (
        <div className="skeleton m-4 h-24" />
      ) : (
        <ul className="divide-y divide-line/70">
          {members.map((m) => (
            <li key={m.user_id}>
              <button type="button" onClick={() => open({ type: "member-form", userId: m.user_id })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-subtle md:px-6">
                <Avatar name={m.full_name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {m.full_name} {m.user_id === me?.userId ? <span className="font-normal text-muted">(vos)</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted">{m.email}</span>
                </span>
                <Badge tone={m.role === "admin" ? "dark" : "neutral"}>
                  {m.role === "admin" ? <ShieldCheck className="size-3" /> : <UserRound className="size-3" />}
                  {m.role === "admin" ? "Administrador" : "Secretaría"}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line bg-subtle px-4 py-3 text-xs leading-relaxed text-muted md:px-6">
        La secretaría maneja agenda, pacientes y cobros, pero no ve costos, gastos, proveedores ni ganancias. Los cobros que registra solo los puede modificar un administrador.
      </p>
    </Card>
  );
}

function AccountSettings() {
  const { data: me } = useMe();
  const team = useTeamMutation();
  const signOut = useSignOut();
  const [name, setName] = useState(me?.member?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const saveName = async () => {
    try {
      await team.mutateAsync({ action: "update-self", fullName: name.trim() });
      toast.success("Nombre actualizado");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const savePassword = async () => {
    if (password.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirm) return toast.error("Las contraseñas no coinciden.");
    setSavingPassword(true);
    const { error } = await getSupabase().auth.updateUser({ password });
    setSavingPassword(false);
    if (error) return toast.error(errorMessage(error));
    setPassword("");
    setConfirm("");
    toast.success("Contraseña actualizada");
  };

  return (
    <div className="space-y-5">
      <Card className="p-4 md:p-6">
        <div className="flex items-center gap-4">
          <Avatar name={me?.member?.full_name} size={56} />
          <div className="min-w-0">
            <p className="truncate font-display text-2xl text-ink">{me?.member?.full_name}</p>
            <p className="truncate text-sm text-muted">{me?.email}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Nombre visible" className="flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={saveName} loading={team.isPending} disabled={name.trim() === me?.member?.full_name}>
            Guardar
          </Button>
        </div>
      </Card>

      <Card className="p-4 md:p-6">
        <SectionTitle title="Contraseña" subtitle="Usá al menos 8 caracteres" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nueva contraseña">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Repetila">
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        <Button className="mt-4" variant="secondary" onClick={savePassword} loading={savingPassword} disabled={!password}>
          <KeyRound className="size-4" /> Cambiar contraseña
        </Button>
      </Card>

      <button type="button" onClick={signOut} className={cn("flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-3.5 text-sm font-medium text-danger shadow-card transition-colors hover:bg-danger-soft")}>
        <LogOut className="size-4" /> Cerrar sesión
      </button>
    </div>
  );
}
