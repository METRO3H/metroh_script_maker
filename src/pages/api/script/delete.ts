// src/pages/api/script/delete.ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { supabase } from "@supabase/supabase";
import { require_auth } from "@utils/auth";

const DeleteScriptSchema = z.object({
  script_id: z.string().uuid(),
});

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await require_auth(cookies);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const result = DeleteScriptSchema.safeParse(body);
  if (!result.success) {
    return new Response("script_id inválido", { status: 400 });
  }

  const { error } = await supabase.rpc("delete_script", {
    p_script_id: result.data.script_id,
  });

  if (error) return new Response(error.message, { status: 500 });

  return new Response(null, { status: 204 });
};