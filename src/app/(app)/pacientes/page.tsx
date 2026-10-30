import type { Metadata } from "next";
import { PatientsView } from "@/components/views/patients";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Pacientes" };

export default function Page() {
  return <PatientsView />;
}
