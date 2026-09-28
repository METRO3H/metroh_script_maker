// src/lib/predictor/predictor.debug.ts
// Buffer compartido de logs de diagnóstico para ghost_input.svelte.ts y
// predictor.client.ts, más una forma de bajarlos como archivo de texto
// sin tener que copiar/pegar a mano desde la consola.
//
// Uso: en vez de console.log directo, esos dos módulos llaman a
// debug_log("origen", ...args) / debug_error("origen", ...args). Sigue
// viéndose todo en vivo en devtools (se llama a console.log/error por
// dentro) y además queda guardado en memoria.
//
// Para generar el archivo: desde la consola del navegador, ejecutar
//   __predictor_debug_dump()
// Descarga un .log con todo lo acumulado hasta ese momento, con
// timestamps relativos, listo para compartir.
//
// Nota: esto NO incluye los logs de predictor.worker.ts — esos corren
// dentro del worker (self.onerror, self.onunhandledrejection, errores
// de handler.onmessage) y se dejaron aparte a propósito, sin mandarlos
// por postMessage al hilo principal, para no arriesgar mezclarlos con
// los mensajes propios del protocolo de WebWorkerMLCEngineHandler. Si
// el worker tira algo relevante, va a seguir apareciendo aparte en la
// consola con el prefijo [predictor.worker].

type DebugEntry = {
   ts: number;
   source: string;
   args: unknown[];
};

const MAX_ENTRIES = 5000;
const entries: DebugEntry[] = [];

export function debug_log(source: string, ...args: unknown[]): void {
   entries.push({ ts: performance.now(), source, args });
   if (entries.length > MAX_ENTRIES) entries.shift();
   console.log(`[${source}]`, ...args);
}

export function debug_error(source: string, ...args: unknown[]): void {
   entries.push({ ts: performance.now(), source: `${source}:error`, args });
   if (entries.length > MAX_ENTRIES) entries.shift();
   console.error(`[${source}]`, ...args);
}

function format_arg(a: unknown): string {
   if (typeof a === "string") return a;
   try {
      return JSON.stringify(a);
   } catch {
      return String(a);
   }
}

function format_entry(entry: DebugEntry): string {
   const t = (entry.ts / 1000).toFixed(3);
   return `[${t}s] [${entry.source}] ${entry.args.map(format_arg).join(" ")}`;
}

export function download_debug_log(filename = `predictor-debug-${Date.now()}.log`): void {
   const text = entries.map(format_entry).join("\n");
   const blob = new Blob([text], { type: "text/plain" });
   const url = URL.createObjectURL(blob);
   const a = document.createElement("a");
   a.href = url;
   a.download = filename;
   document.body.appendChild(a);
   a.click();
   a.remove();
   URL.revokeObjectURL(url);
}

export function clear_debug_log(): void {
   entries.length = 0;
}

// Se expone global para poder llamarlo directo desde la consola del
// devtools sin tener que importar nada a mano.
if (typeof window !== "undefined") {
   (window as unknown as { __predictor_debug_dump?: typeof download_debug_log }).__predictor_debug_dump =
      download_debug_log;
   (window as unknown as { __predictor_debug_clear?: typeof clear_debug_log }).__predictor_debug_clear =
      clear_debug_log;
}