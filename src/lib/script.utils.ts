// src/lib/script.utils.ts
// Utilidades puras del dominio — sin estado, sin efectos secundarios

import { PERSPECTIVE_ALL, SCENE_MODES, DEFAULT_SCENE_MODE, type Character, type Lang, type SceneMode, type ScriptLine } from "@types/script";

// ── Perspectivas de una escena (visible_in) ──────────────────────
// Regla que aplica el juego: al elegir "ver todas las perspectivas" se ve todo;
// al elegir la perspectiva de un personaje, solo las escenas cuyo visible_in
// lo nombra. ["all"] (el valor por defecto) = escena que solo existe en la
// vista completa.
//
// Normaliza una lista: sin repetidos (sin distinguir mayúsculas), con los
// nombres escritos como en `names`, en el orden de los personajes, y sin
// "all" cuando hay nombres (la vista completa ya lo incluye todo). Una lista
// vacía vuelve a ["all"]. Los nombres que no son personajes se descartan.
export function normalize_visible_in(list: readonly string[] | undefined, names: readonly string[]): string[] {
  const wanted = new Set((list ?? []).map((n) => n.trim().toLowerCase()));
  const picked = names.filter((n) => wanted.has(n.trim().toLowerCase()));
  return picked.length ? picked : [PERSPECTIVE_ALL];
}

export const scene_visible_in = (line: ScriptLine | undefined): string[] =>
  line?.visible_in?.length ? line.visible_in : [PERSPECTIVE_ALL];

export const scene_mode = (line: ScriptLine | undefined): SceneMode =>
  line?.mode && (SCENE_MODES as readonly string[]).includes(line.mode) ? line.mode : DEFAULT_SCENE_MODE;

export const is_all_only = (visible_in: readonly string[]): boolean =>
  visible_in.length === 0 || (visible_in.length === 1 && visible_in[0] === PERSPECTIVE_ALL);

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
// Una línea que no existe todavía en el idioma exportado sale con el texto del
// otro idioma entre llaves dobles ({{...}}), para que se vea qué falta sin
// perder el orden. Las líneas vacías en ambos idiomas se omiten.
export function export_txt(lines: ScriptLine[], characters: Character[], title: string, lang: Lang = "es"): void {
  const header = `${title.toUpperCase()}\n${"─".repeat(48)}\n\n`;
  const own_of = (l: ScriptLine) => ((lang === "es" ? l.text : l.text_en) ?? "").trim();
  const other_of = (l: ScriptLine) => ((lang === "es" ? l.text_en : l.text) ?? "").trim();
  const pick = (l: ScriptLine) => own_of(l) || (other_of(l) ? `{{${other_of(l)}}}` : "");
  const content = lines
    .filter((l) => l.is_scene || pick(l) !== "")
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
//   · es → { name, characters, scenes: [{ scene_id?, pov?, mode, visible_in, lines: [{ type, character, content }] }] }
//          con el texto en español. scene_id (texto libre), pov (un personaje) y
//          mode ("render" | "static") son datos de la escena; scene_id y pov se
//          omiten si están vacíos. visible_in dice en qué perspectivas se ve
//          la escena: ["all"] = solo en "ver todas las perspectivas";
//          ["Haruto"] = también en la perspectiva de Haruto.
//   · en → lo mismo, con el texto en inglés
// En ambos la estructura (escenas, personajes, orden y tipos) se puede editar.
// Cada idioma lleva solo su texto: al aplicar, el texto del otro idioma se
// devuelve a cada línea (ver carry_other_language).
export type JsonLang = "es" | "en";

// Agrupa los índices de las líneas por escena (y guarda la línea de la escena,
// de donde sale su visible_in). Si hay líneas antes de la
// primera escena (p. ej. se borró la escena inicial) forman un bloque
// implícito, para que ningún contenido se pierda.
function group_scenes(lines: ScriptLine[]): { scene: ScriptLine | null; items: number[] }[] {
  const groups: { scene: ScriptLine | null; items: number[] }[] = [];
  let current: { scene: ScriptLine | null; items: number[] } | null = null;
  lines.forEach((line, i) => {
    if (line.is_scene) {
      current = { scene: line, items: [] };
      groups.push(current);
    } else {
      if (current === null) {
        current = { scene: null, items: [] };
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
  const scenes = group_scenes(lines).map((g) => ({
    ...(g.scene?.scene_id ? { scene_id: g.scene.scene_id } : {}),
    ...(g.scene?.pov ? { pov: g.scene.pov } : {}),
    mode: scene_mode(g.scene ?? undefined),
    visible_in: scene_visible_in(g.scene ?? undefined),
    lines: g.items.map((i) => {
      const line = lines[i];
      const content = (lang === "en" ? line.text_en : line.text) ?? "";
      if (line.is_context) return { type: "context", content };
      return {
        type: line.line_type ?? "dialogue",
        character: characters[line.character_index]?.name ?? "?",
        content,
      };
    }),
  }));
  return { name: lang === "en" ? title_en : title, characters: characters.map((c) => c.name), scenes };
}

// Cada campo es opcional: el JSON de cada idioma solo cambia su propio título.
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

// ── Texto del otro idioma al editar uno ─────────────────────────
// El JSON de cada idioma no lleva el texto del otro, así que al aplicarlo hay
// que devolver a cada línea su texto en el otro idioma. Se alinea el script
// anterior con el nuevo (prefijo/sufijo iguales + LCS en el medio) para que
// ese texto siga a su línea aunque se inserten, borren o muevan líneas; una
// línea editada en el mismo lugar conserva el suyo.
type TextField = "text" | "text_en";

function line_key(l: ScriptLine, names: string[], own: TextField): string {
  if (l.is_scene) return "scene";
  const who = l.is_context ? "" : (names[l.character_index] ?? "?");
  return `${l.is_context ? "context" : (l.line_type ?? "dialogue")}|${who}|${l[own] ?? ""}`;
}

const MAX_LCS_CELLS = 4_000_000;

export function carry_other_language(
  old_lines: ScriptLine[],
  old_names: string[],
  new_lines: ScriptLine[],
  new_names: string[],
  own: TextField,
): ScriptLine[] {
  const other: TextField = own === "text" ? "text_en" : "text";
  const ok = old_lines.map((l) => line_key(l, old_names, own));
  const nk = new_lines.map((l) => line_key(l, new_names, own));
  const match = new Array<number>(new_lines.length).fill(-1); // índice nuevo → índice viejo

  // Mismo largo y misma forma, y cada línea cambiada tiene un texto que antes no
  // existía en ningún lado: son ediciones en el lugar (p. ej. completar las
  // líneas sin traducir). Se emparejan por posición; así no hay ambigüedad con
  // líneas que antes eran idénticas (todas vacías).
  const old_keys = new Set(ok);
  const in_place =
    old_lines.length === new_lines.length &&
    new_lines.every((l, i) => !!l.is_scene === !!old_lines[i].is_scene && (ok[i] === nk[i] || !old_keys.has(nk[i])));

  if (in_place) {
    for (let i = 0; i < new_lines.length; i++) if (!new_lines[i].is_scene) match[i] = i;
  } else {
    let start = 0;
    while (start < ok.length && start < nk.length && ok[start] === nk[start]) start++;
    let oe = ok.length;
    let ne = nk.length;
    while (oe > start && ne > start && ok[oe - 1] === nk[ne - 1]) { oe--; ne--; }

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
  }

  return new_lines.map((l, i) => {
    if (l.is_scene || match[i] === -1) return l;
    const text = old_lines[match[i]][other];
    return text ? { ...l, [other]: text } : l;
  });
}

export interface ParseContext {
  lang: JsonLang;
  /** Script tal como estaba al abrir la vista JSON (con el texto de ambos idiomas). */
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
    if (!Array.isArray(raw.scenes)) fail('Falta "scenes" (una lista de escenas: { "visible_in": [...], "lines": [...] })');

    const title = raw.name ?? "";
    if (typeof title !== "string") fail('"name" debe ser texto');

    const own: TextField = ctx.lang === "en" ? "text_en" : "text";
    const other: TextField = ctx.lang === "en" ? "text" : "text_en";

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
    // visible_in se resuelve al final: una escena puede nombrar a un personaje
    // que recién aparece en una escena posterior.
    const scene_perspectives: { line: ScriptLine; path: string; requested: string[]; pov?: string }[] = [];
    raw.scenes.forEach((scene: unknown, si: number) => {
      // Formato anterior: la escena era directamente la lista de líneas.
      let scene_lines: unknown = scene;
      let requested: string[] = [PERSPECTIVE_ALL];
      let scene_id: string | undefined;
      let pov: string | undefined;
      let mode: SceneMode = DEFAULT_SCENE_MODE;
      if (scene && typeof scene === "object" && !Array.isArray(scene)) {
        const s = scene as { visible_in?: unknown; lines?: unknown; scene_id?: unknown; pov?: unknown; mode?: unknown };
        scene_lines = s.lines;
        if (s.scene_id !== undefined && s.scene_id !== null) {
          if (typeof s.scene_id !== "string") fail(`scenes[${si}].scene_id debe ser texto`);
          scene_id = s.scene_id.trim() || undefined;
        }
        if (s.pov !== undefined && s.pov !== null) {
          if (typeof s.pov !== "string") fail(`scenes[${si}].pov debe ser el nombre de un personaje`);
          pov = s.pov.trim() || undefined;
        }
        if (s.mode !== undefined && s.mode !== null) {
          if (typeof s.mode !== "string" || !(SCENE_MODES as readonly string[]).includes(s.mode)) {
            fail(`scenes[${si}].mode debe ser ${SCENE_MODES.map((m) => `"${m}"`).join(" o ")}`);
          }
          mode = s.mode as SceneMode;
        }
        if (s.visible_in !== undefined && s.visible_in !== null) {
          const vi = s.visible_in;
          if (!Array.isArray(vi)) fail(`scenes[${si}].visible_in debe ser una lista, p. ej. ["all"] o ["Haruto"]`);
          vi.forEach((p: unknown, pi: number) => {
            if (typeof p !== "string" || !p.trim()) fail(`scenes[${si}].visible_in[${pi}] debe ser "all" o el nombre de un personaje`);
          });
          requested = vi.map((p: string) => p.trim());
        }
      }
      if (!Array.isArray(scene_lines)) fail(`scenes[${si}] debe ser { "visible_in": [...], "lines": [...] }`);
      const scene_line: ScriptLine = { is_scene: true, scene_number: si + 1, character_index: -1, visible_in: [PERSPECTIVE_ALL], mode };
      if (scene_id) scene_line.scene_id = scene_id;
      lines.push(scene_line);
      scene_perspectives.push({ line: scene_line, path: `scenes[${si}].visible_in`, requested, pov });
      (scene_lines as unknown[]).forEach((item: any, ii: number) => {
        const path = `scenes[${si}].lines[${ii}]`;
        if (!item || typeof item !== "object" || Array.isArray(item)) fail(`${path} debe ser un objeto`);
        const type = item.type ?? "dialogue";
        if (!JSON_LINE_TYPES.includes(type)) fail(`${path}: "type" debe ser ${JSON_LINE_TYPES.join(", ")}`);
        if (typeof item.content !== "string") fail(`${path}: falta "content" (texto)`);

        if (type === "context") {
          lines.push({ is_context: true, character_index: -1, [own]: item.content, [other]: "" });
          return;
        }
        if (typeof item.character !== "string" || !item.character.trim()) fail(`${path}: falta "character"`);
        const name = item.character.trim();
        let idx = names.findIndex((x) => x.toLowerCase() === name.toLowerCase());
        if (idx === -1) {
          names.push(name);
          idx = names.length - 1;
        }
        lines.push({ character_index: idx, [own]: item.content, [other]: "", line_type: type });
      });
    });

    for (const sp of scene_perspectives) {
      const known = sp.requested.filter((p) => p.toLowerCase() !== PERSPECTIVE_ALL);
      const unknown = known.find((p) => !names.some((n) => n.toLowerCase() === p.toLowerCase()));
      if (unknown !== undefined) fail(`${sp.path}: "${unknown}" no es "all" ni un personaje del guion`);
      sp.line.visible_in = normalize_visible_in(known, names);
      if (sp.pov !== undefined) {
        const match = names.find((n) => n.toLowerCase() === sp.pov!.toLowerCase());
        if (match === undefined) fail(`${sp.path.replace(/visible_in$/, "pov")}: "${sp.pov}" no es un personaje del guion`);
        sp.line.pov = match;
      }
    }

    const data: ScriptJsonData = {
      characters: names,
      lines: carry_other_language(ctx.base_lines, ctx.base_names, lines, names, own),
    };
    if (ctx.lang === "en") data.title_en = title;
    else data.title = title;
    return { ok: true, data };
  } catch (e) {
    if (e instanceof JsonViewError) return { ok: false, error: e.message };
    throw e;
  }
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
