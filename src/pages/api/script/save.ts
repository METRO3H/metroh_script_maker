import type { APIRoute } from "astro";
import { supabase } from "@supabase/supabase";

export const POST: APIRoute = async ({ request, cookies }) => {
  // Verificar sesión
  const access_token = cookies.get("sb-access-token")?.value;
  const refresh_token = cookies.get("sb-refresh-token")?.value;

  if (!access_token || !refresh_token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Parsear el body
  const { script_name, characters, lines } = await request.json();

  if (!script_name || !characters?.length || !lines?.length) {
    return new Response("Datos incompletos", { status: 400 });
  }

  // Llamar al procedure
  const { data, error } = await supabase.rpc("save_script", {
    p_user_id: user.id,
    p_script_name: script_name,
    p_characters: characters,          // ["Juan", "Maria", ...]
    p_lines: lines,                    // [{character_name, line_number, content}]
  });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return new Response(JSON.stringify({ script_id: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const GET: APIRoute = async () => {
    console.log("bob")
  return new Response("save.ts funciona", { status: 200 });
};