"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";
import { invalidateAgenda } from "@/lib/queries/agenda";
import type { BookingHour, BookingRequestWithRefs } from "@/lib/types";

const REQUEST_SELECT = "*, treatment:treatments(id, name, color, kind, duration_min), patient:patients(id, full_name)";

/** Solicitudes pendientes (todas, ordenadas por fecha del turno pedido). */
export function usePendingBookings() {
  return useQuery({
    queryKey: qk.bookingPending,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("booking_requests")
        .select(REQUEST_SELECT)
        .eq("status", "pendiente")
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as BookingRequestWithRefs[];
    },
    staleTime: 15_000,
  });
}

/** Solicitudes ya resueltas desde `fromIso` (por fecha de creación). */
export function useBookingHistory(fromIso: string, enabled = true) {
  return useQuery({
    queryKey: qk.bookingHistory(fromIso),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("booking_requests")
        .select(REQUEST_SELECT)
        .neq("status", "pendiente")
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as BookingRequestWithRefs[];
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

function invalidateBookings(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: qk.bookingRequests });
  queryClient.invalidateQueries({ queryKey: ["goal-stats"] });
}

export function useConfirmBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force = false }: { id: string; force?: boolean }) => {
      const { data, error } = await getSupabase().rpc("confirm_booking", { p_request_id: id, p_force: force });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      invalidateBookings(queryClient);
      invalidateAgenda(queryClient);
      queryClient.invalidateQueries({ queryKey: qk.patients });
    },
  });
}

export function useDeclineBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reply }: { id: string; reply?: string }) => {
      const { error } = await getSupabase().rpc("decline_booking", { p_request_id: id, p_reply: reply ?? "" });
      if (error) throw error;
    },
    onSettled: () => invalidateBookings(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Horarios en los que se aceptan reservas
// ---------------------------------------------------------------------------
export function useBookingHours() {
  return useQuery({
    queryKey: qk.bookingHours,
    queryFn: async () => {
      const { data, error } = await getSupabase().from("booking_hours").select("*").order("weekday").order("start_time");
      if (error) throw error;
      return (data ?? []) as BookingHour[];
    },
    staleTime: 5 * 60_000,
  });
}

export type HourDraft = { weekday: number; start_time: string; end_time: string };

/** Reemplaza la grilla semanal completa. */
export function useSaveBookingHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: HourDraft[]) => {
      const sb = getSupabase();
      const { error: delError } = await sb.from("booking_hours").delete().gte("weekday", 0);
      if (delError) throw delError;
      if (rows.length) {
        const { error } = await sb.from("booking_hours").insert(rows);
        if (error) throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.bookingHours }),
  });
}

export function useSetTreatmentOnline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, online }: { id: string; online: boolean }) => {
      const { error } = await getSupabase().from("treatments").update({ online_booking: online }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.treatments }),
  });
}

/** Link público para compartir con las pacientes. */
export function bookingUrl() {
  return typeof window === "undefined" ? "/reservar" : `${window.location.origin}/reservar`;
}

/** Arma un mensaje a partir de una plantilla con {nombre}, {fecha}, {hora}, {tratamiento}. */
export function fillTemplate(template: string, values: { nombre: string; fecha: string; hora: string; tratamiento: string }) {
  return template
    .replaceAll("{nombre}", values.nombre)
    .replaceAll("{fecha}", values.fecha)
    .replaceAll("{hora}", values.hora)
    .replaceAll("{tratamiento}", values.tratamiento);
}
