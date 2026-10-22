// src/lib/script.utils.ts
// Utilidades puras del dominio — sin estado, sin efectos secundarios

import type { Character, Lang, ScriptLine } from "@types/script";

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
// En inglés, una línea sin traducir sale con el texto en español entre
// llaves dobles ({{...}}), para que se vea qué falta sin perder el orden.
export function export_txt(lines: ScriptLine[], characters: Character[], title: string, lang: Lang = "es"): void {
  const header = `${title.toUpperCase()}\n${"─".repeat(48)}\n\n`;
  const pick = (l: ScriptLine) => {
    if (lang === "es") return l.text ?? "";
    const en = (l.text_en ?? "").trim();
    return en || `{{${l.text ?? ""}}}`;
  };
  const content = lines
    .map((l) => {
      if (l.is_scene) return `\n── ${lang === "en" ? "SCENE" : "ESCENA"} ${l.scene_number} ${"─".repeat(30)}\n`;
      if (l.is_context) return `[${pick(l)}]`;
      const prefix = TYPE_ICONS[l.line_type ?? "dialogue"];
      return `${(characters[l.character_index]?.name ?? "?").toUpperCase()}\n   ${prefix}${pick(l)}`;
    })
    .join("\n");
  const suffix = lang === "en" ? "_en" : "";
  download_file(header + content, `${title || "script"}${suffix}.txt`, "text/plain");
}

// ── Exportar como .json ──────────────────────────────────────────
export function export_json(
  lines: ScriptLine[],
  characters: Character[],
  title: string,
  title_en: string,
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
        current_scene.push({ type: "context", content: line.text, content_en: line.text_en || null });
      } else {
        current_scene.push({
          type: line.line_type ?? "dialogue",
          character: characters[line.character_index]?.name ?? "?",
          content: line.text,
          content_en: line.text_en || null,
        });
      }
    }
  }

  download_file(
    JSON.stringify(
      { id: script_id, name: title, name_en: title_en || null, characters: characters.map((c) => c.name), scenes },
      null,
      2,
    ),
    `${title || "script"}.json`,
    "application/json",
  );
}
