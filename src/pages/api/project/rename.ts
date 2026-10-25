
// src/pages/api/project/rename.ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { require_auth } from "@utils/auth";
import { server_error } from "@utils/api";

const RenameProjectSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(1, "El nombre es requerido").max(120, "El nombre es demasiado largo"),
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

  const result = RenameProjectSchema.safeParse(body);
  if (!result.success) {
    return new Response(result.error.issues.map((e) => e.message).join(", "), { status: 400 });
  }

  const { error } = await auth.supabase.rpc("rename_project", {
    p_project_id: result.data.project_id,
    p_name: result.data.name,
  });
  if (error) return server_error("project/rename", error, error.code === "23505" ? 409 : 500);

  return new Response(null, { status: 204 });
};


