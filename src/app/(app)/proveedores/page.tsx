import type { Metadata } from "next";
import { SuppliersView } from "@/components/views/suppliers";

// Renderizado en el cliente (ver (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Proveedores" };

export default function Page() {
  return <SuppliersView />;
}
