

import type { APIRoute } from "astro";
import { create_supabase_client } from "@supabase/supabase";

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return redirect("/auth/register?error=missing");
  }

  // Cliente propio de este request: nunca reutilizar una instancia compartida.
  const supabase = create_supabase_client();

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    const key =
      error.code === "user_already_exists" ? "exists"
      : error.code === "weak_password" ? "weak"
      : error.code === "email_address_invalid" || error.code === "validation_failed" ? "email"
      : error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" ? "rate"
      : "unknown";
    if (key === "unknown") console.error("[auth/register]", error);
    return redirect(`/auth/register?error=${key}`);
  }

  return redirect("/auth/login");
};




