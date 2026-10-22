// src/lib/suggest/suggest.engine.ts
// Motor de sugerencias de palabras, estilo teclado de celular.
// 100 % local, determinista y sin IA: completa la palabra que se está
// escribiendo y ofrece correcciones cuando parece un error de tipeo.
// Es puro (sin DOM, sin Svelte): se puede testear con Node directamente.
//
// Principios (a propósito conservador):
//   · Nunca modifica el texto por su cuenta: solo ofrece chips y la
//     persona decide si tocarlos.
//   · El vocabulario del propio guion (nombres de personajes incluidos)
//     pesa mucho más que el diccionario base.
//   · No sugiere nada con menos de 2 letras, ni sobre palabras ya completas
//     y conocidas, salvo que haya una variante con tilde.

import { BASE_WORDS } from "./spanish_words";

export type SuggestionKind = "complete" | "fix";

export interface Suggestion {
  word: string;
  kind: SuggestionKind;
}

interface Entry {
  display: string; // forma "bonita" (con tilde / mayúscula de nombre propio)
  score: number;
}

const WORD_RE = /[\p{L}\p{M}'’-]+/gu;
const TRAILING_WORD_RE = /[\p{L}\p{M}'’-]+$/u;

/** Minúsculas y sin tildes, para comparar sin importar acentuación. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Distancia de Damerau-Levenshtein (con transposiciones), con corte temprano. */
export function edit_distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let row_min = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < row_min) row_min = v;
    }
    if (row_min > max) return max + 1;
    prev2.length = 0;
    prev2.push(...prev);
    prev = cur;
  }
  return prev[b.length];
}

function match_case(typed: string, word: string): string {
  if (typed.length > 1 && typed === typed.toUpperCase()) return word.toUpperCase();
  const first = typed.charAt(0);
  if (first !== first.toLowerCase() && first === first.toUpperCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return word;
}

export function create_suggester() {
  // clave = palabra sin tildes y en minúsculas. Si hay varias formas con
  // la misma clave ("esta" / "está"), se guarda una entrada por forma.
  const vocab = new Map<string, Map<string, Entry>>();

  function add(display: string, score: number) {
    const key = fold(display);
    if (key.length < 2) return;
    let forms = vocab.get(key);
    if (!forms) vocab.set(key, (forms = new Map()));
    // La forma exacta (con su mayúscula/tilde) es la clave: así "Valentina"
    // y "valentina" no se pisan y los nombres propios conservan su mayúscula.
    const prev = forms.get(display);
    if (prev) prev.score += score;
    else forms.set(display, { display, score });
  }

  // Diccionario base: puntaje decreciente según la posición en la lista.
  BASE_WORDS.forEach((w, i) => add(w, 1 + 4 / (1 + i / 120)));

  /** Aprende las palabras de un texto ya confirmado (una línea del guion). */
  function learn(text: string, weight = 8) {
    for (const raw of text.match(WORD_RE) ?? []) {
      const w = raw.replace(/^['’-]+|['’-]+$/g, "");
      if (w.length < 2) continue;
      // Palabras en mayúscula en medio de una frase son casi siempre
      // nombres propios: se conservan tal cual; el resto va en minúscula.
      const is_all_caps = w.length > 1 && w === w.toUpperCase();
      add(is_all_caps ? w.charAt(0) + w.slice(1).toLowerCase() : w.charAt(0) === w.charAt(0).toUpperCase() ? w : w.toLowerCase(), weight);
    }
  }

  /**
   * Los nombres de personaje pesan más que cualquier otra palabra.
   * Es idempotente: se puede llamar de nuevo con la lista completa cada
   * vez que cambian los personajes sin inflar el puntaje de los ya vistos.
   */
  const learned_names = new Set<string>();
  function learn_names(names: string[]) {
    for (const n of names) {
      for (const part of n.match(WORD_RE) ?? []) {
        if (learned_names.has(part)) continue;
        learned_names.add(part);
        add(part, 25);
      }
    }
  }

  function best_form(forms: Map<string, Entry>): Entry {
    let best: Entry | null = null;
    for (const e of forms.values()) if (!best || e.score > best.score) best = e;
    return best!;
  }

  /**
   * Sugerencias para el texto actual del input (máx. `limit`).
   * Solo mira la última palabra, y solo si el cursor está pegado a ella
   * (si el texto termina en espacio o signo, no sugiere nada).
   */
  function suggest(input: string, limit = 3): Suggestion[] {
    const m = input.match(TRAILING_WORD_RE);
    if (!m) return [];
    const typed = m[0];
    const key = fold(typed);
    if (key.length < 2) return [];

    const out: Suggestion[] = [];
    const seen = new Set<string>([typed]);
    const push = (display: string, kind: SuggestionKind) => {
      const word = match_case(typed, display);
      if (seen.has(word)) return;
      seen.add(word);
      out.push({ word, kind });
    };

    const exact = vocab.get(key);

    // 1) Completar: palabras que empiezan con lo tipeado.
    const completions: { entry: Entry; extra: number }[] = [];
    for (const [k, forms] of vocab) {
      if (k === key || !k.startsWith(key)) continue;
      const e = best_form(forms);
      // Prefiere palabras cortas: "casa" antes que "casamiento" a igual puntaje.
      completions.push({ entry: e, extra: e.score / (1 + (k.length - key.length) * 0.1) });
    }
    completions.sort((a, b) => b.extra - a.extra);

    // 2) Palabra ya completa y conocida: solo se ofrecen variantes con tilde
    //    ("esta" → "está"); no se la "corrige".
    if (exact) {
      const forms = [...exact.values()].sort((a, b) => b.score - a.score);
      for (const f of forms) if (f.display !== typed && fold(f.display) === key) push(f.display, "fix");
    }

    // 3) Corrección de tipeo: solo si la palabra NO existe en el vocabulario
    //    y es lo bastante larga como para que "a una letra de distancia"
    //    signifique algo.
    const fixes: { entry: Entry; dist: number }[] = [];
    if (!exact && key.length >= 3) {
      const max = key.length >= 8 ? 2 : 1;
      for (const [k, forms] of vocab) {
        if (Math.abs(k.length - key.length) > max) continue;
        const d = edit_distance(key, k, max);
        if (d <= max) fixes.push({ entry: best_form(forms), dist: d });
      }
      fixes.sort((a, b) => a.dist - b.dist || b.entry.score - a.entry.score);
    }

    // Si lo tipeado completa alguna palabra, se asume que la persona sigue
    // escribiendo y solo se ofrecen completaciones ("Val" → "Valentina", no
    // "Al"). Las correcciones aparecen únicamente cuando nada completa.
    if (completions.length > 0) {
      for (const c of completions.slice(0, limit)) push(c.entry.display, "complete");
    } else {
      for (const f of fixes) push(f.entry.display, "fix");
    }
    return out.slice(0, limit);
  }

  /** Reemplaza la última palabra de `input` por `word` y deja un espacio. */
  function apply(input: string, word: string): string {
    return input.replace(TRAILING_WORD_RE, "") + word + " ";
  }

  return { learn, learn_names, suggest, apply };
}

export type Suggester = ReturnType<typeof create_suggester>;
