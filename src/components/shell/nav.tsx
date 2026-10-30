"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "vaul";
import { DropdownMenu } from "radix-ui";
import { CalendarPlus, ClipboardList, LogOut, Plus, Receipt, Search, Settings, UserPlus, Wallet } from "lucide-react";
import { Avatar, Kbd } from "@/components/ui/misc";
import { useOverlay } from "@/components/shell/overlay-store";
import { NAV_GROUPS, isActive, navFor } from "@/components/shell/nav-config";
import { useRole, useSignOut } from "@/lib/queries/session";
import { useSettings } from "@/lib/queries/catalog";
import { cn } from "@/lib/utils";

/** El logo se usa como máscara: toma el color del texto (currentColor) sobre cualquier fondo. */
function logoMask(src: string): CSSProperties {
  return {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    backgroundColor: "currentColor",
  };
}

/** Monograma "OJ" del logo dentro de un círculo. */
export function Monogram({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        light ? "bg-[#f4eae3] text-[#26201c]" : "bg-brand text-[#f4eae3]",
        className,
      )}
      aria-hidden
    >
      <span className="block size-[76%]" style={logoMask("/brand/logo-mark.png")} />
    </span>
  );
}

/** Logo completo (monograma, arco y nombre en círculo). */
export function BrandLogo({ className }: { className?: string }) {
  return <span role="img" aria-label="Dr. José I. Ormaechea" className={cn("block", className)} style={logoMask("/brand/logo-full.png")} />;
}

function useQuickActions() {
  const { open } = useOverlay();
  const { isAdmin } = useRole();
  const actions = [
    { label: "Nuevo turno", hint: "Agendar", icon: CalendarPlus, run: () => open({ type: "appointment-form" }) },
    { label: "Registrar cobro", hint: "Ingreso", icon: Wallet, run: () => open({ type: "payment-form" }) },
    { label: "Nuevo paciente", hint: "Ficha", icon: UserPlus, run: () => open({ type: "patient-form" }) },
    { label: "Por agendar", hint: "Lista de espera", icon: ClipboardList, run: () => open({ type: "waitlist-form" }) },
  ];
  if (isAdmin) actions.push({ label: "Nuevo gasto", hint: "Egreso", icon: Receipt, run: () => open({ type: "expense-form" }) });
  return actions;
}

// ---------------------------------------------------------------------------
// Desktop
// ---------------------------------------------------------------------------
export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname();
  const { role, member, isAdmin } = useRole();
  const { data: settings } = useSettings();
  const signOut = useSignOut();
  const items = navFor(role);
  const actions = useQuickActions();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col bg-[#1c1714] text-[#d9cfc5] md:flex lg:w-[252px]">
      <div className="flex items-center gap-3 px-4 pb-4 pt-5 lg:px-5">
        <Monogram light className="size-11 text-[19px]" />
        <div className="hidden min-w-0 lg:block">
          <p className="line-clamp-2 font-display text-[12.5px] uppercase leading-[1.3] tracking-[0.1em] text-white">{settings?.clinic_name ?? "Dr. Ignacio Ormaechea"}</p>
          <p className="truncate text-[11px] uppercase tracking-[0.14em] text-[#a8988a]">{settings?.clinic_tagline ?? "Cirugía Plástica"}</p>
        </div>
      </div>

      <div className="space-y-2 px-3 lg:px-4">
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#f4eae3] text-sm font-semibold text-[#26201c] shadow-[0_1px_0_rgb(255_255_255/0.4)_inset] transition-[transform,background-color] hover:bg-white active:scale-[0.98]"
            >
              <Plus className="size-[18px]" />
              <span className="hidden lg:inline">Nuevo</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="right"
              align="start"
              sideOffset={10}
              className="z-50 w-60 rounded-2xl border border-line bg-surface p-1.5 shadow-pop data-[state=open]:animate-rise"
            >
              {actions.map((a) => (
                <DropdownMenu.Item
                  key={a.label}
                  onSelect={a.run}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-subtle"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-sunken text-ink-2">
                    <a.icon className="size-4" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-medium">{a.label}</span>
                    <span className="block text-xs text-muted">{a.hint}</span>
                  </span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <button
          type="button"
          onClick={onSearch}
          className="flex h-10 w-full items-center justify-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-[#a8988a] transition-colors hover:bg-white/[0.07] hover:text-[#d9cfc5] lg:justify-start"
        >
          <Search className="size-4" />
          <span className="hidden flex-1 text-left lg:inline">Buscar…</span>
          <span className="hidden items-center gap-0.5 lg:flex">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto px-3 lg:px-4">
        {NAV_GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.group === group.id);
          if (!groupItems.length) return null;
          return (
            <div key={group.id}>
              <p className="mb-1.5 hidden px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7d6f63] lg:block">{group.label}</p>
              <ul className="space-y-0.5">
                {groupItems.map((item) => (
                  <li key={item.href}>
                    <SidebarLink href={item.href} label={item.label} active={isActive(pathname, item.href)}>
                      <item.icon className="size-[18px]" />
                    </SidebarLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-3 lg:p-4">
        <SidebarLink href="/ajustes" label="Ajustes" active={isActive(pathname, "/ajustes")}>
          <Settings className="size-[18px]" />
        </SidebarLink>
        <div className="mt-3 flex items-center gap-3 rounded-xl px-1.5 lg:px-2">
          <Avatar name={member?.full_name} size={34} />
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-[13px] font-medium text-white">{member?.full_name}</p>
            <p className="truncate text-[11px] text-[#a8988a]">{isAdmin ? "Administrador" : "Secretaría"}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="hidden size-8 items-center justify-center rounded-lg text-[#a8988a] transition-colors hover:bg-white/[0.06] hover:text-white lg:flex"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ href, label, active, children }: { href: string; label: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "group relative flex h-10 items-center justify-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors lg:justify-start",
        active ? "bg-white/[0.09] text-white" : "text-[#b9ab9e] hover:bg-white/[0.05] hover:text-white",
      )}
    >
      {active ? <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-accent lg:-left-4" aria-hidden /> : null}
      {children}
      <span className="hidden lg:inline">{label}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Mobile
// ---------------------------------------------------------------------------
export function MobileTopBar({ onSearch }: { onSearch: () => void }) {
  const { member } = useRole();
  const { data: settings } = useSettings();
  return (
    <div className="pt-safe sticky top-0 z-30 border-b border-line/60 bg-canvas/85 backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <Monogram className="size-9 text-[15px]" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-display text-[11.5px] uppercase leading-[1.25] tracking-[0.1em] text-ink">{settings?.clinic_name ?? "Dr. Ignacio Ormaechea"}</p>
          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-muted">{settings?.clinic_tagline ?? "Cirugía Plástica"}</p>
        </div>
        <button type="button" onClick={onSearch} aria-label="Buscar" className="flex size-10 items-center justify-center rounded-full text-ink-2 transition-colors active:bg-sunken">
          <Search className="size-5" />
        </button>
        <Link href="/ajustes" aria-label="Mi cuenta">
          <Avatar name={member?.full_name} size={34} />
        </Link>
      </div>
    </div>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { role } = useRole();
  const signOut = useSignOut();
  const actions = useQuickActions();
  const [quickOpen, setQuickOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const items = navFor(role);
  const primary = ["/", "/agenda", "/pacientes"];
  const more = items.filter((i) => !primary.includes(i.href));
  const moreActive = more.some((i) => isActive(pathname, i.href));

  const tab = (href: string) => {
    const item = items.find((i) => i.href === href)!;
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        className={cn("flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors", active ? "text-ink" : "text-muted")}
      >
        <item.icon className={cn("size-[22px] transition-transform", active && "scale-105")} strokeWidth={active ? 2.2 : 1.8} />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/90 backdrop-blur-xl md:hidden">
        <div className="flex h-16 items-stretch px-2">
          {tab("/")}
          {tab("/agenda")}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              aria-label="Nuevo"
              className="flex size-12 items-center justify-center rounded-2xl bg-brand text-white shadow-lift transition-transform active:scale-95"
            >
              <Plus className="size-6" />
            </button>
          </div>
          {tab("/pacientes")}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn("flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium", moreActive ? "text-ink" : "text-muted")}
          >
            <span className="grid size-[22px] grid-cols-2 gap-[3px] p-[3px]" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn("rounded-[3px] border-[1.6px] border-current", moreActive && i === 0 && "bg-current")} />
              ))}
            </span>
            Más
          </button>
        </div>
      </nav>

      <ActionSheet open={quickOpen} onOpenChange={setQuickOpen} title="Crear">
        <div className="grid grid-cols-2 gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                setQuickOpen(false);
                window.setTimeout(a.run, 180);
              }}
              className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-transform active:scale-[0.97]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <a.icon className="size-5" />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-ink">{a.label}</span>
                <span className="block text-xs text-muted">{a.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </ActionSheet>

      <ActionSheet open={moreOpen} onOpenChange={setMoreOpen} title="Más secciones">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {more.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className={cn("flex items-center gap-3 border-b border-line/70 px-4 py-3.5 text-[15px] font-medium last:border-b-0", isActive(pathname, item.href) ? "bg-subtle text-ink" : "text-ink-2")}
            >
              <item.icon className="size-5 text-muted" />
              {item.label}
            </Link>
          ))}
        </div>
        <button type="button" onClick={signOut} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-medium text-danger active:bg-danger-soft">
          <LogOut className="size-5" />
          Cerrar sesión
        </button>
      </ActionSheet>
    </>
  );
}

function ActionSheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-[#1e1916]/30" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-canvas px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5 outline-none">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" aria-hidden />
          <Drawer.Title className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{title}</Drawer.Title>
          <Drawer.Description className="sr-only">{title}</Drawer.Description>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
