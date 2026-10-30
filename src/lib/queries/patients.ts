"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";
import type { TablesInsert } from "@/lib/database.types";
import type { Patient } from "@/lib/types";

export function usePatients() {
  return useQuery({
    queryKey: qk.patients,
    queryFn: async (): Promise<Patient[]> => {
      const { data, error } = await getSupabase().from("patients").select("*").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function usePatient(id: string | null | undefined) {
  const list = usePatients();
  return { ...list, data: list.data?.find((p) => p.id === id) ?? null };
}

export function useSavePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; values: TablesInsert<"patients"> }) => {
      const sb = getSupabase();
      if (input.id) {
        const { data, error } = await sb.from("patients").update(input.values).eq("id", input.id).select("*").single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await sb.from("patients").insert(input.values).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (patient) => {
      queryClient.setQueryData<Patient[]>(qk.patients, (list) => {
        if (!list) return list;
        const rest = list.filter((p) => p.id !== patient.id);
        return [...rest, patient].sort((a, b) => a.full_name.localeCompare(b.full_name, "es"));
      });
      queryClient.invalidateQueries({ queryKey: qk.patients });
      queryClient.invalidateQueries({ queryKey: qk.appointments });
    },
  });
}

export function useDeletePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("patients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.patients });
      queryClient.invalidateQueries({ queryKey: qk.appointments });
      queryClient.invalidateQueries({ queryKey: qk.waitlist });
      queryClient.invalidateQueries({ queryKey: qk.balances });
    },
  });
}
