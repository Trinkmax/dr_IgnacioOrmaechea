import type { Metadata } from "next";
import { DashboardView } from "@/components/views/dashboard";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Inicio" };

export default function Page() {
  return <DashboardView />;
}
