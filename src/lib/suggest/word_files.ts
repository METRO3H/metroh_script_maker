// src/lib/suggest/word_files.ts
// Qué archivos de texto alimentan las sugerencias de palabras de cada idioma.
// Los archivos viven en /public/words/ (se sirven tal cual, no van dentro del
// código JS). Los descarga y procesa el Web Worker (ver suggest.worker.ts), no
// el hilo principal.
//
//   <idioma>.txt         diccionario base (generado, ordenado por frecuencia)
//   <idioma>.custom.txt  tus palabras propias (se edita a mano)
//
// El español se carga al abrir el editor; el inglés solo cuando se necesita
// (al abrir la pestaña English o al guardar texto en inglés).
//
// Además, las palabras que la persona usa en sus guiones y no existen en el
// diccionario se guardan en su cuenta (ver learned_words.ts).
//
// Para sumar otro archivo (por ejemplo, un glosario de tu historia), agrégalo acá.

import type { WordLang } from "./learned_words";
import type { SuggestClient } from "./suggest.client";

export interface WordFile {
  url: string;
  /** Puntaje fijo para todas las palabras del archivo (si no, cuenta el orden por frecuencia). */
  score?: number;
}

export const WORD_FILES: Record<WordLang, WordFile[]> = {
  es: [
    { url: "/words/es.txt" },
    // Puntaje fijo y alto: lo que se agrega a mano tiene prioridad.
    { url: "/words/es.custom.txt", score: 4.5 },
  ],
  en: [
    { url: "/words/en.txt" },
    { url: "/words/en.custom.txt", score: 4.5 },
  ],
};

/**
 * Pide al worker los archivos de un idioma. Si uno falla (sin red, archivo
 * borrado) se ignora: las sugerencias siguen funcionando con lo que se aprende
 * del propio guion.
 */
export async function load_word_files(
  client: SuggestClient,
  lang: WordLang,
  files: WordFile[] = WORD_FILES[lang],
): Promise<void> {
  await Promise.all(files.map((file) => client.load_file(lang, file.url, file.score)));
}
