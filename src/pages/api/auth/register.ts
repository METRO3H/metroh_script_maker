
import type { APIRoute } from "astro";
import { create_supabase_client } from "@supabase/supabase";

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return new Response("Email and password are required", { status: 400 });
  }

  // Cliente propio de este request: nunca reutilizar una instancia compartida.
  const supabase = create_supabase_client();

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    console.log(error);
    return new Response(error.message, { status: 400 });
  }

  return redirect("/auth/login");
};


