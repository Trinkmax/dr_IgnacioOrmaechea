import { AppShell } from "@/components/shell/app-shell";

// La app autenticada se renderiza en el cliente (datos vía React Query con RLS);
// el shell estático no incluye las páginas, así que no aplica la validación de "instant".
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
