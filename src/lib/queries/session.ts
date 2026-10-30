"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";
import type { Member } from "@/lib/types";

export type Me = {
  userId: string | null;
  email: string | null;
  member: Member | null;
};

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async (): Promise<Me> => {
      const sb = getSupabase();
      const { data, error } = await sb.auth.getClaims();
      if (error || !data?.claims?.sub) return { userId: null, email: null, member: null };
      const userId = data.claims.sub;
      const { data: member, error: memberError } = await sb
        .from("members")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (memberError) throw memberError;
      return { userId, email: (data.claims.email as string | undefined) ?? null, member };
    },
    staleTime: 5 * 60_000,
  });
}

/** Rol del usuario actual (solo usar dentro del shell autenticado). */
export function useRole() {
  const { data } = useMe();
  const role = data?.member?.role ?? "asistente";
  return { role, isAdmin: role === "admin", member: data?.member ?? null };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await getSupabase().auth.signOut();
    queryClient.clear();
    // Navegación completa para descartar todo el estado en memoria de la sesión.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  };
}

export type TeamAction =
  | { action: "status" }
  | { action: "bootstrap"; fullName: string; email: string; password: string }
  | { action: "update-self"; fullName: string }
  | { action: "create"; fullName: string; email: string; password: string; role: Member["role"] }
  | { action: "update"; userId: string; fullName?: string; role?: Member["role"]; password?: string }
  | { action: "remove"; userId: string };

/** Llama a la Edge Function "team" y devuelve un error legible si falla. */
export async function callTeam<T = { ok: true }>(body: TeamAction): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke("team", { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const payload = await ctx.json();
        if (payload?.error) message = payload.error;
      } catch {
        // respuesta sin JSON
      }
    }
    throw new Error(message);
  }
  return data as T;
}
