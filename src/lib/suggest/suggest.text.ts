// src/lib/suggest/suggest.text.ts
// Utilidades de texto puras que NO dependen del diccionario. Viven aparte del
// motor para que el hilo principal (el store) las use sin importar el motor
// completo, que corre dentro del Web Worker.

export const TRAILING_WORD_RE = /[\p{L}\p{M}'’-]+$/u;

/** ¿El texto termina en una palabra? Si no (vacío, espacio, signo), no hay nada que sugerir. */
export function has_trailing_word(input: string): boolean {
  return TRAILING_WORD_RE.test(input);
}

/** Reemplaza la última palabra de `input` por `word` y deja un espacio. */
export function apply_word(input: string, word: string): string {
  return input.replace(TRAILING_WORD_RE, "") + word + " ";
}
