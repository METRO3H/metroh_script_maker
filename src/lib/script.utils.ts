
// src/lib/script.utils.ts
// Utilidades puras del dominio — sin estado, sin efectos secundarios

import type { Character, ScriptLine } from "@types/script";

// ── Colores dinámicos por personaje ──────────────────────────────
// Hues equidistantes en HSL, offset 30° para evitar el violeta del accent (~265°)
export function char_color(index: number, total: number): string {
  const n = Math.max(total, 1);
  const hue = (30 + index * (360 / n)) % 360;
  const is_dark =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "dark";
  const l = is_dark ? "65%" : "42%";
  return `hsl(${hue}, 72%, ${l})`;
}

// ── Prefijos visuales por tipo de línea ──────────────────────────
export const TYPE_ICONS: Record<string, string> = {
  dialogue: "",
  thought: "✦ ",
  narration: "◈ ",
};

// ── Descarga de archivo genérica ─────────────────────────────────
export function download_file(content: string, filename: string, mime: string): void {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: mime })),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Exportar como .txt ───────────────────────────────────────────
export function export_txt(lines: ScriptLine[], characters: Character[], title: string): void {
  const header = `${title.toUpperCase()}\n${"─".repeat(48)}\n\n`;
  const content = lines
    .map((l) => {
      if (l.is_scene) return `\n── ESCENA ${l.scene_number} ${"─".repeat(30)}\n`;
      if (l.is_context) return `[${l.text}]`;
      const prefix = TYPE_ICONS[l.line_type ?? "dialogue"];
      return `${(characters[l.character_index]?.name ?? "?").toUpperCase()}\n   ${prefix}${l.text}`;
    })
    .join("\n");
  download_file(header + content, `${title || "script"}.txt`, "text/plain");
}

// ── Exportar como .json ──────────────────────────────────────────
export function export_json(
  lines: ScriptLine[],
  characters: Character[],
  title: string,
  script_id: string | null,
): void {
  const scenes: object[][] = [];
  let current_scene: object[] | null = null;

  for (const line of lines) {
    if (line.is_scene) {
      current_scene = [];
      scenes.push(current_scene);
    } else {
      // Si todavía no hay ninguna escena (por ejemplo, se borró la escena
      // inicial), no descartar la línea en silencio: se crea un "bloque"
      // implícito para que ningún contenido se pierda al exportar.
      if (current_scene === null) {
        current_scene = [];
        scenes.push(current_scene);
      }
      if (line.is_context) {
        current_scene.push({ type: "context", content: line.text });
      } else {
        current_scene.push({
          type: line.line_type ?? "dialogue",
          character: characters[line.character_index]?.name ?? "?",
          content: line.text,
        });
      }
    }
  }

  download_file(
    JSON.stringify(
      { id: script_id, name: title, characters: characters.map((c) => c.name), scenes },
      null,
      2,
    ),
    `${title || "script"}.json`,
    "application/json",
  );
}


