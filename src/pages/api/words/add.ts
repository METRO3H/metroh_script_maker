// src/pages/api/words/add.ts
// Agrega palabras personalizadas (las repetidas se ignoran).
import type { APIRoute } from "astro";
import { z } from "zod";
import { require_auth } from "@utils/auth";

const AddWordsSchema = z.object({
  lang: z.enum(["es", "en"]),
  words: z
    .array(
      z
        .string()
        .trim()
        .min(2, "La palabra es demasiado corta")
        .max(40, "La palabra es demasiado larga")
        // Solo letras (con tildes): sin espacios, números ni signos.
        .regex(/^[\p{L}\p{M}]+$/u, "La palabra solo puede tener letras"),
    )
    .min(1, "No hay palabras para agregar")
    .max(500, "Demasiadas palabras en una sola petición"),
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

  const result = AddWordsSchema.safeParse(body);
  if (!result.success) {
    return new Response(result.error.issues.map((e) => e.message).join(", "), { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("add_custom_words", {
    p_lang: result.data.lang,
    p_words: result.data.words,
  });
  if (error) return new Response(error.message, { status: 500 });

  return new Response(JSON.stringify({ added: data ?? 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
