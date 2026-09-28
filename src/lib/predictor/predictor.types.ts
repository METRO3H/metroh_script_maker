// src/lib/predictor/predictor.types.ts
// Contrato puro: cero imports, cero lógica, cero conocimiento del dominio
// (no sabe qué es un "guion", una "línea" ni un "personaje") ni del motor
// concreto (no sabe qué es WebLLM, un worker, ni WebGPU).

export type PredictorStatus = "idle" | "loading" | "ready" | "error";

export interface PredictorRequest {
  prompt: string;
  system?: string;
  max_tokens?: number;
  temperature?: number;
  /**
   * Penalización a tokens que ya aparecieron en la generación (nativo de
   * MLC, no es un campo estándar de OpenAI). Default de la implementación
   * de WebLLM: 1.3, para cortar loops de repetición exacta — un modelo
   * chico corriendo local es más propenso a esto que uno grande.
   */
  repetition_penalty?: number;
  /**
   * Secuencias en las que el motor debe frenar la generación apenas las
   * emite. Complementa (no reemplaza) cualquier recorte que haga el
   * consumidor del lado del cliente: frenar acá ahorra cómputo real en
   * vez de descartar texto ya generado.
   */
  stop?: string[];
  /**
   * Señal de cancelación. INVARIANTE OBLIGATORIO para cualquier
   * implementación de Predictor: abortar esta señal debe liberar el
   * recurso de cómputo real (GPU/CPU) del motor subyacente, no solo
   * dejar de emitir chunks del lado del consumidor. Un motor que genera
   * de a una petición por vez (como WebLLM) debe frenar esa generación
   * de inmediato, para que la siguiente petición no quede esperando
   * detrás de una que el usuario ya abandonó.
   */
  signal?: AbortSignal;
}

export interface PredictorChunk {
  text: string;
  done: boolean;
}

export interface PredictorConfig {
  model_id: string;
  on_progress?: (progress: number, message: string) => void;
}

export interface Predictor {
  readonly status: PredictorStatus;
  load(config: PredictorConfig): Promise<void>;
  predict(req: PredictorRequest): AsyncGenerator<PredictorChunk>;
  unload(): void;
}