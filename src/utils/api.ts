// src/utils/api.ts
// Respuestas de error de la API que NO filtran detalles internos al cliente
// (mensajes de Postgres, nombres de tablas/funciones, etc.). El detalle real
// queda en el log del servidor.

export function server_error(
  context: string,
  error: unknown,
  status: number = 500,
): Response {
  console.error(`[api] ${context}:`, error);
  const body = status === 409 ? "Ya existe" : "Error interno";
  return new Response(body, { status });
}
