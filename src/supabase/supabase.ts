
// src/supabase/supabase.ts
import { createClient } from "@supabase/supabase-js";

// ✅ Capa 5 — importar desde astro:env/server en lugar de import.meta.env
// Garantiza que las variables estén presentes en build time (falla rápido si faltan)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "astro:env/server";

/**
 * Crea una instancia NUEVA del cliente de Supabase.
 *
 * ⚠️ No exportar un cliente único a nivel de módulo (singleton) y reutilizarlo
 * entre requests: `auth.setSession()` / `signInWithPassword()` mutan el estado
 * interno del cliente. Si dos requests de usuarios distintos corren en paralelo
 * sobre el mismo proceso Node y comparten un cliente, uno puede pisar la sesión
 * del otro justo antes de un `.rpc(...)`, haciendo que `auth.uid()` resuelva al
 * usuario equivocado del lado de Postgres. Cada request debe pedir su propio
 * cliente con esta función.
 */
export function create_supabase_client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

