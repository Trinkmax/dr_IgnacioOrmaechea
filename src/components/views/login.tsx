"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { BrandLogo, Monogram } from "@/components/shell/nav";
import { getSupabase } from "@/lib/supabase/client";
import { callTeam } from "@/lib/queries/session";
import { errorMessage } from "@/lib/utils";

type Mode = "checking" | "login" | "setup";

export function LoginView() {
  const [mode, setMode] = useState<Mode>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("Dr. Ignacio Ormaechea");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    let cancelled = false;
    callTeam<{ needsSetup: boolean }>({ action: "status" })
      .then((r) => !cancelled && setMode(r.needsSetup ? "setup" : "login"))
      .catch(() => !cancelled && setMode("login"));
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async () => {
    const { error: authError } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (authError) throw authError;
    // Navegación completa: el proxy ve la cookie nueva y el estado del cliente arranca limpio.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError("Completá email y contraseña.");
    setLoading(true);
    try {
      if (mode === "setup") {
        if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
        await callTeam({ action: "bootstrap", fullName: fullName.trim(), email: email.trim(), password });
      }
      await signIn();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  const isSetup = mode === "setup";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Panel de marca */}
      <div className="relative hidden overflow-hidden bg-[#1c1714] text-[#efe6dd] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute -right-40 -top-40 size-[640px] rounded-full opacity-[0.16]"
          style={{ background: "radial-gradient(circle at 30% 30%, #d9b8a4, transparent 62%)" }}
          aria-hidden
        />
        <BrandLogo className="pointer-events-none absolute -bottom-40 -right-40 size-[560px] text-[#d9b8a4] opacity-[0.07]" />
        <BrandLogo className="relative size-[200px] text-[#efe6dd] xl:size-[232px]" />
        <div className="relative max-w-lg">
          <h1 className="font-display text-[64px] leading-[0.98] tracking-[-0.02em] text-white">
            Tu consultorio, <span className="italic text-[#e6c9b6]">en orden.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[#b9ab9e]">
            Agenda, pacientes, cobros, proveedores y la rentabilidad real de cada tratamiento. Todo en un mismo lugar, en la compu o en el celular.
          </p>
        </div>
        <div className="relative grid max-w-lg grid-cols-3 gap-4 text-[13px] text-[#b9ab9e]">
          {["Agenda con arrastrar y soltar", "Cobros en pesos y dólares", "Costos y margen por cirugía"].map((t) => (
            <div key={t} className="border-t border-white/10 pt-3">
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Formulario */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <Monogram className="size-11 text-[19px]" />
            <div>
              <p className="font-display text-xl leading-tight text-ink">Dr. Ignacio Ormaechea</p>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Cirugía Plástica</p>
            </div>
          </div>

          {mode === "checking" ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Preparando…
            </div>
          ) : (
            <div className="animate-rise">
              {isSetup ? (
                <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">
                  <Sparkles className="size-3.5" /> Primera vez
                </div>
              ) : null}
              <h2 className="font-display text-[40px] leading-[1.02] tracking-[-0.01em] text-ink">{isSetup ? "Configurá tu consultorio" : "Bienvenido"}</h2>
              <p className="mt-2 text-[15px] text-muted">
                {isSetup ? "Creá la cuenta de administrador. Después vas a poder sumar a tu secretaria desde Ajustes." : "Ingresá con tu email y contraseña."}
              </p>

              <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
                {isSetup ? (
                  <Field label="Tu nombre">
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                      <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12 pl-10" autoComplete="name" />
                    </div>
                  </Field>
                ) : null}
                <Field label="Email">
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete={isSetup ? "email" : "username"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre@mail.com"
                      className="h-12 pl-10"
                      autoFocus
                    />
                  </div>
                </Field>
                <Field label="Contraseña" hint={isSetup ? "Mínimo 8 caracteres" : undefined}>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete={isSetup ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 pl-10 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-sunken"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>

                {error ? <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger">{error}</p> : null}

                <Button type="submit" size="lg" className="w-full" loading={loading}>
                  {isSetup ? "Crear cuenta e ingresar" : "Ingresar"}
                  {!loading ? <ArrowRight className="size-4" /> : null}
                </Button>
              </form>

              {!isSetup ? (
                <div className="mt-6 text-center">
                  {forgot ? (
                    <p className="text-[13px] leading-relaxed text-muted">
                      Pedile al administrador que te asigne una contraseña nueva desde <b className="text-ink-2">Ajustes → Equipo</b>.
                    </p>
                  ) : (
                    <button type="button" onClick={() => setForgot(true)} className="text-[13px] font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
