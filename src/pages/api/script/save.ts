// src/pages/api/script/save.ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { require_auth } from "@utils/auth";
import { server_error } from "@utils/api";

// ✅ Capa 5 — schema Zod para validar el body
const SaveScriptSchema = z.object({
   script_id: z.string().uuid().nullable().optional(),
   script_name: z.string().min(1, "El nombre es requerido").max(200, "El nombre es demasiado largo"),
   script_name_en: z.string().max(200, "El título en inglés es demasiado largo").nullable().optional(),
   project_id: z.string().uuid().nullable().optional(),
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
            content_en: z.string().min(1).optional(),
            scene_number: z.number().int().positive().optional(),
            // Solo escenas: "all" (solo en la vista de todas las perspectivas)
            // y/o nombres de personaje (también en la perspectiva de cada uno).
            visible_in: z.array(z.string().min(1).max(200)).min(1).max(200).optional(),
            // Solo escenas: id propio, personaje del punto de vista y modo.
            scene_id: z.string().min(1).max(100).optional(),
            pov: z.string().min(1).max(200).optional(),
            mode: z.enum(["render", "static"]).optional(),
         }),
      )
      .min(1, "El script no puede estar vacío"),
}).superRefine((body, ctx) => {
   body.lines.forEach((line, i) => {
      if (line.line_type !== "scene") {
         for (const key of ["visible_in", "scene_id", "pov", "mode"] as const) {
            if (line[key] !== undefined) {
               ctx.addIssue({ code: "custom", message: `${key} solo aplica a escenas`, path: ["lines", i, key] });
            }
         }
         return;
      }
      if (line.pov !== undefined && !body.characters.includes(line.pov)) {
         ctx.addIssue({ code: "custom", message: `pov: "${line.pov}" no es un personaje del script`, path: ["lines", i, "pov"] });
      }
      if (!line.visible_in) return;
      const unknown = line.visible_in.find((p) => p !== "all" && !body.characters.includes(p));
      if (unknown !== undefined) {
         ctx.addIssue({ code: "custom", message: `visible_in: "${unknown}" no es "all" ni un personaje del script`, path: ["lines", i, "visible_in"] });
      }
   });
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
      const message = result.error.issues.map((e) => e.message).join(", ");
      return new Response(message, { status: 400 });
   }

   const { script_id, script_name, script_name_en, project_id, characters, lines } = result.data;

   const { data, error } = await auth.supabase.rpc("upsert_script", {
      p_script_id: script_id ?? null,
      p_script_name: script_name,
      p_script_name_en: script_name_en ?? null,
      p_project_id: project_id ?? null,
      p_characters: characters,
      p_lines: lines,
   });

   if (error) return server_error("script/save", error);

   return new Response(JSON.stringify({ script_id: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
   });
};
