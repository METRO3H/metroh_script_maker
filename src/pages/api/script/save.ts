
// src/pages/api/script/save.ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { require_auth } from "@utils/auth";

// ✅ Capa 5 — schema Zod para validar el body
const SaveScriptSchema = z.object({
   script_id: z.string().uuid().nullable().optional(),
   script_name: z.string().min(1, "El nombre es requerido").max(200, "El nombre es demasiado largo"),
   characters: z
      .array(z.string().min(1, "El nombre del personaje no puede estar vacío"))
      .min(1, "Se requiere al menos un personaje"),
   lines: z
      .array(
         z.object({
            line_number: z.number().int().positive(),
            line_type: z.enum(["dialogue", "thought", "narration", "context", "scene"]),
            character_name: z.string().min(1).optional(),
            content: z.string().min(1).optional(),
            scene_number: z.number().int().positive().optional(),
         }),
      )
      .min(1, "El script no puede estar vacío"),
});

export const POST: APIRoute = async ({ request, cookies }) => {
   // ✅ Capa 5 — helper centralizado de auth
   const auth = await require_auth(cookies);
   if (!auth) return new Response("Unauthorized", { status: 401 });

   // Parsear y validar con Zod
   let body: unknown;
   try {
      body = await request.json();
   } catch {
      return new Response("JSON inválido", { status: 400 });
   }

   const result = SaveScriptSchema.safeParse(body);
   if (!result.success) {
      const message = result.error.errors.map((e) => e.message).join(", ");
      return new Response(message, { status: 400 });
   }

   const { script_id, script_name, characters, lines } = result.data;

   const { data, error } = await auth.supabase.rpc("upsert_script", {
      p_script_id: script_id ?? null,
      p_script_name: script_name,
      p_characters: characters,
      p_lines: lines,
   });

   if (error) return new Response(error.message, { status: 500 });

   return new Response(JSON.stringify({ script_id: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
   });
};

export const GET: APIRoute = async () => {
   return new Response("save.ts funciona", { status: 200 });
};


