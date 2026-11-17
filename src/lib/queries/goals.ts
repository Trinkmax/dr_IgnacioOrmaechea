"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";
import type { Appointment, BookingStatus, Patient, Payment, Treatment } from "@/lib/types";

export type GoalAppointment = Pick<Appointment, "id" | "starts_at" | "ends_at" | "status" | "source" | "price" | "currency" | "patient_id" | "title"> & {
  patient: Pick<Patient, "full_name"> | null;
  treatment: Pick<Treatment, "name" | "color" | "kind"> | null;
  payments: Pick<Payment, "amount_ars" | "amount_usd">[];
};

export type GoalStats = {
  appointments: GoalAppointment[];
  patients: Pick<Patient, "id" | "created_at" | "source">[];
  payments: Pick<Payment, "paid_on" | "amount_ars">[];
  requests: { status: BookingStatus; created_at: string }[];
};

/**
 * Datos para Objetivos: turnos (pasados y por venir), pacientes nuevos, cobros y
 * solicitudes online entre `fromIso` y `toIso`.
 */
export function useGoalStats(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: qk.goalStats(`${fromIso}|${toIso}`),
    queryFn: async (): Promise<GoalStats> => {
      const sb = getSupabase();
      const fromDate = fromIso.slice(0, 10);
      const [appointments, patients, payments, requests] = await Promise.all([
        sb
          .from("appointments")
          .select(
            "id, starts_at, ends_at, status, source, price, currency, patient_id, title, patient:patients(full_name), treatment:treatments(name, color, kind), payments(amount_ars, amount_usd)",
          )
          .gte("starts_at", fromIso)
          .lt("starts_at", toIso)
          .order("starts_at"),
        sb.from("patients").select("id, created_at, source").gte("created_at", fromIso),
        sb.from("payments").select("paid_on, amount_ars").gte("paid_on", fromDate),
        sb.from("booking_requests").select("status, created_at").gte("created_at", fromIso),
      ]);
      for (const r of [appointments, patients, payments, requests]) if (r.error) throw r.error;
      return {
        appointments: (appointments.data ?? []) as unknown as GoalAppointment[],
        patients: patients.data ?? [],
        payments: payments.data ?? [],
        requests: requests.data ?? [],
      };
    },
    placeholderData: keepPreviousData,
  });
}
