// src/lib/suggest/word_files.ts
// Qué archivos de texto alimentan las sugerencias de palabras de cada idioma.
// Los archivos viven en /public/words/ (se sirven tal cual, no van dentro del
// código JS) y se descargan una sola vez al abrir el editor; el navegador los
// cachea.
//
//   <idioma>.txt         diccionario base (generado, ordenado por frecuencia)
//   <idioma>.custom.txt  tus palabras propias (se edita a mano)
//
// Además, las palabras que la persona usa en sus guiones y no existen en el
// diccionario se guardan en su cuenta (ver learned_words.ts).
//
// Para sumar otro archivo (por ejemplo, un glosario de tu historia), agrégalo acá.

import type { Suggester, LoadWordsOptions } from "./suggest.engine";
import type { WordLang } from "./learned_words";

export interface WordFile {
  url: string;
  options?: LoadWordsOptions;
}

export const WORD_FILES: Record<WordLang, WordFile[]> = {
  es: [
    { url: "/words/es.txt" },
    // Puntaje fijo y alto: lo que se agrega a mano tiene prioridad.
    { url: "/words/es.custom.txt", options: { score: 4.5 } },
  ],
  en: [
    { url: "/words/en.txt" },
    { url: "/words/en.custom.txt", options: { score: 4.5 } },
  ],
};

/**
 * Descarga los archivos de un idioma y los carga en su suggester. Si uno falla
 * (sin red, archivo borrado) se ignora: las sugerencias siguen funcionando con
 * lo que se aprende del propio guion. `on_loaded` avisa cada vez que entra un
 * archivo.
 */
export async function load_word_files(
  suggester: Suggester,
  lang: WordLang,
  on_loaded: () => void,
  files: WordFile[] = WORD_FILES[lang],
): Promise<void> {
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
