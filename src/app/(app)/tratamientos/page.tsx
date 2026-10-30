import type { Metadata } from "next";
import { TreatmentsView } from "@/components/views/treatments";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Tratamientos" };

export default function Page() {
  return <TreatmentsView />;
}
