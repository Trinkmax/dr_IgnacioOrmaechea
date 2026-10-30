"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type {
  AppointmentBalance,
  ExpenseWithRefs,
  Patient,
  Payment,
  PaymentWithRefs,
  Treatment,
} from "@/lib/types";

const PAYMENT_SELECT =
  "*, patient:patients(id, full_name), appointment:appointments(id, starts_at, treatment:treatments(name, color))";

// ---------------------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------------------
export function usePaymentsRange(from: string, to: string) {
  return useQuery({
    queryKey: qk.paymentsRange(from, to),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("payments")
        .select(PAYMENT_SELECT)
        .gte("paid_on", from)
        .lte("paid_on", to)
        .order("paid_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PaymentWithRefs[];
    },
    placeholderData: keepPreviousData,
  });
}

export function usePatientPayments(patientId: string | null | undefined) {
  return useQuery({
    queryKey: qk.patientPayments(patientId ?? "none"),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("payments")
        .select(PAYMENT_SELECT)
        .eq("patient_id", patientId!)
        .order("paid_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PaymentWithRefs[];
    },
    enabled: Boolean(patientId),
  });
}

function invalidateMoney(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: qk.payments });
  queryClient.invalidateQueries({ queryKey: qk.balances });
  queryClient.invalidateQueries({ queryKey: qk.appointments });
  queryClient.invalidateQueries({ queryKey: ["stats"] });
}

export function useSavePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; values: TablesInsert<"payments"> }): Promise<Payment> => {
      const sb = getSupabase();
      if (input.id) {
        const { data, error } = await sb.from("payments").update(input.values).eq("id", input.id).select("*").single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await sb.from("payments").insert(input.values).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateMoney(queryClient),
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateMoney(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Saldos pendientes de cobro
// ---------------------------------------------------------------------------
export type BalanceRow = AppointmentBalance & {
  patient: Pick<Patient, "id" | "full_name" | "phone"> | null;
  treatment: Pick<Treatment, "name" | "color" | "kind"> | null;
};

export function useBalances() {
  return useQuery({
    queryKey: qk.balances,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("appointment_balances")
        .select("*, patient:patients(id, full_name, phone), treatment:treatments(name, color, kind)")
        .gt("balance", 0)
        .not("status", "in", "(cancelado,ausente)")
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as BalanceRow[];
    },
  });
}

// ---------------------------------------------------------------------------
// Egresos
// ---------------------------------------------------------------------------
const EXPENSE_SELECT = "*, supplier:suppliers(id, name)";

export function useExpensesRange(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: qk.expensesRange(from, to),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("expenses")
        .select(EXPENSE_SELECT)
        .gte("due_on", from)
        .lte("due_on", to)
        .order("due_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ExpenseWithRefs[];
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Todo lo que falta pagar (cuentas por pagar), del más próximo al más lejano. */
export function usePayables(enabled = true) {
  return useQuery({
    queryKey: qk.payables,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("expenses")
        .select(EXPENSE_SELECT)
        .is("paid_on", null)
        .order("due_on");
      if (error) throw error;
      return (data ?? []) as unknown as ExpenseWithRefs[];
    },
    enabled,
  });
}

export function useSupplierExpenses(supplierId: string | null | undefined) {
  return useQuery({
    queryKey: qk.supplierExpenses(supplierId ?? "none"),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("expenses")
        .select(EXPENSE_SELECT)
        .eq("supplier_id", supplierId!)
        .order("due_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ExpenseWithRefs[];
    },
    enabled: Boolean(supplierId),
  });
}

function invalidateExpenses(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: qk.expenses });
  queryClient.invalidateQueries({ queryKey: ["stats"] });
}

export function useSaveExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; values: TablesInsert<"expenses"> }): Promise<string> => {
      const sb = getSupabase();
      if (input.id) {
        const { error } = await sb.from("expenses").update(input.values).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await sb.from("expenses").insert(input.values).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"expenses"> }) => {
      const { error } = await getSupabase().from("expenses").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Estadísticas para el inicio (agregadas en el cliente: volumen de un consultorio)
// ---------------------------------------------------------------------------
export type StatPayment = Pick<Payment, "paid_on" | "amount_ars" | "amount_usd" | "currency" | "method"> & {
  appointment: { treatment: Pick<Treatment, "id" | "name" | "color" | "kind"> | null } | null;
};
export type StatExpense = { due_on: string; paid_on: string | null; amount_ars: number | null; kind: string; category: string };

export function useStats(from: string, includeExpenses: boolean) {
  return useQuery({
    queryKey: [...qk.stats(from), includeExpenses],
    queryFn: async () => {
      const sb = getSupabase();
      const [payments, expenses] = await Promise.all([
        sb
          .from("payments")
          .select("paid_on, amount_ars, amount_usd, currency, method, appointment:appointments(treatment:treatments(id, name, color, kind))")
          .gte("paid_on", from),
        includeExpenses
          ? sb.from("expenses").select("due_on, paid_on, amount_ars, kind, category").gte("due_on", from)
          : Promise.resolve({ data: [] as StatExpense[], error: null }),
      ]);
      if (payments.error) throw payments.error;
      if (expenses.error) throw expenses.error;
      return {
        payments: (payments.data ?? []) as unknown as StatPayment[],
        expenses: (expenses.data ?? []) as unknown as StatExpense[],
      };
    },
    placeholderData: keepPreviousData,
  });
}
