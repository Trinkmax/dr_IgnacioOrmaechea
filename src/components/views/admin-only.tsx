"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useRole } from "@/lib/queries/session";

/** Secciones financieras: solo el administrador (además lo garantiza RLS en la base). */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useRole();
  if (isAdmin) return <>{children}</>;
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4">
      <EmptyState
        icon={<Lock />}
        title="Sección reservada"
        description="Esta información (costos, gastos y rentabilidad) solo la ve el administrador del consultorio."
        action={
          <Link href="/">
            <Button variant="secondary">Volver al inicio</Button>
          </Link>
        }
      />
    </div>
  );
}
