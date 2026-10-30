import type { Metadata } from "next";
import { SettingsView } from "@/components/views/settings";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Ajustes" };

export default function Page() {
  return <SettingsView />;
}
