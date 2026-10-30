import type { Metadata } from "next";
import { AgendaPage } from "@/components/views/agenda";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Agenda" };

export default function Page() {
  return <AgendaPage />;
}
