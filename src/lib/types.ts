import type { Database, Tables } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export type Currency = Enums["currency_code"];
export type Role = Enums["app_role"];
export type TreatmentKind = Enums["treatment_kind"];
export type AppointmentStatus = Enums["appointment_status"];
export type PaymentMethod = Enums["payment_method"];
export type ExpenseKind = Enums["expense_kind"];

export type Member = Tables<"members">;
export type Settings = Tables<"settings">;
export type Treatment = Tables<"treatments">;
export type TreatmentCost = Tables<"treatment_costs">;
export type Patient = Tables<"patients">;
export type Appointment = Tables<"appointments">;
export type Payment = Tables<"payments">;
export type Expense = Tables<"expenses">;
export type RecurringExpense = Tables<"recurring_expenses">;
export type Supplier = Tables<"suppliers">;
export type WaitlistItem = Tables<"waitlist">;
export type AppointmentBalance = Tables<"appointment_balances">;

export type TreatmentWithCosts = Treatment & { costs: TreatmentCost[] };

/** Turno con lo necesario para pintarlo en el calendario. */
export type CalendarAppointment = Appointment & {
  patient: Pick<Patient, "id" | "full_name" | "phone"> | null;
  treatment: Pick<Treatment, "id" | "name" | "color" | "kind" | "duration_min"> | null;
  payments: Pick<Payment, "amount_ars" | "amount_usd">[];
};

export type PaymentWithRefs = Payment & {
  patient: Pick<Patient, "id" | "full_name"> | null;
  appointment: (Pick<Appointment, "id" | "starts_at"> & { treatment: Pick<Treatment, "name" | "color"> | null }) | null;
};

export type ExpenseWithRefs = Expense & {
  supplier: Pick<Supplier, "id" | "name"> | null;
};

export type WaitlistWithRefs = WaitlistItem & {
  patient: Pick<Patient, "id" | "full_name" | "phone"> | null;
  treatment: Pick<Treatment, "id" | "name" | "color" | "kind" | "duration_min" | "price" | "currency"> | null;
};

export const STATUS_META: Record<
  AppointmentStatus,
  { label: string; short: string; tone: "neutral" | "info" | "accent" | "success" | "warning" | "danger" }
> = {
  pendiente: { label: "Pendiente", short: "Sin confirmar", tone: "neutral" },
  confirmado: { label: "Confirmado", short: "Confirmado", tone: "info" },
  en_sala: { label: "En sala", short: "En sala de espera", tone: "accent" },
  atendido: { label: "Atendido", short: "Atendido", tone: "success" },
  ausente: { label: "Ausente", short: "No vino", tone: "warning" },
  cancelado: { label: "Cancelado", short: "Cancelado", tone: "danger" },
};

export const STATUS_ORDER: AppointmentStatus[] = ["pendiente", "confirmado", "en_sala", "atendido", "ausente", "cancelado"];

export const KIND_META: Record<TreatmentKind, { label: string; plural: string }> = {
  cirugia: { label: "Cirugía", plural: "Cirugías" },
  procedimiento: { label: "Procedimiento", plural: "Procedimientos" },
  consulta: { label: "Consulta", plural: "Consultas y controles" },
};

export const METHOD_META: Record<PaymentMethod, { label: string }> = {
  efectivo: { label: "Efectivo" },
  transferencia: { label: "Transferencia" },
  debito: { label: "Débito" },
  credito: { label: "Crédito" },
  mercadopago: { label: "Mercado Pago" },
  otro: { label: "Otro" },
};

export const METHOD_ORDER: PaymentMethod[] = ["efectivo", "transferencia", "mercadopago", "debito", "credito", "otro"];

export const PATIENT_SOURCES = ["Instagram", "Recomendación", "Google", "Otro paciente", "Facebook / TikTok", "Otro"] as const;

export const EXPENSE_CATEGORIES = [
  "Alquiler y expensas",
  "Sueldos y cargas",
  "Servicios",
  "Insumos",
  "Clínica y quirófano",
  "Honorarios médicos",
  "Implantes",
  "Honorarios",
  "Marketing",
  "Seguros",
  "Impuestos",
  "Equipamiento",
  "Capacitación",
  "Otros",
] as const;

export const SUPPLIER_CATEGORIES = [
  "Clínica y quirófano",
  "Honorarios médicos",
  "Implantes",
  "Insumos",
  "Laboratorio",
  "Servicios",
  "Marketing",
  "Otros",
] as const;
