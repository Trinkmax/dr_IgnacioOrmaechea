"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { Currency, ExpenseKind, Patient } from "@/lib/types";

export type AppointmentDefaults = {
  startsAt?: string;
  durationMin?: number;
  patientId?: string;
  treatmentId?: string;
  waitlistId?: string;
  block?: boolean;
};

export type ExpenseDefaults = {
  kind?: ExpenseKind;
  supplierId?: string;
  recurringId?: string;
  description?: string;
  category?: string;
  amount?: number;
  currency?: Currency;
  dueOn?: string;
  paid?: boolean;
};

/** Todo lo que se abre en una hoja lateral (desktop) o desde abajo (mobile). */
export type OverlaySpec =
  | { type: "appointment"; id: string }
  | { type: "appointment-form"; appointmentId?: string; defaults?: AppointmentDefaults }
  | { type: "patient"; id: string }
  | { type: "patient-form"; patientId?: string; initialName?: string; onSaved?: (patient: Patient) => void }
  | { type: "payment-form"; paymentId?: string; patientId?: string; appointmentId?: string }
  | { type: "expense-form"; expenseId?: string; defaults?: ExpenseDefaults }
  | { type: "recurring-form"; recurringId?: string }
  | { type: "supplier"; id: string }
  | { type: "supplier-form"; supplierId?: string }
  | { type: "treatment-form"; treatmentId?: string }
  | { type: "waitlist-form"; patientId?: string }
  | { type: "waitlist" }
  | { type: "member-form"; userId?: string };

export type OverlayEntry = { key: number; spec: OverlaySpec };

type Action =
  | { type: "open"; spec: OverlaySpec }
  | { type: "push"; spec: OverlaySpec }
  | { type: "replace"; spec: OverlaySpec }
  | { type: "back" }
  | { type: "close" };

let seq = 0;

function reducer(stack: OverlayEntry[], action: Action): OverlayEntry[] {
  switch (action.type) {
    case "open":
      return [{ key: ++seq, spec: action.spec }];
    case "push":
      return [...stack, { key: ++seq, spec: action.spec }];
    case "replace":
      return stack.length ? [...stack.slice(0, -1), { key: ++seq, spec: action.spec }] : [{ key: ++seq, spec: action.spec }];
    case "back":
      return stack.slice(0, -1);
    case "close":
      return [];
  }
}

type OverlayApi = {
  stack: OverlayEntry[];
  /** Abre una hoja nueva (reemplaza lo abierto). */
  open: (spec: OverlaySpec) => void;
  /** Abre encima de la actual; "volver" regresa a la anterior. */
  push: (spec: OverlaySpec) => void;
  replace: (spec: OverlaySpec) => void;
  back: () => void;
  close: () => void;
};

const OverlayContext = createContext<OverlayApi | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [stack, dispatch] = useReducer(reducer, []);
  const open = useCallback((spec: OverlaySpec) => dispatch({ type: "open", spec }), []);
  const push = useCallback((spec: OverlaySpec) => dispatch({ type: "push", spec }), []);
  const replace = useCallback((spec: OverlaySpec) => dispatch({ type: "replace", spec }), []);
  const back = useCallback(() => dispatch({ type: "back" }), []);
  const close = useCallback(() => dispatch({ type: "close" }), []);
  const api = useMemo(() => ({ stack, open, push, replace, back, close }), [stack, open, push, replace, back, close]);
  return <OverlayContext value={api}>{children}</OverlayContext>;
}

export function useOverlay() {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error("useOverlay debe usarse dentro de OverlayProvider");
  return ctx;
}

/** Cerrar la hoja actual: si hay una debajo vuelve a ella, si no cierra todo. */
export function useDismiss() {
  const { stack, back, close } = useOverlay();
  return useCallback(() => (stack.length > 1 ? back() : close()), [stack.length, back, close]);
}
