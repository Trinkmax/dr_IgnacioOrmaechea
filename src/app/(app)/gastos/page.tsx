import type { Metadata } from "next";
import { ExpensesView } from "@/components/views/expenses";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Gastos" };

export default function Page() {
  return <ExpensesView />;
}
