
// src/pages/api/words/list.ts
// Palabras personalizadas del usuario (todas, de ambos idiomas).
import type { APIRoute } from "astro";
import { require_auth } from "@utils/auth";
import { server_error } from "@utils/api";

export const GET: APIRoute = async ({ cookies }) => {
  const auth = await require_auth(cookies);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await auth.supabase.rpc("get_custom_words");
  if (error) return server_error("words/list", error);

  return new Response(JSON.stringify(data ?? []), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};


