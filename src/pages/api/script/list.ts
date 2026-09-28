
// src/pages/api/script/list.ts
import type { APIRoute } from "astro";
import { require_auth } from "@utils/auth";

export const GET: APIRoute = async ({ cookies }) => {
  // ✅ Capa 5 — helper centralizado de auth
  const auth = await require_auth(cookies);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await auth.supabase.rpc("get_user_scripts");
  if (error) return new Response(error.message, { status: 500 });

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

