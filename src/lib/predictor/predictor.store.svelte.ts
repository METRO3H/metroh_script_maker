// predictor.store.svelte.ts
// Estado reactivo del predictor. Es el único lugar que decide si se
// carga el modelo o no, y expone el progreso para la UI. No sabe nada
// del dominio (guion/línea/personaje) — solo orquesta el Predictor.

import { create_predictor } from "./predictor.client";
import { is_predictor_supported } from "./predictor.support";
import type { Predictor, PredictorStatus } from "./predictor.types";

// q4f16_1 = cuantizado a 4 bits, activaciones en float16 (~350-400MB).
// Confirmado contra el catálogo prebuilt real de @mlc-ai/web-llm 0.2.85.
const MODEL_ID = "Qwen3-0.6B-q4f16_1-MLC";

function create_predictor_store() {
  // Se calcula una sola vez al cargar el módulo. Durante SSR siempre da
  // false (ver predictor.support.ts); el valor real llega al hidratar
  // en el cliente, que es donde de verdad importa.
  const supported = is_predictor_supported();

  let enabled = $state(false);
  let status = $state<PredictorStatus>("idle");
  let progress = $state(0);
  let status_msg = $state("");

  let predictor: Predictor | null = null;
  // Memoiza la carga en curso: evita que dos llamadas a enable() antes
  // de que la primera resuelva disparen dos load() en paralelo (dos
  // workers/engines a la vez).
  let load_promise: Promise<void> | null = null;

  function get_predictor(): Predictor {
    if (!predictor) predictor = create_predictor();
    return predictor;
  }

  function enable(): Promise<void> {
    if (!supported) return Promise.resolve();
    enabled = true;
    if (load_promise) return load_promise;
    if (status === "ready") return Promise.resolve();

    status = "loading";
    progress = 0;
    status_msg = "";

    load_promise = get_predictor()
      .load({
        model_id: MODEL_ID,
        on_progress: (prog, msg) => {
          progress = prog;
          status_msg = msg;
        },
      })
      .then(() => {
        status = "ready";
      })
      .catch((err) => {
        status = "error";
        status_msg = err instanceof Error ? err.message : "Error al cargar el modelo";
        load_promise = null; // permitir reintentar con un enable() posterior
        throw err;
      });

    return load_promise;
  }

  function disable() {
    // No libera nada a propósito: si el usuario vuelve a encender el
    // toggle, no hace falta recompilar shaders ni volver a leer
    // IndexedDB. Para liberar memoria de verdad, ver unload().
    enabled = false;
  }

  function unload() {
    enabled = false;
    load_promise = null;
    predictor?.unload();
    predictor = null;
    status = "idle";
    progress = 0;
    status_msg = "";
  }

  return {
    get supported() {
      return supported;
    },
    get enabled() {
      return enabled;
    },
    get status() {
      return status;
    },
    get progress() {
      return progress;
    },
    get status_msg() {
      return status_msg;
    },
    /**
     * El Predictor crudo, para que ghost_input llame a predict().
     * No hace ningún chequeo de "está listo" — es responsabilidad de
     * quien lo consuma revisar `enabled && status === "ready"` antes
     * de llamar a predict(), igual que ya necesita saber eso para
     * decidir si mostrar texto fantasma o no.
     *
     * Límite conocido, no resuelto todavía: si en el futuro más de un
     * input usa ghost_input al mismo tiempo, ambos comparten esta
     * misma instancia y WebLLM no genera en paralelo — la segunda
     * llamada a predict() queda esperando a la primera sin que el
     * consumidor lo sepa. Hoy el editor solo tiene un input con
     * ghost_input activo, así que no aplica; si eso cambia, hace falta
     * una cola acá.
     */
    get instance() {
      return get_predictor();
    },
    enable,
    disable,
    unload,
  };
}

export const predictor_store = create_predictor_store();
