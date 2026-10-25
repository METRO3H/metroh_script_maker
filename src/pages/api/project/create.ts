
// src/pages/api/project/create.ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { require_auth } from "@utils/auth";
import { server_error } from "@utils/api";

const CreateProjectSchema = z.object({
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

  const result = CreateProjectSchema.safeParse(body);
  if (!result.success) {
    return new Response(result.error.issues.map((e) => e.message).join(", "), { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("create_project", { p_name: result.data.name });
  if (error) {
    // 23505 = unique_violation (ya existe un proyecto con ese nombre)
    return server_error("project/create", error, error.code === "23505" ? 409 : 500);
  }

  return new Response(JSON.stringify({ project_id: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};


