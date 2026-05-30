// src/supabase/supabase.ts
import { createClient } from "@supabase/supabase-js";

// ✅ Capa 5 — importar desde astro:env/server en lugar de import.meta.env
// Garantiza que las variables estén presentes en build time (falla rápido si faltan)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "astro:env/server";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);