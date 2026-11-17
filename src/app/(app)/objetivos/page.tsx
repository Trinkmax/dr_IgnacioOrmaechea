import type { Metadata } from "next";
import { AdminOnly } from "@/components/views/admin-only";
import { GoalsView } from "@/components/views/goals";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Objetivos" };

export default function Page() {
  return (
    <AdminOnly>
      <GoalsView />
    </AdminOnly>
  );
}
