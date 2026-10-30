// Generado desde Supabase (generate_typescript_types). No editar a mano.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          ends_at: string
          id: string
          notes: string | null
          patient_id: string | null
          price: number
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          title: string | null
          treatment_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          ends_at: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          price?: number
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          title?: string | null
          treatment_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          ends_at?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          price?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          title?: string | null
          treatment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          amount_ars: number | null
          amount_usd: number | null
          appointment_id: string | null
          auto_generated: boolean
          category: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          due_on: string
          id: string
          kind: Database["public"]["Enums"]["expense_kind"]
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          paid_on: string | null
          recurring_id: string | null
          supplier_id: string | null
          usd_rate: number
        }
        Insert: {
          amount: number
          amount_ars?: number | null
          amount_usd?: number | null
          appointment_id?: string | null
          auto_generated?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description: string
          due_on?: string
          id?: string
          kind?: Database["public"]["Enums"]["expense_kind"]
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          paid_on?: string | null
          recurring_id?: string | null
          supplier_id?: string | null
          usd_rate?: number
        }
        Update: {
          amount?: number
          amount_ars?: number | null
          amount_usd?: number | null
          appointment_id?: string | null
          auto_generated?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string
          due_on?: string
          id?: string
          kind?: Database["public"]["Enums"]["expense_kind"]
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          paid_on?: string | null
          recurring_id?: string | null
          supplier_id?: string | null
          usd_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "expenses_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          birth_date: string | null
          created_at: string
          created_by: string | null
          dni: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          dni?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          dni?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          amount_ars: number | null
          amount_usd: number | null
          appointment_id: string | null
          concept: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_on: string
          patient_id: string
          usd_rate: number
        }
        Insert: {
          amount: number
          amount_ars?: number | null
          amount_usd?: number | null
          appointment_id?: string | null
          concept?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on?: string
          patient_id: string
          usd_rate?: number
        }
        Update: {
          amount?: number
          amount_ars?: number | null
          amount_usd?: number | null
          appointment_id?: string | null
          concept?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on?: string
          patient_id?: string
          usd_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          due_day: number
          id: string
          sort_order: number
          supplier_id: string | null
        }
        Insert: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description: string
          due_day?: number
          id?: string
          sort_order?: number
          supplier_id?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string
          due_day?: number
          id?: string
          sort_order?: number
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          auto_payables: boolean
          clinic_name: string
          clinic_tagline: string
          day_end: number
          day_start: number
          id: number
          monthly_hours: number
          reminder_template: string
          tax_percent: number
          timezone: string
          updated_at: string
          usd_rate: number
          usd_rate_updated_at: string
        }
        Insert: {
          auto_payables?: boolean
          clinic_name?: string
          clinic_tagline?: string
          day_end?: number
          day_start?: number
          id?: number
          monthly_hours?: number
          reminder_template?: string
          tax_percent?: number
          timezone?: string
          updated_at?: string
          usd_rate?: number
          usd_rate_updated_at?: string
        }
        Update: {
          auto_payables?: boolean
          clinic_name?: string
          clinic_tagline?: string
          day_end?: number
          day_start?: number
          id?: number
          monthly_hours?: number
          reminder_template?: string
          tax_percent?: number
          timezone?: string
          updated_at?: string
          usd_rate?: number
          usd_rate_updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          active: boolean
          category: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tax_id: string | null
        }
        Insert: {
          active?: boolean
          category?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
        }
        Relationships: []
      }
      treatment_costs: {
        Row: {
          amount: number
          concept: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          sort_order: number
          supplier_id: string | null
          treatment_id: string
        }
        Insert: {
          amount?: number
          concept: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          sort_order?: number
          supplier_id?: string | null
          treatment_id: string
        }
        Update: {
          amount?: number
          concept?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          sort_order?: number
          supplier_id?: string | null
          treatment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_costs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_costs_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          active: boolean
          color: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          duration_min: number
          id: string
          kind: Database["public"]["Enums"]["treatment_kind"]
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          duration_min?: number
          id?: string
          kind?: Database["public"]["Enums"]["treatment_kind"]
          name: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          duration_min?: number
          id?: string
          kind?: Database["public"]["Enums"]["treatment_kind"]
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          patient_id: string
          treatment_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          treatment_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          treatment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      appointment_balances: {
        Row: {
          balance: number | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          id: string | null
          paid: number | null
          patient_id: string | null
          price: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["appointment_status"] | null
          treatment_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "asistente"
      appointment_status:
        | "pendiente"
        | "confirmado"
        | "en_sala"
        | "atendido"
        | "ausente"
        | "cancelado"
      currency_code: "ARS" | "USD"
      expense_kind: "fijo" | "variable"
      payment_method:
        | "efectivo"
        | "transferencia"
        | "debito"
        | "credito"
        | "mercadopago"
        | "otro"
      treatment_kind: "cirugia" | "procedimiento" | "consulta"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "asistente"],
      appointment_status: [
        "pendiente",
        "confirmado",
        "en_sala",
        "atendido",
        "ausente",
        "cancelado",
      ],
      currency_code: ["ARS", "USD"],
      expense_kind: ["fijo", "variable"],
      payment_method: [
        "efectivo",
        "transferencia",
        "debito",
        "credito",
        "mercadopago",
        "otro",
      ],
      treatment_kind: ["cirugia", "procedimiento", "consulta"],
    },
  },
} as const
