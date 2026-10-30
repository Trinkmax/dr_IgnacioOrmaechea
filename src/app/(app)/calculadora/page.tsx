import type { Metadata } from "next";
import { CalculatorView } from "@/components/views/calculator";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Calculadora de costos" };

export default function Page() {
  return <CalculatorView />;
}
