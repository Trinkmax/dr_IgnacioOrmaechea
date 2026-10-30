"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmProvider } from "@/components/ui/confirm";
import { OverlayProvider } from "@/components/shell/overlay-store";
import { OverlayHost } from "@/components/shell/overlay-host";
import { CommandPalette } from "@/components/shell/command-palette";
import { BottomNav, MobileTopBar, Monogram, Sidebar } from "@/components/shell/nav";
import { RealtimeSync } from "@/components/shell/realtime";
import { PlacementProvider } from "@/components/agenda/placement";
import { useMe, useSignOut } from "@/lib/queries/session";
import { useSettings, useTreatments } from "@/lib/queries/catalog";
import { useHydrated, useIsDesktop } from "@/lib/hooks";

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );

  // La app es 100% cliente: en el servidor solo viaja el esqueleto (sin fechas ni datos).
  if (!hydrated) return <ShellSkeleton />;

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <OverlayProvider>
          <PlacementProvider>
            <Gate>{children}</Gate>
          </PlacementProvider>
        </OverlayProvider>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { data: me, isLoading, isError, refetch } = useMe();
  const signOut = useSignOut();

  if (isLoading) return <ShellSkeleton />;
  if (isError) {
    return (
      <CenteredMessage
        title="No pudimos conectarnos"
        description="Revisá tu conexión a internet y probá de nuevo."
        action={<Button onClick={() => refetch()}>Reintentar</Button>}
      />
    );
  }
  if (!me?.userId) {
    if (typeof window !== "undefined") window.location.replace("/login");
    return <ShellSkeleton />;
  }
  if (!me.member) {
    return (
      <CenteredMessage
        icon={<Clock className="size-6" />}
        title="Tu cuenta todavía no tiene acceso"
        description={`Ingresaste como ${me.email ?? "usuario"}, pero el Dr. todavía no te sumó al equipo. Pedile que te agregue desde Ajustes → Equipo.`}
        action={
          <Button variant="secondary" onClick={signOut}>
            <LogOut className="size-4" />
            Cerrar sesión
          </Button>
        }
      />
    );
  }
  return <Frame>{children}</Frame>;
}

function Frame({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const isDesktop = useIsDesktop();
  // Precarga de catálogos usados en todos los formularios.
  useSettings();
  useTreatments();

  return (
    <div className="flex min-h-dvh">
      <Sidebar onSearch={() => setSearchOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar onSearch={() => setSearchOpen(true)} />
        <main className="flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      </div>
      <BottomNav />
      <OverlayHost />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <RealtimeSync />
      <Toaster
        position="top-center"
        offset={isDesktop ? 20 : 16}
        mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
        gap={8}
        toastOptions={{
          // Tiempo suficiente para tocar "Deshacer" sin apuro.
          duration: 7000,
          classNames: {
            toast: "!rounded-2xl !border !border-[#3a322c] !bg-[#1e1916] !text-white !shadow-pop !font-sans !px-4 !py-3.5",
            title: "!text-[14px] !font-semibold",
            description: "!text-[13px] !text-white/70",
            actionButton: "!rounded-lg !bg-[#f4eae3] !text-[#26201c] !font-semibold !text-xs !h-8 !px-3",
            closeButton: "!bg-[#3a322c] !border-[#3a322c] !text-white",
            icon: "!text-[#d9b8a4]",
          },
        }}
      />
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy="true" aria-label="Cargando">
      <div className="hidden w-[76px] shrink-0 bg-[#1c1714] md:block lg:w-[252px]" />
      <div className="flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mb-8 flex items-center gap-3 md:hidden">
          <Monogram className="size-9 text-[15px]" />
          <div className="skeleton h-4 w-40" />
        </div>
        <div className="skeleton h-10 w-56" />
        <div className="skeleton mt-3 h-4 w-72" />
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 rounded-card" />
          ))}
        </div>
        <div className="skeleton mt-6 h-72 rounded-card" />
      </div>
    </div>
  );
}

function CenteredMessage({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">{icon ?? <Monogram className="size-10 text-base" />}</div>
        <h1 className="font-display text-2xl text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
