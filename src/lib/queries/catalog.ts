"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";
import { callTeam, type TeamAction } from "@/lib/queries/session";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { Member, RecurringExpense, Settings, Supplier, TreatmentCost, TreatmentWithCosts } from "@/lib/types";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await getSupabase().from("settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TablesUpdate<"settings">) => {
      const { data, error } = await getSupabase().from("settings").update(patch).eq("id", 1).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(qk.settings, data),
  });
}

// ---------------------------------------------------------------------------
// Tratamientos (los costos solo llegan si sos admin, por RLS)
// ---------------------------------------------------------------------------
export function useTreatments() {
  return useQuery({
    queryKey: qk.treatments,
    queryFn: async (): Promise<TreatmentWithCosts[]> => {
      const { data, error } = await getSupabase()
        .from("treatments")
        .select("*, costs:treatment_costs(*)")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((t) => ({
        ...t,
        costs: [...(t.costs ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      }));
    },
    staleTime: 5 * 60_000,
  });
}

export type CostDraft = Pick<TreatmentCost, "concept" | "amount" | "currency" | "supplier_id">;

export function useSaveTreatment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      values: TablesInsert<"treatments">;
      costs?: CostDraft[];
    }) => {
      const sb = getSupabase();
      let id = input.id;
      if (id) {
        const { error } = await sb.from("treatments").update(input.values).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("treatments").insert(input.values).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (input.costs) {
        const { error: delError } = await sb.from("treatment_costs").delete().eq("treatment_id", id!);
        if (delError) throw delError;
        const rows = input.costs
          .filter((c) => c.concept.trim())
          .map((c, index) => ({
            treatment_id: id!,
            concept: c.concept.trim(),
            amount: c.amount || 0,
            currency: c.currency,
            supplier_id: c.supplier_id,
            sort_order: index + 1,
          }));
        if (rows.length) {
          const { error } = await sb.from("treatment_costs").insert(rows);
          if (error) throw error;
        }
      }
      return id!;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.treatments }),
  });
}

export function useDeleteTreatment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("treatments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.treatments });
      queryClient.invalidateQueries({ queryKey: qk.appointments });
    },
  });
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------
export function useSuppliers(enabled = true) {
  return useQuery({
    queryKey: qk.suppliers,
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await getSupabase().from("suppliers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSaveSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; values: TablesInsert<"suppliers"> }) => {
      const sb = getSupabase();
      if (input.id) {
        const { data, error } = await sb.from("suppliers").update(input.values).eq("id", input.id).select("*").single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await sb.from("suppliers").insert(input.values).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.suppliers }),
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.suppliers });
      queryClient.invalidateQueries({ queryKey: qk.expenses });
      queryClient.invalidateQueries({ queryKey: qk.treatments });
    },
  });
}

// ---------------------------------------------------------------------------
// Gastos fijos (plantillas)
// ---------------------------------------------------------------------------
export function useRecurringExpenses(enabled = true) {
  return useQuery({
    queryKey: qk.recurring,
    queryFn: async (): Promise<RecurringExpense[]> => {
      const { data, error } = await getSupabase()
        .from("recurring_expenses")
        .select("*")
        .order("sort_order")
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSaveRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; values: TablesInsert<"recurring_expenses"> }) => {
      const sb = getSupabase();
      const query = input.id
        ? sb.from("recurring_expenses").update(input.values).eq("id", input.id)
        : sb.from("recurring_expenses").insert(input.values);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.recurring }),
  });
}

export function useDeleteRecurring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("recurring_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.recurring });
      queryClient.invalidateQueries({ queryKey: qk.expenses });
    },
  });
}

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------
export function useMembers() {
  return useQuery({
    queryKey: qk.members,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await getSupabase().from("members").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useTeamMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeamAction) => callTeam(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.members });
      queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });
}
