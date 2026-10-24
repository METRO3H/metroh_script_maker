// src/pages/api/words/delete.ts
// Quita una palabra personalizada.
import type { APIRoute } from "astro";
import { z } from "zod";
import { require_auth } from "@utils/auth";

const DeleteWordSchema = z.object({
  lang: z.enum(["es", "en"]),
  word: z.string().trim().min(1).max(40),
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

  const result = DeleteWordSchema.safeParse(body);
  if (!result.success) {
    return new Response(result.error.issues.map((e) => e.message).join(", "), { status: 400 });
  }

  const { error } = await auth.supabase.rpc("delete_custom_word", {
    p_lang: result.data.lang,
    p_word: result.data.word,
  });
  if (error) return new Response(error.message, { status: 500 });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
