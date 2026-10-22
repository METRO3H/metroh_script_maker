// src/pages/api/project/delete.ts
// Borra solo el proyecto: sus scripts quedan "sin proyecto" (ON DELETE SET NULL).
import type { APIRoute } from "astro";
import { z } from "zod";
import { require_auth } from "@utils/auth";

const DeleteProjectSchema = z.object({ project_id: z.string().uuid() });

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await require_auth(cookies);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const result = DeleteProjectSchema.safeParse(body);
  if (!result.success) return new Response("project_id inválido", { status: 400 });

  const { error } = await auth.supabase.rpc("delete_project", { p_project_id: result.data.project_id });
  if (error) return new Response(error.message, { status: 500 });

  return new Response(null, { status: 204 });
};
