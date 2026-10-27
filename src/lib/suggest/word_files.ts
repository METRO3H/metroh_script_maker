// src/lib/suggest/word_files.ts
// Qué archivos de texto alimentan las sugerencias de palabras de cada idioma.
// Los archivos viven en src/assets/words/ y se importan con `?url`: el build los
// copia a _astro/ con un hash de su contenido en el nombre (es.3fa9c1.txt). Ese
// hash es lo que permite cachearlos para siempre (ver word_cache.ts): si el
// archivo cambia, cambia su URL y se descarga de nuevo.
//
// Los descarga y procesa el Web Worker (ver suggest.worker.ts), no el hilo principal.
//
//   <idioma>.txt         nivel 1: las 30 000 palabras más frecuentes (~115 KB comprimido)
//   <idioma>.rest.txt    nivel 2: el resto del diccionario
//   <idioma>.custom.txt  tus palabras propias (se edita a mano)
//
// Los dos primeros se generan con scripts/build_spanish_words.py y
// scripts/split_words.py. Se cargan en ese orden para poder sugerir apenas llega
// el nivel 1, mientras el resto se descarga; el resultado final es idéntico a
// haber cargado un solo archivo. Las palabras propias van al final.
//
// El español se carga al abrir el editor; el inglés solo cuando se necesita
// (al abrir la pestaña English o al guardar texto en inglés).
//
// Además, las palabras que la persona usa en sus guiones y no existen en el
// diccionario se guardan en su cuenta (ver learned_words.ts).
//
// Para sumar otro archivo (por ejemplo, un glosario de tu historia), ponlo en
// src/assets/words/, impórtalo acá con `?url&no-inline` y agrégalo a la lista.

import type { WordLang } from "./learned_words";
import type { SuggestClient } from "./suggest.client";

import es_url from "@assets/words/es.txt?url&no-inline";
import es_rest_url from "@assets/words/es.rest.txt?url&no-inline";
import es_custom_url from "@assets/words/es.custom.txt?url&no-inline";
import en_url from "@assets/words/en.txt?url&no-inline";
import en_rest_url from "@assets/words/en.rest.txt?url&no-inline";
import en_custom_url from "@assets/words/en.custom.txt?url&no-inline";

export interface WordFile {
  /** URL del archivo (con hash de contenido en producción). */
  url: string;
  /** Nombre fijo con el que se guarda en la caché local. Una entrada por archivo. */
  key: string;
  /** Puntaje fijo para todas las palabras del archivo (si no, cuenta el orden por frecuencia). */
  score?: number;
}

export const WORD_FILES: Record<WordLang, WordFile[]> = {
  es: [
    { url: es_url, key: "es.txt" },
    { url: es_rest_url, key: "es.rest.txt" },
    // Puntaje fijo y alto: lo que se agrega a mano tiene prioridad.
    { url: es_custom_url, key: "es.custom.txt", score: 4.5 },
  ],
  en: [
    { url: en_url, key: "en.txt" },
    { url: en_rest_url, key: "en.rest.txt" },
    { url: en_custom_url, key: "en.custom.txt", score: 4.5 },
  ],
};

/**
 * Pide al worker los archivos de un idioma, de a uno y en orden (el nivel 1
 * llega antes y no compite por la red con el resto). `on_file` se llama cada
 * vez que se termina de cargar uno, para volver a pedir las sugerencias del
 * texto actual sin esperar a todos. Si un archivo falla (sin red, archivo
 * borrado) se ignora: las sugerencias siguen con lo que se aprende del guion.
 *
 * En desarrollo no se usa la caché: ahí la URL no lleva hash y el archivo
 * cambia cuando lo editas.
 */
export async function load_word_files(
  client: SuggestClient,
  lang: WordLang,
  on_file?: () => void,
  files: WordFile[] = WORD_FILES[lang],
): Promise<void> {
  for (const file of files) {
    const cache_key = import.meta.env.DEV ? undefined : file.key;
    const loaded = await client.load_file(lang, file.url, file.score, cache_key);
    if (loaded) on_file?.();
  }
}
