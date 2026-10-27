// src/lib/suggest/suggest.client.ts
// Lado del hilo principal de las sugerencias. Habla con el Web Worker
// (suggest.worker.ts) por mensajes; si el navegador no puede crearlo, cae al
// mismo núcleo corriendo en el hilo principal (más lento, pero funciona igual).
//
// En el servidor (SSR) no hay nada que hacer: todo devuelve vacío.

import type { Req, Res, WordLang } from "./suggest.core";
import type { Suggestion } from "./suggest.engine";
import { has_trailing_word } from "./suggest.text";

interface Transport {
  post(req: Req): void;
  close(): void;
}

interface Awaiting {
  req: Req;
  resolve(res: Res | null): void;
}

export function create_suggest_client() {
  const available = typeof window !== "undefined";
  const awaiting = new Map<number, Awaiting>();
  // Mensajes que cambian el estado del motor (cargar, aprender): si hay que
  // pasar al plan B, se reenvían para reconstruirlo.
  const journal: Req[] = [];
  let next_id = 1;
  let transport: Transport | null = null;
  let closed = false;

  function deliver(res: Res) {
    const w = awaiting.get(res.id);
    if (!w) return;
    awaiting.delete(res.id);
    w.resolve(res);
  }

  // ── Plan B: el mismo núcleo, en el hilo principal ─────────────
  async function start_inline() {
    const [{ create_core }, { fetch_word_text }] = await Promise.all([import("./suggest.core"), import("./word_cache")]);
    if (closed) return;
    const core = create_core({
      fetch_text: (url, cache_key) => fetch_word_text(url, cache_key),
    });
    const inline: Transport = {
      post(req) {
        void core.handle(req).then((res) => {
          if (res) deliver(res);
        });
      },
      close() {},
    };
    transport = inline;
    for (const req of journal) inline.post(req);
    for (const w of awaiting.values()) {
      if (w.req.type === "suggest" || w.req.type === "find_unknown") inline.post(w.req);
    }
  }

  // ── Plan A: Web Worker ────────────────────────────────────────
  function start() {
    if (!available) return;
    try {
      const worker = new Worker(new URL("./suggest.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<Res>) => deliver(e.data);
      worker.onerror = (e) => {
        e.preventDefault();
        console.warn("[sugerencias] el worker falló; se usa el hilo principal:", e.message);
        worker.terminate();
        transport = null;
        void start_inline();
      };
      transport = { post: (req) => worker.postMessage(req), close: () => worker.terminate() };
    } catch (err) {
      console.warn("[sugerencias] no se pudo crear el worker; se usa el hilo principal:", err);
      void start_inline();
    }
  }
  start();

  /** Mensaje sin respuesta. Mientras no haya transporte, el journal lo repone. */
  function post_state(req: Req) {
    if (!available || closed) return;
    journal.push(req);
    transport?.post(req);
  }

  function ask(build: (id: number) => Req): Promise<Res | null> {
    if (!available || closed) return Promise.resolve(null);
    const id = next_id++;
    const req = build(id);
    return new Promise((resolve) => {
      awaiting.set(id, { req, resolve });
      if (req.type === "load_file") journal.push(req);
      transport?.post(req);
    });
  }

  return {
    /** El worker descarga y procesa el archivo. true si se cargó. */
    async load_file(lang: WordLang, url: string, score?: number, cache_key?: string): Promise<boolean> {
      const res = await ask((id) => ({ type: "load_file", id, lang, url, score, cache_key }));
      return res?.type === "loaded" && res.ok;
    },
    load_words(lang: WordLang, text: string, score?: number) {
      if (text) post_state({ type: "load_words", lang, text, score });
    },
    learn(lang: WordLang, text: string) {
      if (text.trim()) post_state({ type: "learn", lang, text });
    },
    learn_names(names: string[]) {
      if (names.length) post_state({ type: "learn_names", names });
    },
    async suggest(lang: WordLang, input: string, limit: number): Promise<Suggestion[]> {
      const res = await ask((id) => ({ type: "suggest", id, lang, input, limit }));
      return res?.type === "suggest" ? res.list : [];
    },
    async find_unknown(lang: WordLang, texts: string[]): Promise<string[]> {
      const res = await ask((id) => ({ type: "find_unknown", id, lang, texts }));
      return res?.type === "unknown" ? res.words : [];
    },
    close() {
      closed = true;
      transport?.close();
      transport = null;
      for (const w of awaiting.values()) w.resolve(null);
      awaiting.clear();
    },
  };
}

export type SuggestClient = ReturnType<typeof create_suggest_client>;

// ── Alimentador de sugerencias ──────────────────────────────────
// Entre el input y el worker: manda solo la consulta MÁS RECIENTE (si se
// teclea más rápido de lo que el worker contesta, las intermedias se saltan) y
// descarta respuestas que ya no corresponden a lo que hay escrito, para que
// nunca aparezcan chips de una palabra anterior.

export interface SuggestionResult {
  input: string;
  lang: WordLang;
  list: Suggestion[];
}

export function create_suggestion_feed(
  client: Pick<SuggestClient, "suggest">,
  limit: number,
  on_result: (result: SuggestionResult) => void,
) {
  let seq = 0;
  let busy = false;
  let wanted: { seq: number; input: string; lang: WordLang } | null = null;

  async function pump(): Promise<void> {
    if (busy || wanted === null) return;
    busy = true;
    const req = wanted;
    wanted = null;
    let list: Suggestion[] = [];
    try {
      list = await client.suggest(req.lang, req.input, limit);
    } catch {
      /* sin sugerencias esta vez */
    }
    busy = false;
    if (req.seq === seq) on_result({ input: req.input, lang: req.lang, list });
    void pump();
  }

  return {
    request(input: string, lang: WordLang) {
      const my = ++seq;
      // Sin palabra al final (vacío, espacio, signo) no hay nada que consultar:
      // se responde al instante y se invalida cualquier respuesta pendiente.
      if (!has_trailing_word(input)) {
        wanted = null;
        on_result({ input, lang, list: [] });
        return;
      }
      wanted = { seq: my, input, lang };
      void pump();
    },
  };
}
