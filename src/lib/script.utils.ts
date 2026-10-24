
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

// ── Script ⇄ JSON ────────────────────────────────────────────────
// La vista JSON es independiente por idioma, así nada se duplica:
//   · es → { name, characters, scenes: [[{ type, character, content }]] }
//          (solo texto en español; es la fuente de la estructura)
//   · en → { name, scenes: [[{ type, character, content }]] }
//          (solo texto en inglés; type/character son de referencia, la
//           estructura se cambia en español)
// En la pestaña English, la comparativa con el original sale directamente del
// script en español: el JSON en inglés no lo repite.
export type JsonLang = "es" | "en";

// Agrupa los índices de las líneas por escena. Si hay líneas antes de la
// primera escena (p. ej. se borró la escena inicial) forman un bloque
// implícito, para que ningún contenido se pierda.
function group_scenes(lines: ScriptLine[]): { items: number[] }[] {
  const groups: { items: number[] }[] = [];
  let current: { items: number[] } | null = null;
  lines.forEach((line, i) => {
    if (line.is_scene) {
      current = { items: [] };
      groups.push(current);
    } else {
      if (current === null) {
        current = { items: [] };
        groups.push(current);
      }
      current.items.push(i);
    }
  });
  return groups;
}

export function build_script_json(
  lines: ScriptLine[],
  characters: Character[],
  title: string,
  title_en: string,
  lang: JsonLang = "es",
) {
  const scenes = group_scenes(lines).map((g) =>
    g.items.map((i) => {
      const line = lines[i];
      const content = (lang === "en" ? line.text_en : line.text) ?? "";
      if (line.is_context) return { type: "context", content };
      return {
        type: line.line_type ?? "dialogue",
        character: characters[line.character_index]?.name ?? "?",
        content,
      };
    }),
  );
  if (lang === "en") return { name: title_en, scenes };
  return { name: title, characters: characters.map((c) => c.name), scenes };
}

// Cada campo es opcional: el JSON en inglés solo toca title_en y text_en.
export interface ScriptJsonData {
  title?: string;
  title_en?: string;
  characters?: string[];
  lines: ScriptLine[];
}
export type ParseScriptJsonResult = { ok: true; data: ScriptJsonData } | { ok: false; error: string };

const JSON_LINE_TYPES = ["dialogue", "thought", "narration", "context"];

class JsonViewError extends Error {}
function fail(msg: string): never {
  throw new JsonViewError(msg);
}

// ── Traducciones al editar el español ───────────────────────────
// El JSON en español no lleva el inglés, así que al aplicarlo hay que
// devolver a cada línea su traducción. Se alinea el script anterior con el
// nuevo (prefijo/sufijo iguales + LCS en el medio) para que la traducción
// siga a su línea aunque se inserten, borren o muevan líneas; una línea
// editada en el mismo lugar conserva la suya.
function line_key(l: ScriptLine, names: string[]): string {
  if (l.is_scene) return "scene";
  const who = l.is_context ? "" : (names[l.character_index] ?? "?");
  return `${l.is_context ? "context" : (l.line_type ?? "dialogue")}|${who}|${l.text ?? ""}`;
}

const MAX_LCS_CELLS = 4_000_000;

export function carry_translations(
  old_lines: ScriptLine[],
  old_names: string[],
  new_lines: ScriptLine[],
  new_names: string[],
): ScriptLine[] {
  const ok = old_lines.map((l) => line_key(l, old_names));
  const nk = new_lines.map((l) => line_key(l, new_names));

  let start = 0;
  while (start < ok.length && start < nk.length && ok[start] === nk[start]) start++;
  let oe = ok.length;
  let ne = nk.length;
  while (oe > start && ne > start && ok[oe - 1] === nk[ne - 1]) { oe--; ne--; }

  const match = new Array<number>(new_lines.length).fill(-1); // índice nuevo → índice viejo
  for (let i = 0; i < start; i++) match[i] = i;
  for (let k = 0; k < ok.length - oe; k++) match[ne + k] = oe + k;

  const n = oe - start;
  const m = ne - start;
  if (n > 0 && m > 0 && n * m <= MAX_LCS_CELLS) {
    const w = m + 1;
    const dp = new Int32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = ok[start + i] === nk[start + j]
          ? dp[(i + 1) * w + j + 1] + 1
          : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (ok[start + i] === nk[start + j]) { match[start + j] = start + i; i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
      else j++;
    }
  }

  // Líneas movidas de lugar: sin coincidencia en el LCS pero idénticas a una
  // línea vieja que tampoco se emparejó.
  const matched_old = () => new Set(match.filter((x) => x !== -1));
  const used_old = matched_old();
  const free_old = new Map<string, number[]>();
  ok.forEach((k, i) => {
    if (k === "scene" || used_old.has(i)) return;
    (free_old.get(k) ?? free_old.set(k, []).get(k)!).push(i);
  });
  for (let j = 0; j < new_lines.length; j++) {
    if (match[j] !== -1 || nk[j] === "scene") continue;
    const candidates = free_old.get(nk[j]);
    if (candidates?.length) match[j] = candidates.shift()!;
  }

  // Huecos entre coincidencias con la misma cantidad de líneas a cada lado:
  // son ediciones en el lugar, así que se emparejan por posición.
  let prev_new = -1;
  let prev_old = -1;
  for (let j = 0; j <= new_lines.length; j++) {
    if (j < new_lines.length && match[j] === -1) continue;
    const next_old = j < new_lines.length ? match[j] : old_lines.length;
    const gap_new = j - prev_new - 1;
    const gap_old = next_old - prev_old - 1;
    if (gap_new > 0 && gap_new === gap_old) {
      for (let g = 1; g <= gap_new; g++) {
        const a = prev_new + g;
        const b = prev_old + g;
        // `b` no debe estar ya usado por una línea movida.
        if (!new_lines[a].is_scene && !old_lines[b].is_scene && !matched_old().has(b)) match[a] = b;
      }
    }
    // Un salto hacia atrás (línea movida) no sirve de ancla para el siguiente hueco.
    if (j < new_lines.length && next_old < prev_old) continue;
    prev_new = j;
    prev_old = next_old;
  }

  return new_lines.map((l, i) => {
    if (l.is_scene || match[i] === -1) return l;
    const en = old_lines[match[i]].text_en;
    return en ? { ...l, text_en: en } : l;
  });
}

export interface ParseContext {
  lang: JsonLang;
  /** Script tal como estaba al abrir la vista JSON (con sus traducciones). */
  base_lines: ScriptLine[];
  base_names: string[];
}

// Valida el texto JSON editado a mano y lo convierte al modelo interno.
export function parse_script_json(text: string, ctx: ParseContext): ParseScriptJsonResult {
  try {
    let raw: any;
    try {
      raw = JSON.parse(text);
    } catch (e: any) {
      fail(`JSON inválido: ${e?.message ?? "error de sintaxis"}`);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("La raíz debe ser un objeto { ... }");
    if (!Array.isArray(raw.scenes)) fail('Falta "scenes" (una lista de escenas, cada una una lista de líneas)');

    const title = raw.name ?? "";
    if (typeof title !== "string") fail('"name" debe ser texto');

    return ctx.lang === "en" ? parse_en(raw, title, ctx) : parse_es(raw, title, ctx);
  } catch (e) {
    if (e instanceof JsonViewError) return { ok: false, error: e.message };
    throw e;
  }
}

function parse_es(raw: any, title: string, ctx: ParseContext): ParseScriptJsonResult {
  const names: string[] = [];
  if (raw.characters !== undefined && raw.characters !== null) {
    if (!Array.isArray(raw.characters)) fail('"characters" debe ser una lista de nombres');
    raw.characters.forEach((c: unknown, i: number) => {
      if (typeof c !== "string" || !c.trim()) fail(`characters[${i}] debe ser un nombre (texto no vacío)`);
      const name = (c as string).trim();
      if (names.some((x) => x.toLowerCase() === name.toLowerCase())) fail(`Personaje repetido: "${name}"`);
      names.push(name);
    });
  }

  const lines: ScriptLine[] = [];
  raw.scenes.forEach((scene: unknown, si: number) => {
    if (!Array.isArray(scene)) fail(`scenes[${si}] debe ser una lista de líneas`);
    lines.push({ is_scene: true, scene_number: si + 1, character_index: -1 });
    (scene as unknown[]).forEach((item: any, ii: number) => {
      const path = `scenes[${si}][${ii}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) fail(`${path} debe ser un objeto`);
      const type = item.type ?? "dialogue";
      if (!JSON_LINE_TYPES.includes(type)) fail(`${path}: "type" debe ser ${JSON_LINE_TYPES.join(", ")}`);
      if (typeof item.content !== "string") fail(`${path}: falta "content" (texto)`);

      if (type === "context") {
        lines.push({ is_context: true, character_index: -1, text: item.content, text_en: "" });
        return;
      }
      if (typeof item.character !== "string" || !item.character.trim()) fail(`${path}: falta "character"`);
      const name = item.character.trim();
      let idx = names.findIndex((x) => x.toLowerCase() === name.toLowerCase());
      if (idx === -1) {
        names.push(name);
        idx = names.length - 1;
      }
      lines.push({ character_index: idx, text: item.content, text_en: "", line_type: type });
    });
  });

  return {
    ok: true,
    data: { title, characters: names, lines: carry_translations(ctx.base_lines, ctx.base_names, lines, names) },
  };
}

// En inglés solo cambia el texto traducido: la estructura sale del español,
// así que cada escena debe tener la misma cantidad de líneas.
function parse_en(raw: any, title_en: string, ctx: ParseContext): ParseScriptJsonResult {
  const groups = group_scenes(ctx.base_lines);
  if (raw.scenes.length !== groups.length) {
    fail(`"scenes" tiene ${raw.scenes.length} escenas y el script en español tiene ${groups.length}. La estructura se cambia en la vista Español`);
  }
  const texts = new Map<number, string>();
  raw.scenes.forEach((scene: unknown, si: number) => {
    if (!Array.isArray(scene)) fail(`scenes[${si}] debe ser una lista de líneas`);
    const expected = groups[si].items;
    if ((scene as unknown[]).length !== expected.length) {
      fail(`scenes[${si}] tiene ${(scene as unknown[]).length} líneas y en español hay ${expected.length}. La estructura se cambia en la vista Español`);
    }
    (scene as unknown[]).forEach((item: any, ii: number) => {
      const path = `scenes[${si}][${ii}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) fail(`${path} debe ser un objeto`);
      const content = item.content ?? "";
      if (typeof content !== "string") fail(`${path}: "content" debe ser texto`);
      texts.set(expected[ii], content.trim());
    });
  });

  const lines = ctx.base_lines.map((l, i) => (texts.has(i) ? { ...l, text_en: texts.get(i)! } : l));
  return { ok: true, data: { title_en, lines } };
}

// ── Exportar como .json ──────────────────────────────────────────
// Sigue al idioma activo, igual que el .txt: un archivo por idioma.
export function export_json(
  lines: ScriptLine[],
  characters: Character[],
  title: string,
  title_en: string,
  script_id: string | null,
  lang: JsonLang = "es",
): void {
  const name = lang === "en" ? title_en || title : title;
  download_file(
    JSON.stringify({ id: script_id, ...build_script_json(lines, characters, title, title_en, lang) }, null, 2),
    `${name || "script"}${lang === "en" ? ".en" : ""}.json`,
    "application/json",
  );
}
