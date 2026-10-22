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

export interface ScriptLine {
  is_scene?: boolean;
  scene_number?: number;
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
