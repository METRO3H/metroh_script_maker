// src/lib/predictor/predictor.client.ts
// Única implementación concreta del contrato Predictor que sabe de
// WebLLM. Cambiar de motor (Chrome Prompt API, un mock para tests, etc.)
// implica escribir un archivo nuevo con esta misma forma — nada más del
// proyecto necesita cambiar.

import type { Predictor, PredictorConfig, PredictorRequest, PredictorChunk, PredictorStatus } from "./predictor.types";
import type { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { debug_log, debug_error } from "./predictor.debug";

// Diagnóstico temporal: sacar estas dos líneas (o volver a un log()
// vacío) una vez que el autocompletado funcione de punta a punta. Antes
// de este cambio, este archivo no logueaba absolutamente nada: cualquier
// cosa que pasara entre "se pide la sugerencia" y "llega el primer chunk
// ya filtrado" era invisible.
const log = (...args: unknown[]) => debug_log("predictor.client", ...args);
const log_error = (...args: unknown[]) => debug_error("predictor.client", ...args);

export function create_predictor(): Predictor {
   let status: PredictorStatus = "idle";
   let engine: WebWorkerMLCEngine | null = null;
   let worker: Worker | null = null;

   async function load(config: PredictorConfig): Promise<void> {
      status = "loading";
      try {
         // Import perezoso: nada de @mlc-ai/web-llm entra en el bundle
         // principal ni se descarga hasta que se llama load().
         log("importando @mlc-ai/web-llm");
         const webllm = await import("@mlc-ai/web-llm");
         log("@mlc-ai/web-llm importado");

         worker = new Worker(new URL("./predictor.worker.ts", import.meta.url), {
            type: "module",
         });

         // Si el worker muere (GPU perdida, excepción no capturada dentro
         // del worker, etc.) sin esto no nos enteramos nunca: el cliente
         // se queda esperando una respuesta que ya nadie va a mandar.
         worker.addEventListener("error", (e) => {
            log_error("error del worker:", e.message, e);
         });
         worker.addEventListener("messageerror", (e) => {
            log_error("messageerror del worker (no se pudo deserializar el mensaje):", e);
         });
         log("worker creado, pidiendo CreateWebWorkerMLCEngine para", config.model_id);

         engine = await webllm.CreateWebWorkerMLCEngine(worker, config.model_id, {
            initProgressCallback: (report) => {
               log("progreso de carga", report.progress, report.text);
               config.on_progress?.(report.progress, report.text);
            },
         });

         log("engine listo");
         status = "ready";
      } catch (err) {
         log_error("load() falló:", err);
         status = "error";
         worker?.terminate();
         worker = null;
         engine = null;
         throw err;
      }
   }

   async function* predict(req: PredictorRequest): AsyncGenerator<PredictorChunk> {
      if (status !== "ready" || !engine) {
         throw new Error("predict() llamado antes de que el predictor esté listo (status !== 'ready')");
      }
      if (req.signal?.aborted) return;

      const messages: Array<{ role: "system"; content: string } | { role: "user"; content: string }> = [];
      if (req.system) messages.push({ role: "system", content: req.system });
      messages.push({ role: "user", content: req.prompt });

      const current_engine = engine;
      // INVARIANTE del contrato: abortar el signal debe frenar el motor de
      // verdad, no solo dejar de escuchar el generador. interruptGenerate()
      // es lo que efectivamente libera el turno de generación de WebLLM.
      const on_abort = () => {
         log("señal de abort recibida, llamando a interruptGenerate()");
         try {
            const result = current_engine.interruptGenerate();
            // interruptGenerate() puede devolver una promesa según la
            // versión; si rechaza y nadie la captura, se pierde como
            // unhandled rejection y no nos enteramos de que falló.
            Promise.resolve(result).catch((err) => {
               log_error("interruptGenerate() rechazó:", err);
            });
         } catch (err) {
            log_error("interruptGenerate() tiró una excepción sincrónica:", err);
         }
      };
      req.signal?.addEventListener("abort", on_abort);

      // Techo duro para cualquier generación de este pipeline. Es "una
      // sola frase corta" según el propio system prompt — 80 tokens
      // sobra de margen incluso para una frase larga, y evita que una
      // generación se extienda indefinidamente si algo falla.
      const max_tokens = req.max_tokens ?? 80;

      // Castiga tokens que ya aparecieron en la generación, para cortar
      // loops de repetición exacta (un modelo de 0.6B corriendo local es
      // bastante propenso a esto). A diferencia de enable_thinking, este
      // es un campo nativo de MLC — va directo al mismo nivel que
      // max_tokens/stop, no dentro de extra_body.
      const repetition_penalty = req.repetition_penalty ?? 1.3;

      // Apaga el modo pensamiento de Qwen3 de verdad (hard switch),
      // en vez de depender del "/no_think" como texto suelto en el
      // prompt (soft switch, que el modelo puede ignorar — que es
      // justo lo que estaba pasando). Campo confirmado en el propio
      // config.ts de @mlc-ai/web-llm, bajo GenerationConfig, con el
      // comentario "extra_body in ChatCompletionsRequest".
      const extra_body = { enable_thinking: false };

      try {
         log("llamando a chat.completions.create()", {
            messages,
            stop: req.stop,
            max_tokens,
            repetition_penalty,
            extra_body,
         });
         const stream = await current_engine.chat.completions.create({
            messages,
            stream: true,
            max_tokens,
            temperature: req.temperature,
            repetition_penalty,
            stop: req.stop,
            extra_body,
         });
         log("chat.completions.create() resolvió, empezando a iterar el stream");

         let in_think = false;
         let buffer = "";
         let raw_delta_count = 0;

         for await (const chunk of stream) {
            raw_delta_count++;
            const delta = chunk.choices[0]?.delta?.content ?? "";
            log("delta crudo recibido de WebLLM", {
               raw_delta_count,
               delta,
               finish_reason: chunk.choices[0]?.finish_reason,
            });
            if (delta) {
               buffer += delta;

               // Antes esto asumía como mucho una transición de estado
               // por delta (entra a <think> O sale con </think>, nunca
               // las dos en el mismo paso). Con enable_thinking:false
               // el bloque de pensamiento suele llegar vacío y de una,
               // en un solo delta tipo "<think>\n\n</think>\n\nEsc" — así
               // que puede haber más de una transición junta. Se procesa
               // en loop hasta que no quede ninguna transición más por
               // aplicar dentro de lo ya acumulado.
               let progressed = true;
               while (progressed) {
                  progressed = false;
                  if (!in_think) {
                     const open_idx = buffer.indexOf("<think>");
                     if (open_idx !== -1) {
                        const before = buffer.slice(0, open_idx);
                        if (before) yield { text: before, done: false };
                        buffer = buffer.slice(open_idx + "<think>".length);
                        in_think = true;
                        log("entrando en bloque <think>");
                        progressed = true;
                     }
                  } else {
                     const close_idx = buffer.indexOf("</think>");
                     if (close_idx !== -1) {
                        buffer = buffer.slice(close_idx + "</think>".length).replace(/^\s+/, "");
                        in_think = false;
                        log("saliendo del bloque </think>");
                        progressed = true;
                     }
                     // si no aparece close_idx todavía: seguimos dentro
                     // del bloque de razonamiento, no se emite nada.
                  }
               }

               if (!in_think && buffer) {
                  yield { text: buffer, done: false };
                  buffer = "";
               }
            }
            if (chunk.choices[0]?.finish_reason) {
               log("finish_reason recibido:", chunk.choices[0].finish_reason);
               yield { text: "", done: true };
               return;
            }
         }
         log("el stream de WebLLM terminó sin finish_reason explícito, deltas totales:", raw_delta_count);
         yield { text: "", done: true };
      } catch (err) {
         // Antes, si esto fallaba acá adentro, recién se enteraba
         // ghost_input.svelte.ts del lado de afuera (y solo si el error
         // efectivamente llegaba a propagarse). Logueamos también acá,
         // en el punto exacto donde puede estar pasando.
         log_error("chat.completions.create() o la iteración del stream fallaron:", err);
         throw err;
      } finally {
         log("limpiando: removiendo listener de abort");
         // Se remueve pase lo que pase: generación normal, error, o el
         // consumidor cortando el for-await antes de tiempo.
         req.signal?.removeEventListener("abort", on_abort);
      }
   }

   function unload(): void {
      status = "idle";
      const w = worker;
      const e = engine;
      worker = null;
      engine = null;
      void (async () => {
         try {
            await e?.unload();
         } catch (err) {
            // liberar el worker igual aunque unload() del engine falle
            log_error("engine.unload() falló (se libera el worker de todos modos):", err);
         }
         w?.terminate();
      })();
   }

   return {
      get status() {
         return status;
      },
      load,
      predict,
      unload,
   };
}