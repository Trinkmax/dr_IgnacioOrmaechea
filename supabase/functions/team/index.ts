// Gestión del equipo del consultorio.
// - status / bootstrap: públicos, solo sirven mientras no exista ningún miembro
//   (alta inicial del doctor como administrador).
// - create / update / remove: exigen una sesión de un miembro con rol admin.
// - update-self: cualquier miembro puede cambiar su propio nombre.
// verify_jwt está desactivado porque bootstrap se llama sin sesión; la
// autenticación se valida acá adentro con auth.getUser(token).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

type Role = "admin" | "asistente";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function serviceKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      if (keys.default) return keys.default;
    } catch {
      // cae al service_role legacy
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("Falta la clave de servicio");
  return legacy;
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 120) throw new HttpError(400, "Ingresá un nombre válido.");
  return name;
}

function cleanEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Ingresá un email válido.");
  return email;
}

function cleanPassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8) throw new HttpError(400, "La contraseña debe tener al menos 8 caracteres.");
  if (password.length > 72) throw new HttpError(400, "La contraseña es demasiado larga.");
  return password;
}

function cleanRole(value: unknown): Role {
  if (value === "admin" || value === "asistente") return value;
  throw new HttpError(400, "Rol inválido.");
}

async function memberCount(): Promise<number> {
  const { count, error } = await admin.from("members").select("user_id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function createMember(input: { email: string; password: string; fullName: string; role: Role }) {
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error || !data.user) {
    const msg = error?.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      throw new HttpError(409, "Ya existe una cuenta con ese email.");
    }
    throw new HttpError(400, error?.message ?? "No se pudo crear la cuenta.");
  }

  const { error: memberError } = await admin.from("members").insert({
    user_id: data.user.id,
    full_name: input.fullName,
    email: input.email,
    role: input.role,
  });
  if (memberError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw memberError;
  }
  return data.user.id;
}

async function getCaller(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Necesitás iniciar sesión.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Tu sesión expiró. Volvé a ingresar.");
  const { data: member, error: memberError } = await admin
    .from("members")
    .select("user_id, role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) throw new HttpError(403, "Tu cuenta no tiene acceso al consultorio.");
  return member as { user_id: string; role: Role };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  try {
    switch (body.action) {
      case "status":
        return json({ needsSetup: (await memberCount()) === 0 });

      case "bootstrap": {
        if ((await memberCount()) > 0) throw new HttpError(409, "El consultorio ya está configurado. Iniciá sesión.");
        const userId = await createMember({
          fullName: cleanName(body.fullName),
          email: cleanEmail(body.email),
          password: cleanPassword(body.password),
          role: "admin",
        });
        return json({ ok: true, userId });
      }

      case "update-self": {
        const caller = await getCaller(req);
        const { error } = await admin
          .from("members")
          .update({ full_name: cleanName(body.fullName) })
          .eq("user_id", caller.user_id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "create": {
        const caller = await getCaller(req);
        if (caller.role !== "admin") throw new HttpError(403, "Solo el administrador puede sumar personas al equipo.");
        const userId = await createMember({
          fullName: cleanName(body.fullName),
          email: cleanEmail(body.email),
          password: cleanPassword(body.password),
          role: cleanRole(body.role),
        });
        return json({ ok: true, userId });
      }

      case "update": {
        const caller = await getCaller(req);
        if (caller.role !== "admin") throw new HttpError(403, "Solo el administrador puede editar el equipo.");
        const userId = typeof body.userId === "string" ? body.userId : "";
        if (!userId) throw new HttpError(400, "Falta el usuario.");

        const patch: Record<string, unknown> = {};
        if (body.fullName !== undefined) patch.full_name = cleanName(body.fullName);
        if (body.role !== undefined) patch.role = cleanRole(body.role);
        if (Object.keys(patch).length > 0) {
          const { error } = await admin.from("members").update(patch).eq("user_id", userId);
          if (error) {
            if (error.message.includes("administrador")) throw new HttpError(409, error.message);
            throw error;
          }
        }
        if (body.password !== undefined) {
          const { error } = await admin.auth.admin.updateUserById(userId, { password: cleanPassword(body.password) });
          if (error) throw new HttpError(400, error.message);
        }
        return json({ ok: true });
      }

      case "remove": {
        const caller = await getCaller(req);
        if (caller.role !== "admin") throw new HttpError(403, "Solo el administrador puede quitar accesos.");
        const userId = typeof body.userId === "string" ? body.userId : "";
        if (!userId) throw new HttpError(400, "Falta el usuario.");
        if (userId === caller.user_id) throw new HttpError(400, "No podés quitarte el acceso a vos mismo.");
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) {
          if (error.message.includes("administrador")) throw new HttpError(409, "Tiene que quedar al menos un administrador.");
          throw new HttpError(400, error.message);
        }
        return json({ ok: true });
      }

      default:
        return json({ error: "Acción desconocida." }, 400);
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    const message = err instanceof Error ? err.message : "Error inesperado.";
    return json({ error: message }, 500);
  }
});
