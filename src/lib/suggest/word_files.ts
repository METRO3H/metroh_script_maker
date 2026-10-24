// src/lib/suggest/word_files.ts
// Qué archivos de texto alimentan las sugerencias de palabras. Los archivos
// viven en /public/words/ (se sirven tal cual, no van dentro del código JS) y
// se descargan una sola vez al abrir el editor; el navegador los cachea.
//
//   es.txt         diccionario base (generado, ordenado por frecuencia)
//   es.custom.txt  tus palabras propias (se edita a mano)
//
// Para sumar otro archivo (por ejemplo, un glosario de tu historia), agrégalo acá.

import type { Suggester, LoadWordsOptions } from "./suggest.engine";

export interface WordFile {
  url: string;
  options?: LoadWordsOptions;
}

export const WORD_FILES: WordFile[] = [
  { url: "/words/es.txt" },
  // Puntaje fijo y alto: lo que se agrega a mano tiene prioridad.
  { url: "/words/es.custom.txt", options: { score: 4.5 } },
];

/**
 * Descarga los archivos y los carga en el suggester. Si uno falla (sin red,
 * archivo borrado) se ignora: las sugerencias siguen funcionando con lo que se
 * aprende del propio guion. `on_loaded` avisa cada vez que entra un archivo.
 */
export async function load_word_files(suggester: Suggester, on_loaded: () => void, files: WordFile[] = WORD_FILES): Promise<void> {
  if (typeof window === "undefined") return; // render en el servidor: no hay nada que cargar
  await Promise.all(
    files.map(async (file) => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        suggester.load_words(await res.text(), file.options);
        on_loaded();
      } catch (err) {
        console.warn(`[sugerencias] no se pudo cargar ${file.url}:`, err);
      }
    }),
  );
}
