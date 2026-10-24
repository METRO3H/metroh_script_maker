// src/lib/suggest/learned_words.ts
// Palabras personalizadas del usuario: las que usó en sus guiones y que NO
// existen en el diccionario (nombres, jerga, términos inventados). Viven en la
// base de datos (tabla custom_words, por cuenta e idioma) para que acompañen a
// la persona en cualquier dispositivo.
//
// Todas las funciones son tolerantes a fallos: sin red o sin sesión devuelven
// vacío / false y las sugerencias siguen funcionando con el diccionario.

export type WordLang = "es" | "en";

const CHUNK = 500; // tope por petición (lo valida también la API)

// Versión anterior: las palabras se guardaban solo en este navegador.
const LEGACY_KEY = "metroh:learned_words:v1";

export async function fetch_custom_words(): Promise<Record<WordLang, string[]>> {
  const out: Record<WordLang, string[]> = { es: [], en: [] };
  try {
    const res = await fetch("/api/words/list");
    if (!res.ok) return out;
    const rows: { lang: WordLang; word: string }[] = await res.json();
    for (const r of rows) if (r.lang === "es" || r.lang === "en") out[r.lang].push(r.word);
  } catch {
    /* sin red: se sigue sin palabras personalizadas */
  }
  return out;
}

/** Devuelve true si TODAS las peticiones salieron bien. */
export async function add_custom_words(lang: WordLang, words: string[]): Promise<boolean> {
  try {
    for (let i = 0; i < words.length; i += CHUNK) {
      const res = await fetch("/api/words/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, words: words.slice(i, i + CHUNK) }),
      });
      if (!res.ok) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function delete_custom_word(lang: WordLang, word: string): Promise<boolean> {
  try {
    const res = await fetch("/api/words/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, word }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sube a la cuenta las palabras que una versión anterior guardó solo en este
 * navegador y limpia ese almacenamiento. Devuelve las palabras migradas (para
 * sumarlas de inmediato) o [] si no había nada o falló (se reintenta después).
 */
export async function migrate_legacy_words(): Promise<string[]> {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]");
    const words: string[] = Array.isArray(raw) ? raw.filter((w) => typeof w === "string" && /^[\p{L}\p{M}]{2,40}$/u.test(w)) : [];
    if (words.length === 0) {
      localStorage.removeItem(LEGACY_KEY);
      return [];
    }
    // Las palabras viejas eran de la pestaña Español.
    if (!(await add_custom_words("es", words))) return [];
    localStorage.removeItem(LEGACY_KEY);
    return words;
  } catch {
    return [];
  }
}
