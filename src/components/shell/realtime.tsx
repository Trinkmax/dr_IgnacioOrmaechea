"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";

/** Cambios hechos desde otro dispositivo (secretaría ↔ doctor) se reflejan solos. */
export function RealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const sb = getSupabase();
    const pending = new Set<string>();
    let timer: number | undefined;

    const flush = () => {
      if (pending.has("appointments")) {
        queryClient.invalidateQueries({ queryKey: qk.appointments });
        queryClient.invalidateQueries({ queryKey: qk.balances });
      }
      if (pending.has("payments")) {
        queryClient.invalidateQueries({ queryKey: qk.payments });
        queryClient.invalidateQueries({ queryKey: qk.balances });
        queryClient.invalidateQueries({ queryKey: qk.appointments });
        queryClient.invalidateQueries({ queryKey: ["stats"] });
      }
      if (pending.has("waitlist")) queryClient.invalidateQueries({ queryKey: qk.waitlist });
      pending.clear();
    };

    const schedule = (table: string) => {
      pending.add(table);
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 350);
    };

    const channel = sb
      .channel("consultorio-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => schedule("appointments"))
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => schedule("payments"))
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist" }, () => schedule("waitlist"))
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [queryClient]);

  return null;
}
