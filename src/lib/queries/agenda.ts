"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { CalendarAppointment, WaitlistWithRefs } from "@/lib/types";

export const APPOINTMENT_SELECT =
  "*, patient:patients(id, full_name, phone), treatment:treatments(id, name, color, kind, duration_min), payments(amount_ars, amount_usd)";

export function useAppointmentsRange(from: Date, to: Date, enabled = true) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  return useQuery({
    queryKey: qk.appointmentsRange(fromIso, toIso),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("appointments")
        .select(APPOINTMENT_SELECT)
        .lt("starts_at", toIso)
        .gt("ends_at", fromIso)
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as CalendarAppointment[];
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

function findCachedAppointment(queryClient: QueryClient, id: string) {
  for (const [, data] of queryClient.getQueriesData<CalendarAppointment[] | CalendarAppointment>({
    queryKey: qk.appointments,
  })) {
    if (Array.isArray(data)) {
      const hit = data.find((a) => a.id === id);
      if (hit) return hit;
    } else if (data && data.id === id) {
      return data;
    }
  }
  return undefined;
}

export function useAppointment(id: string | null | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: qk.appointment(id ?? "none"),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("appointments")
        .select(APPOINTMENT_SELECT)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as CalendarAppointment | null;
    },
    enabled: Boolean(id),
    initialData: () => (id ? findCachedAppointment(queryClient, id) : undefined),
    initialDataUpdatedAt: 0,
  });
}

export function usePatientAppointments(patientId: string | null | undefined) {
  return useQuery({
    queryKey: qk.patientAppointments(patientId ?? "none"),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("appointments")
        .select(APPOINTMENT_SELECT)
        .eq("patient_id", patientId!)
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CalendarAppointment[];
    },
    enabled: Boolean(patientId),
  });
}

/** Invalida todo lo que depende de turnos (calendario, saldos, estadísticas, cuentas por pagar). */
export function invalidateAgenda(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: qk.appointments });
  queryClient.invalidateQueries({ queryKey: qk.balances });
  queryClient.invalidateQueries({ queryKey: ["stats"] });
  queryClient.invalidateQueries({ queryKey: qk.expenses });
}

function patchCachedAppointments(
  queryClient: QueryClient,
  id: string,
  patch: (a: CalendarAppointment) => CalendarAppointment | null,
) {
  queryClient.setQueriesData<CalendarAppointment[] | CalendarAppointment | null>(
    { queryKey: qk.appointments },
    (data) => {
      if (!data) return data;
      if (Array.isArray(data)) {
        let changed = false;
        const next: CalendarAppointment[] = [];
        for (const a of data) {
          if (a.id !== id) {
            next.push(a);
            continue;
          }
          changed = true;
          const updated = patch(a);
          if (updated) next.push(updated);
        }
        return changed ? next : data;
      }
      return data.id === id ? patch(data) : data;
    },
  );
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: TablesInsert<"appointments">) => {
      const { data, error } = await getSupabase()
        .from("appointments")
        .insert(values)
        .select(APPOINTMENT_SELECT)
        .single();
      if (error) throw error;
      return data as unknown as CalendarAppointment;
    },
    onSuccess: () => invalidateAgenda(queryClient),
  });
}

type UpdateVars = { id: string; patch: TablesUpdate<"appointments"> };

/** Actualización optimista: el calendario responde al instante al soltar una tarjeta. */
export function useUpdateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateVars) => {
      const { data, error } = await getSupabase()
        .from("appointments")
        .update(patch)
        .eq("id", id)
        .select(APPOINTMENT_SELECT)
        .single();
      if (error) throw error;
      return data as unknown as CalendarAppointment;
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: qk.appointments });
      const snapshot = queryClient.getQueriesData({ queryKey: qk.appointments });
      patchCachedAppointments(queryClient, id, (a) => ({ ...a, ...patch }) as CalendarAppointment);
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => invalidateAgenda(queryClient),
  });
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qk.appointments });
      const snapshot = queryClient.getQueriesData({ queryKey: qk.appointments });
      patchCachedAppointments(queryClient, id, () => null);
      return { snapshot };
    },
    onError: (_err, _id, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      invalidateAgenda(queryClient);
      queryClient.invalidateQueries({ queryKey: qk.payments });
    },
  });
}

// ---------------------------------------------------------------------------
// Por agendar
// ---------------------------------------------------------------------------
export function useWaitlist() {
  return useQuery({
    queryKey: qk.waitlist,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("waitlist")
        .select(
          "*, patient:patients(id, full_name, phone), treatment:treatments(id, name, color, kind, duration_min, price, currency)",
        )
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as WaitlistWithRefs[];
    },
  });
}

export function useAddToWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: TablesInsert<"waitlist">) => {
      const { error } = await getSupabase().from("waitlist").insert(values);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.waitlist }),
  });
}

export function useRemoveFromWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("waitlist").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qk.waitlist });
      const previous = queryClient.getQueryData<WaitlistWithRefs[]>(qk.waitlist);
      queryClient.setQueryData<WaitlistWithRefs[]>(qk.waitlist, (list) => list?.filter((w) => w.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => queryClient.setQueryData(qk.waitlist, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.waitlist }),
  });
}
