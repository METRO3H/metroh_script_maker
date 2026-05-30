// src/utils/auth.ts
// Helper centralizado de autenticación — elimina la repetición en cada route/page

import type { AstroCookies } from "astro";
import { supabase } from "@supabase/supabase";

/**
 * Verifica la sesión del usuario desde las cookies.
 * Si la sesión es válida, renueva los tokens automáticamente.
 * Retorna { user, session } o null si no está autenticado.
 */
export async function require_auth(cookies: AstroCookies) {
  const access_token  = cookies.get("sb-access-token")?.value;
  const refresh_token = cookies.get("sb-refresh-token")?.value;

  if (!access_token || !refresh_token) return null;

  const {
    data: { user, session },
    error,
  } = await supabase.auth.setSession({ access_token, refresh_token });

  if (error || !user || !session) return null;

  // Renovar cookies con tokens frescos en cada request
  cookies.set("sb-access-token", session.access_token, { path: "/" });
  cookies.set("sb-refresh-token", session.refresh_token, { path: "/" });

  return { user, session };
}

/**
 * Elimina las cookies de sesión.
 * Usar antes de redirigir al login cuando la sesión falla.
 */
export function clear_auth(cookies: AstroCookies) {
  cookies.delete("sb-access-token", { path: "/" });
  cookies.delete("sb-refresh-token", { path: "/" });
}