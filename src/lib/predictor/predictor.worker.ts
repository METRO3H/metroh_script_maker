// predictor.worker.ts
// Vive en un Web Worker. Recibe mensajes de predictor.client.ts y los
// reenvía al motor real de WebLLM. No sabe nada del dominio ni de cómo
// se arma el prompt — solo hace de puente hacia WebLLM.

import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// Diagnóstico temporal: mismo criterio que en predictor.client.ts.
// Sacar este bloque (o poner DEBUG en false) una vez que el autocompletado
// funcione de punta a punta. Antes de este cambio, este archivo no tenía
// ningún manejo de errores: una excepción acá adentro (o el device de
// WebGPU perdiéndose) se perdía en el contexto del worker sin que el
// hilo principal se enterara nunca — quedaba esperando para siempre.
const DEBUG = true;
function log(...args: unknown[]) {
   if (DEBUG) console.log("[predictor.worker]", ...args);
}

let handler: WebWorkerMLCEngineHandler;

// Errores no capturados dentro del worker (por ejemplo "GPUDevice was
// lost", un panic de WebAssembly, etc.) no llegan solos a la consola
// "normal" del hilo principal ni al catch de predict(). Sin este
// handler, se pierden en silencio y el cliente queda esperando una
// respuesta que ya nadie va a mandar.
self.onerror = (event: string | Event, source?: string, lineno?: number, colno?: number, error?: Error) => {
   const errorEvent = typeof event === "string" ? undefined : event as ErrorEvent;
   console.error("[predictor.worker] error no capturado en el worker:", {
      message: errorEvent?.message ?? event,
      filename: errorEvent?.filename ?? source,
      lineno: errorEvent?.lineno ?? lineno,
      colno: errorEvent?.colno ?? colno,
      error: errorEvent?.error ?? error,
   });
};

// Mismo problema que arriba pero para promesas rechazadas sin .catch()
// dentro del worker (WebLLM hace bastante trabajo async internamente).
self.onunhandledrejection = (event: PromiseRejectionEvent) => {
   console.error("[predictor.worker] promesa rechazada sin capturar en el worker:", event.reason);
};

// Mensajes de streaming (un "completionStreamNextChunk" por token) son
// altísima frecuencia: volcar el objeto completo de cada uno inunda la
// consola sin aportar nada nuevo (para eso ya está el log de deltas en
// predictor.client.ts). Se loguean aparte, con un contador liviano, y
// solo cada N se imprime una línea — para confirmar que el flujo sigue
// vivo sin generar ruido.
const CHUNK_LOG_EVERY = 25;
const chunk_counts = new Map<string, number>();

function is_streaming_chunk(data: unknown): data is { kind: string } {
   return typeof data === "object" && data !== null && typeof (data as { kind?: unknown }).kind === "string" &&
      (data as { kind: string }).kind.toLowerCase().includes("chunk");
}

self.onmessage = (msg: MessageEvent) => {
   if (is_streaming_chunk(msg.data)) {
      const kind = msg.data.kind;
      const count = (chunk_counts.get(kind) ?? 0) + 1;
      chunk_counts.set(kind, count);
      if (count === 1 || count % CHUNK_LOG_EVERY === 0) {
         log(`mensaje "${kind}" recibido (van ${count} de este tipo en esta sesión)`);
      }
   } else {
      log("mensaje recibido del hilo principal", msg.data);
   }
   try {
      if (!handler) {
         log("creando WebWorkerMLCEngineHandler");
         handler = new WebWorkerMLCEngineHandler();
      }
      handler.onmessage(msg);
   } catch (err) {
      // Antes esto se perdía en silencio: una excepción acá deja al
      // hilo principal esperando una respuesta que nunca va a llegar.
      console.error("[predictor.worker] handler.onmessage() falló:", err);
   }
};