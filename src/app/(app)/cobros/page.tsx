import type { Metadata } from "next";
import { PaymentsView } from "@/components/views/payments";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Cobros" };

export default function Page() {
  return <PaymentsView />;
}
