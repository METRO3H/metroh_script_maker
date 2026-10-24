
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
//
// Las palabras del diccionario NO viven en el código: se cargan desde archivos
// de texto con load_words() (ver public/words/). Con ~200 mil palabras el
// índice se arma por prefijo de 2 letras, así que cada tecla solo recorre un
// pedazo del diccionario y no todo.

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

const PLAIN_RE = /^[a-z]+$/;

/** Minúsculas y sin tildes, para comparar sin importar acentuación. */
export function fold(s: string): string {
  if (PLAIN_RE.test(s)) return s; // camino rápido: ya viene en minúscula y sin tildes
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// Filas reutilizables: edit_distance se llama decenas de miles de veces por
// tecla al buscar correcciones, así que no reserva memoria en cada llamada.
const MAX_ED_LEN = 64;
let row_a = new Int32Array(MAX_ED_LEN + 1);
let row_b = new Int32Array(MAX_ED_LEN + 1);
let row_c = new Int32Array(MAX_ED_LEN + 1);

/** Distancia de Damerau-Levenshtein (con transposiciones), con corte temprano. */
export function edit_distance(a: string, b: string, max: number): number {
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > max || n > MAX_ED_LEN || m > MAX_ED_LEN) return max + 1;
  let prev2 = row_a;
  let prev = row_b;
  let cur = row_c;
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let row_min = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cb = b.charCodeAt(j - 1);
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca === cb ? 0 : 1));
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < row_min) row_min = v;
    }
    if (row_min > max) return max + 1;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return prev[m];
}

function match_case(typed: string, word: string): string {
  if (typed.length > 1 && typed === typed.toUpperCase()) return word.toUpperCase();
  const first = typed.charAt(0);
  if (first !== first.toLowerCase() && first === first.toUpperCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return word;
}

export interface LoadWordsOptions {
  /**
   * Puntaje fijo para todas las palabras del archivo. Si no se indica, el
   * archivo se toma como una lista ordenada de más a menos frecuente y el
   * puntaje baja con la posición.
   */
  score?: number;
}

export function create_suggester() {
  // ── Vocabulario aprendido (el guion + nombres de personaje) ───
  // Es chico, así que se guarda como mapa directo. clave = palabra sin tildes
  // y en minúsculas; si hay varias formas con la misma clave ("esta" /
  // "está"), una entrada por forma.
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

  // ── Diccionario base (viene de archivos de texto) ─────────────
  // Arreglos paralelos + un índice por las 2 primeras letras de la clave:
  // 200 mil palabras como Map<string, Map<…>> serían mucha memoria.
  const base_keys: string[] = [];
  const base_forms: string[] = [];
  const base_scores: number[] = [];
  const buckets = new Map<string, number[]>();
  const base_seen = new Set<string>();

  /**
   * Carga un archivo de palabras: una por línea; las líneas vacías o que
   * empiezan con # se ignoran. Se puede llamar varias veces (diccionario
   * grande + palabras propias). Devuelve cuántas palabras nuevas sumó.
   */
  function load_words(text: string, opts: LoadWordsOptions = {}): number {
    let rank = 0;
    let added = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.charCodeAt(0) === 35 /* # */) continue;
      const display = line.split(/\s+/, 1)[0]; // tolera "palabra 12345"
      const this_rank = rank++;
      const key = fold(display);
      if (key.length < 2 || base_seen.has(display)) continue;
      base_seen.add(display);
      const idx = base_keys.length;
      base_keys.push(key);
      base_forms.push(display);
      base_scores.push(opts.score ?? 1 + 4 / (1 + this_rank / 2000));
      const prefix = key.slice(0, 2);
      const bucket = buckets.get(prefix);
      if (bucket) bucket.push(idx);
      else buckets.set(prefix, [idx]);
      added++;
    }
    return added;
  }

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

  /** Todas las formas conocidas (aprendidas + base) con exactamente esta clave. */
  function forms_of(key: string): Entry[] {
    const merged = new Map<string, Entry>();
    for (const e of vocab.get(key)?.values() ?? []) merged.set(e.display, { ...e });
    for (const i of buckets.get(key.slice(0, 2)) ?? []) {
      if (base_keys[i] !== key) continue;
      const prev = merged.get(base_forms[i]);
      if (prev) prev.score += base_scores[i];
      else merged.set(base_forms[i], { display: base_forms[i], score: base_scores[i] });
    }
    return [...merged.values()];
  }

  function is_base_known(key: string): boolean {
    for (const i of buckets.get(key.slice(0, 2)) ?? []) if (base_keys[i] === key) return true;
    return false;
  }

  /** ¿Hay en el diccionario base una palabra a `max` letras de distancia (y que empiece parecido)? */
  function has_near_base_word(key: string, max = 1): boolean {
    const c0 = key[0];
    const c1 = key[1];
    for (let i = 0; i < base_keys.length; i++) {
      const k = base_keys[i];
      if (Math.abs(k.length - key.length) > max) continue;
      if (!(k[0] === c0 || k[1] === c1 || (k[0] === c1 && k[1] === c0))) continue;
      if (edit_distance(key, k, max) <= max) return true;
    }
    return false;
  }

  /**
   * Palabras de estos textos que NO existen en el diccionario base (nombres,
   * jerga, palabras inventadas), listas para sumarlas a las sugerencias.
   * Una palabra que aparece una sola vez y está a una letra de una palabra
   * conocida se considera un error de tipeo y se descarta. No hace nada si el
   * diccionario todavía no cargó (todo parecería "desconocido").
   */
  function find_unknown_words(texts: string[]): string[] {
    if (base_keys.length === 0) return [];
    const found = new Map<string, { display: string; count: number }>();
    for (const text of texts) {
      for (const raw of text.match(WORD_RE) ?? []) {
        const w = raw.replace(/^['’-]+|['’-]+$/g, "");
        if (w.length < 3 || /['’-]/.test(w) || learned_names.has(w)) continue;
        const display = w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w.charAt(0) === w.charAt(0).toUpperCase() ? w : w.toLowerCase();
        const cur = found.get(display);
        if (cur) cur.count++;
        else found.set(display, { display, count: 1 });
      }
    }
    const out: string[] = [];
    for (const { display, count } of found.values()) {
      const key = fold(display);
      if (is_base_known(key)) continue;
      // Mismo criterio de distancia que las correcciones de suggest().
      if (count < 2 && key.length >= 5 && has_near_base_word(key, key.length >= 8 ? 2 : 1)) continue; // probable typo
      out.push(display);
    }
    return out;
  }

  /**
   * Sugerencias para el texto actual del input (máx. `limit`).
   * Solo mira la última palabra, y solo si el cursor está pegado a ella
   * (si el texto termina en espacio o signo, no sugiere nada).
   */
  function suggest(input: string, limit = 5): Suggestion[] {
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

    const exact = forms_of(key);

    // 1) Completar: palabras que empiezan con lo tipeado. Por cada clave se
    //    queda con su mejor forma.
    const best_by_key = new Map<string, Entry>();
    const consider = (k: string, display: string, score: number) => {
      const cur = best_by_key.get(k);
      if (!cur || score > cur.score) best_by_key.set(k, { display, score });
    };
    for (const [k, forms] of vocab) {
      if (k === key || !k.startsWith(key)) continue;
      const e = best_form(forms);
      consider(k, e.display, e.score);
    }
    for (const i of buckets.get(key.slice(0, 2)) ?? []) {
      const k = base_keys[i];
      if (k === key || !k.startsWith(key)) continue;
      consider(k, base_forms[i], base_scores[i]);
    }
    // Prefiere palabras cortas: "casa" antes que "casamiento" a igual puntaje.
    const completions = [...best_by_key].map(([k, entry]) => ({
      entry,
      extra: entry.score / (1 + (k.length - key.length) * 0.1),
    }));
    completions.sort((a, b) => b.extra - a.extra);

    // 2) Palabra ya completa y conocida: solo se ofrecen variantes con tilde
    //    ("esta" → "está"); no se la "corrige".
    if (exact.length > 0) {
      exact.sort((a, b) => b.score - a.score);
      for (const f of exact) if (f.display !== typed && fold(f.display) === key) push(f.display, "fix");
    }

    // 3) Corrección de tipeo: solo si la palabra NO existe en el vocabulario
    //    y es lo bastante larga como para que "a una letra de distancia"
    //    signifique algo. Solo se prueban palabras que comparten alguna de las
    //    dos primeras letras (los errores de tipeo casi nunca las tocan): así
    //    no se mide la distancia contra todo el diccionario.
    const fixes: { entry: Entry; dist: number }[] = [];
    if (exact.length === 0 && completions.length === 0 && key.length >= 3) {
      const max = key.length >= 8 ? 2 : 1;
      const c0 = key[0];
      const c1 = key[1];
      const near_start = (k: string) => k[0] === c0 || k[1] === c1 || (k[0] === c1 && k[1] === c0);
      const best_fix = new Map<string, { entry: Entry; dist: number }>();
      const try_fix = (k: string, display: string, score: number) => {
        if (Math.abs(k.length - key.length) > max || !near_start(k)) return;
        const d = edit_distance(key, k, max);
        if (d > max) return;
        const cur = best_fix.get(k);
        if (!cur || score > cur.entry.score) best_fix.set(k, { entry: { display, score }, dist: d });
      };
      for (const [k, forms] of vocab) {
        const e = best_form(forms);
        try_fix(k, e.display, e.score);
      }
      for (let i = 0; i < base_keys.length; i++) try_fix(base_keys[i], base_forms[i], base_scores[i]);
      fixes.push(...best_fix.values());
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

  return { load_words, find_unknown_words, learn, learn_names, suggest, apply, get base_size() { return base_keys.length; } };
}

export type Suggester = ReturnType<typeof create_suggester>;


