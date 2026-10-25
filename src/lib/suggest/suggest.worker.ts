// src/lib/suggest/suggest.worker.ts
// Web Worker de las sugerencias: descarga los diccionarios, los procesa y
// responde a las consultas fuera del hilo principal, así que ni la carga (unos
// cientos de ms de CPU) ni las búsquedas de correcciones (decenas de ms en
// palabras raras) pueden congelar la escritura.
//
// El trabajo real está en suggest.core.ts; esto solo conecta los mensajes.

import { create_core, type Req } from "./suggest.core";

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent<Req>) => void) | null;
};

const core = create_core({
  async fetch_text(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },
});

ctx.onmessage = (e) => {
  void core.handle(e.data).then((res) => {
    if (res) ctx.postMessage(res);
  });
};
