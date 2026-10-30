"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
};

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

/** Diálogo de confirmación promisificado: `if (await confirm({...})) ...` */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setState({ ...opts, open: true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setState((s) => (s ? { ...s, open: false } : s));
  };

  return (
    <ConfirmContext value={confirm}>
      {children}
      <AlertDialog.Root open={Boolean(state?.open)} onOpenChange={(open) => !open && finish(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-ink/35 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[calc(100vw-2rem)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border border-line bg-surface p-6 shadow-pop data-[state=open]:animate-rise">
            <AlertDialog.Title className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{state?.title}</AlertDialog.Title>
            {state?.description ? (
              <AlertDialog.Description asChild>
                <div className="mt-2 text-sm leading-relaxed text-ink-2">{state.description}</div>
              </AlertDialog.Description>
            ) : (
              <AlertDialog.Description className="sr-only">Confirmación</AlertDialog.Description>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary" onClick={() => finish(false)}>
                  {state?.cancelLabel ?? "Cancelar"}
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant={state?.tone === "danger" ? "danger" : "primary"} onClick={() => finish(true)}>
                  {state?.confirmLabel ?? "Confirmar"}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de ConfirmProvider");
  return ctx;
}
