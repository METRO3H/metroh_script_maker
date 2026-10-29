// src/types/script.ts
// Tipos del dominio — fuente de verdad para todo el editor

export type LineType = "dialogue" | "thought" | "narration" | "context" | "scene";

export type Lang = "es" | "en";

export interface Project {
  id: string;
  name: string;
  script_count?: number;
}

export interface Character {
  id: number;
  name: string;
}

/**
 * Perspectiva especial "ver todas las perspectivas disponibles". En
 * `visible_in` de una escena significa: solo se ve en ese modo.
 */
export const PERSPECTIVE_ALL = "all";

/** Modo de una escena en el juego: con renders o con sprites/fondo fijos. */
export const SCENE_MODES = ["render", "static"] as const;
export type SceneMode = (typeof SCENE_MODES)[number];
export const DEFAULT_SCENE_MODE: SceneMode = "static";

export interface ScriptLine {
  /** Identidad estable de la fila en pantalla (solo cliente; no se guarda). La pone set_script(). */
  uid?: number;
  is_scene?: boolean;
  scene_number?: number;
  /**
   * Solo escenas. En qué perspectivas se ve: ["all"] = únicamente al elegir
   * "ver todas las perspectivas"; nombres de personaje = también en la
   * perspectiva de cada uno. Si falta, vale ["all"].
   */
  visible_in?: string[];
  /** Solo escenas. Identificador propio (p. ej. "1_04S"); no es la posición. Opcional. */
  scene_id?: string;
  /** Solo escenas. Nombre del personaje desde cuyo punto de vista transcurre. Opcional. */
  pov?: string;
  /** Solo escenas. Si falta vale "static". */
  mode?: SceneMode;
  is_context?: boolean;
  character_index: number;
  text?: string;
  /** Traducción al inglés (la escribe la persona; el proyecto no traduce). */
  text_en?: string;
  line_type?: LineType;
}

export interface Script {
  id: string | null;
  name: string;
  name_en?: string;
  project_id?: string | null;
  characters: Character[];
  lines: ScriptLine[];
}
