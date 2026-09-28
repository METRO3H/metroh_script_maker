
// src/utils/auth.ts
// Helper centralizado de autenticación — elimina la repetición en cada route/page

import type { AstroCookies } from "astro";
import { create_supabase_client } from "@supabase/supabase";

const SESSION_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
};

/**
 * Verifica la sesión del usuario desde las cookies.
 * Si la sesión es válida, renueva los tokens automáticamente.
 * Retorna { user, session, supabase } o null si no está autenticado.
 *
 * El cliente `supabase` devuelto es propio de este request (ver
 * create_supabase_client): las rutas deben usar ESE cliente para sus
 * llamadas a `.rpc(...)`, nunca uno compartido, para que `auth.uid()`
 * resuelva siempre al usuario correcto del lado de Postgres.
 */
export async function require_auth(cookies: AstroCookies) {
  const access_token  = cookies.get("sb-access-token")?.value;
  const refresh_token = cookies.get("sb-refresh-token")?.value;

  if (!access_token || !refresh_token) return null;

  const supabase = create_supabase_client();

  const {
    data: { user, session },
    error,
  } = await supabase.auth.setSession({ access_token, refresh_token });

  if (error || !user || !session) return null;

  // Renovar cookies con tokens frescos en cada request
  cookies.set("sb-access-token", session.access_token, SESSION_COOKIE_OPTIONS);
  cookies.set("sb-refresh-token", session.refresh_token, SESSION_COOKIE_OPTIONS);

  return { user, session, supabase };
}

/**
 * Elimina las cookies de sesión.
 * Usar antes de redirigir al login cuando la sesión falla.
 */
export function clear_auth(cookies: AstroCookies) {
  cookies.delete("sb-access-token", { path: "/" });
  cookies.delete("sb-refresh-token", { path: "/" });
}

