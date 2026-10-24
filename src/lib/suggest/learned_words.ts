// src/lib/suggest/learned_words.ts
// Palabras que la persona usó en sus guiones y que NO existen en el
// diccionario español (nombres, jerga, términos inventados). Se guardan al
// guardar el guion y se cargan al abrir el editor, para que se sugieran
// también en otros guiones. Viven en el navegador (localStorage): es por
// dispositivo, no por cuenta.

const STORAGE_KEY = "metroh:learned_words:v1";
export const MAX_LEARNED_WORDS = 5000;

export function load_learned_words(): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((w) => typeof w === "string" && w.length > 0) : [];
  } catch {
    return [];
  }
}

export function save_learned_words(words: string[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words.slice(-MAX_LEARNED_WORDS)));
  } catch {
    /* almacenamiento lleno o bloqueado: las sugerencias siguen sin persistir */
  }
}
