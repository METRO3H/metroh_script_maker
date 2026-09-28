
import type { APIRoute } from "astro";
import { clear_auth } from "@utils/auth";

// POST en vez de GET: cerrar sesión es una acción con efecto secundario,
// no debe poder dispararse desde un <img src="..."> o un link de un tercero.
export const POST: APIRoute = async ({ cookies, redirect }) => {
  clear_auth(cookies);
  return redirect("/auth/login");
};


