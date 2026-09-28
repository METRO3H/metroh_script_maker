
import type { APIRoute } from "astro";
import { create_supabase_client } from "@supabase/supabase";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return new Response("Email and password are required", { status: 400 });
  }

  // Cliente propio de este request: nunca reutilizar una instancia compartida,
  // porque signInWithPassword muta el estado interno del cliente.
  const supabase = create_supabase_client();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return new Response(error.message, { status: 401 });
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


