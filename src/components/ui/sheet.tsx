"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/components/shell/overlay-store";

/** Encabezado de hoja: volver (si hay una hoja debajo) o cerrar. */
export function SheetHeader({
  title,
  subtitle,
  actions,
  leading,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  className?: string;
}) {
  const { stack, back, close } = useOverlay();
  const canGoBack = stack.length > 1;
  return (
    <div className={cn("flex shrink-0 items-start gap-3 px-5 pb-3 pt-4 md:px-6 md:pt-5", className)}>
      {canGoBack ? (
        <button
          type="button"
          onClick={back}
          aria-label="Volver"
          className="-ml-1.5 mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-sunken active:scale-95"
        >
          <ArrowLeft className="size-[18px]" />
        </button>
      ) : null}
      {leading}
      <div className="min-w-0 flex-1 pt-1">
        <Drawer.Title className="truncate text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</Drawer.Title>
        {subtitle ? <Drawer.Description asChild><div className="mt-0.5 text-[13px] text-muted">{subtitle}</div></Drawer.Description> : <Drawer.Description className="sr-only">Detalle</Drawer.Description>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="-mr-1.5 flex size-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-sunken hover:text-ink active:scale-95"
        >
          <X className="size-[18px]" />
        </button>
      </div>
    </div>
  );
}

export function SheetBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 md:px-6", className)}>{children}</div>;
}

export function SheetFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-t border-line/70 bg-surface/95 px-5 pt-3 backdrop-blur md:px-6",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SheetSection({ title, children, className, action }: { title?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("mt-6 first:mt-1", className)}>
      {title ? (
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h3>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
