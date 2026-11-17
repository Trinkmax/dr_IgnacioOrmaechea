"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";
import { capitalize, fmt, time } from "@/lib/format";
import type { BookingRequest } from "@/lib/types";

/** Cambios hechos desde otro dispositivo (secretaría ↔ doctor) se reflejan solos. */
export function RealtimeSync() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

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
      if (pending.has("booking_requests")) {
        queryClient.invalidateQueries({ queryKey: qk.bookingRequests });
        queryClient.invalidateQueries({ queryKey: ["goal-stats"] });
      }
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
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_requests" }, (payload) => {
        schedule("booking_requests");
        if (payload.eventType === "INSERT") announceBooking(payload.new as BookingRequest, () => routerRef.current.push("/solicitudes"));
      })
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [queryClient]);

  return null;
}

/** Aviso de solicitud nueva: toast en la app y notificación del sistema si la pestaña no está a la vista. */
function announceBooking(request: BookingRequest, goToRequests: () => void) {
  const when = `${capitalize(fmt(request.starts_at, "EEE d MMM"))} · ${time(request.starts_at)} h`;
  toast("Nueva solicitud de turno", {
    description: `${request.full_name} · ${when}`,
    duration: 15_000,
    action: { label: "Ver", onClick: goToRequests },
  });
  if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
    try {
      const notification = new Notification("Nueva solicitud de turno", {
        body: `${request.full_name} pidió turno para el ${when}`,
        icon: "/brand/icon-192.png",
        tag: `booking-${request.id}`,
      });
      notification.onclick = () => {
        window.focus();
        goToRequests();
        notification.close();
      };
    } catch {
      // Algunos navegadores móviles solo permiten notificaciones desde un service worker.
    }
  }
}
