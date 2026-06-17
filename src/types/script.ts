// src/types/script.ts
// Tipos del dominio — fuente de verdad para todo el editor

export type LineType = "dialogue" | "thought" | "narration" | "context" | "scene";

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
  line_type?: LineType;
}

export interface Script {
  id: string | null;
  name: string;
  characters: Character[];
  lines: ScriptLine[];
}
