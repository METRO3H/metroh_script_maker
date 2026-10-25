

import type { APIRoute } from "astro";
import { create_supabase_client } from "@supabase/supabase";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return redirect("/auth/login?error=missing");
  }

  // Cliente propio de este request: nunca reutilizar una instancia compartida,
  // porque signInWithPassword muta el estado interno del cliente.
  const supabase = create_supabase_client();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    // Códigos de Supabase Auth -> clave corta; la página muestra el texto.
    const key =
      error?.code === "email_not_confirmed" ? "unconfirmed"
      : error?.code === "invalid_credentials" ? "invalid"
      : error && (error.status ?? 0) >= 500 ? "server"
      : "invalid";
    if (error && key !== "invalid") console.error("[auth/login]", error);
    return redirect(`/auth/login?error=${key}`);
  }

  const { access_token, refresh_token } = data.session;
  const cookie_options = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
  };
  cookies.set("sb-access-token", access_token, cookie_options);
  cookies.set("sb-refresh-token", refresh_token, cookie_options);
  return redirect("/scripts");
};




