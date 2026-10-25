// src/lib/suggest/suggest.core.ts
// Núcleo de las sugerencias: dos motores (es / en) detrás de una interfaz de
// mensajes. Es puro (sin DOM ni Worker): corre dentro del Web Worker
// (suggest.worker.ts) y, si el navegador no puede crear un worker, en el hilo
// principal como plan B (ver suggest.client.ts). También se puede testear con
// Node directamente.

import { create_suggester, type Suggester, type Suggestion } from "./suggest.engine";

import type { WordLang } from "./learned_words";
export type { WordLang };

export type Req =
  // El worker descarga y procesa el archivo: el texto nunca pasa por el hilo principal.
  | { type: "load_file"; id: number; lang: WordLang; url: string; score?: number }
  | { type: "load_words"; lang: WordLang; text: string; score?: number }
  | { type: "learn"; lang: WordLang; text: string }
  | { type: "learn_names"; names: string[] }
  | { type: "suggest"; id: number; lang: WordLang; input: string; limit: number }
  | { type: "find_unknown"; id: number; lang: WordLang; texts: string[] };

export type Res =
  | { type: "loaded"; id: number; ok: boolean }
  | { type: "suggest"; id: number; list: Suggestion[] }
  | { type: "unknown"; id: number; words: string[] };

export interface CoreDeps {
  /** Devuelve el texto de un archivo o lanza si no se pudo (sin red, 404…). */
  fetch_text(url: string): Promise<string>;
}

export function create_core(deps: CoreDeps) {
  const engines: Record<WordLang, Suggester> = { es: create_suggester(), en: create_suggester() };

  /**
   * Los mensajes que no necesitan esperar nada (learn, suggest…) se ejecutan de
   * forma síncrona dentro de la llamada, así que respetan el orden de llegada.
   * Solo load_file espera (la descarga) sin frenar a los demás.
   */
  async function handle(req: Req): Promise<Res | null> {
    switch (req.type) {
      case "load_file": {
        try {
          const text = await deps.fetch_text(req.url);
          engines[req.lang].load_words(text, req.score === undefined ? {} : { score: req.score });
          return { type: "loaded", id: req.id, ok: true };
        } catch (err) {
          console.warn(`[sugerencias] no se pudo cargar ${req.url}:`, err);
          return { type: "loaded", id: req.id, ok: false };
        }
      }
      case "load_words":
        engines[req.lang].load_words(req.text, req.score === undefined ? {} : { score: req.score });
        return null;
      case "learn":
        engines[req.lang].learn(req.text);
        return null;
      case "learn_names":
        // Los nombres de personaje valen para los dos idiomas.
        engines.es.learn_names(req.names);
        engines.en.learn_names(req.names);
        return null;
      case "suggest":
        return { type: "suggest", id: req.id, list: engines[req.lang].suggest(req.input, req.limit) };
      case "find_unknown":
        return { type: "unknown", id: req.id, words: engines[req.lang].find_unknown_words(req.texts) };
    }
  }

  return { handle, engines };
}

export type SuggestCore = ReturnType<typeof create_core>;
