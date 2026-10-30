"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { WaitlistWithRefs } from "@/lib/types";

type PlacementApi = {
  item: WaitlistWithRefs | null;
  start: (item: WaitlistWithRefs) => void;
  cancel: () => void;
};

const PlacementContext = createContext<PlacementApi | null>(null);

/** "Modo ubicar": elegir un paciente de Por agendar y tocar un horario (ideal en mobile). */
export function PlacementProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<WaitlistWithRefs | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const start = useCallback(
    (next: WaitlistWithRefs) => {
      setItem(next);
      if (pathname !== "/agenda") router.push("/agenda");
    },
    [pathname, router],
  );
  const cancel = useCallback(() => setItem(null), []);
  const api = useMemo(() => ({ item, start, cancel }), [item, start, cancel]);
  return <PlacementContext value={api}>{children}</PlacementContext>;
}

export function usePlacement() {
  const ctx = useContext(PlacementContext);
  if (!ctx) throw new Error("usePlacement debe usarse dentro de PlacementProvider");
  return ctx;
}
