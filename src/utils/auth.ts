

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
    data: { user: verified_user, session: verified_session },
    error,
  } = await supabase.auth.setSession({ access_token, refresh_token });

  if (error || !verified_user || !verified_session) return null;

  const user = verified_user;
  let session = verified_session;

  // Si al access token le quedan menos de ~90 s, supabase-js lo renueva por su
  // cuenta en mitad del primer `.rpc(...)`; el servidor rota entonces el
  // refresh token y la cookie se quedaba con el viejo (inservible en la
  // siguiente petición). Pidiendo la sesión AQUÍ, la renovación (si hace falta)
  // ocurre una sola vez y antes de escribir las cookies. Con un token vigente
  // no hace ninguna llamada de red. Si la renovación falla, se sigue con la
  // sesión ya verificada.
  const { data: current } = await supabase.auth.getSession();
  if (current.session) session = current.session;

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



