
// Archivos importados como URL con hash, sin incrustarlos en el JS (ver word_files.ts).
declare module "*?url&no-inline" {
  const url: string;
  export default url;
}

interface ImportMetaEnv {
  readonly SUPABASE_URL: string
  readonly SUPABASE_ANON_KEY: string
  /** true en `astro dev`, false en el build (lo define Vite). */
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

