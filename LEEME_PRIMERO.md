# Cambios: sugerencias, tabs Español | English y proyectos

Copia estos archivos sobre tu proyecto respetando las rutas.

## 1. Base de datos (primero)
Ya tienes datos, así que **NO ejecutes `init.sql`** (borra todo).
Ejecuta en el SQL Editor de Supabase, completo y una sola vez:

    src/supabase/migration_001_projects_and_english.sql

No borra nada: agrega `projects`, `scripts.project_id`, `scripts.name_en`
y `script_lines.content_en`, y reemplaza las funciones RPC.
Es seguro ejecutarla más de una vez. Tus scripts quedan "Sin proyecto"
y con 0 líneas traducidas.

## 2. Código
Copia todo `src/`, `package.json` y `README.md`.

Borra lo que ya no se usa (el autocompletado con IA):

    src/lib/predictor/            (carpeta completa)
    src/components/PredictorToggle.svelte

Luego `npm install` (quita `@mlc-ai/web-llm` del lockfile).

## 3. Qué cambió
- Barra de sugerencias sobre el input (completar palabra / corregir tipeo).
  Local, sin IA. Toca el chip, o `Tab` para el primero.
- Tabs Español | English. La estructura es una sola; el inglés es solo el
  texto de cada línea y el título. `Enter` salta a la siguiente línea.
- Proyectos: se crean/renombran/borran desde "Mis scripts"; el script elige
  su proyecto en el encabezado del editor. Borrar un proyecto NO borra scripts.
- Bug corregido de paso: `save.ts` usaba `error.errors`, que no existe en
  Zod 4 (tu versión); ahora usa `error.issues`.
