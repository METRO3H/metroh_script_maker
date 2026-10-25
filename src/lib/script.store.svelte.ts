

// src/lib/script.store.svelte.ts
import { tick } from "svelte";
import type { Character, Lang, Project, ScriptLine } from "@types/script";
import { export_txt, export_json, type ScriptJsonData } from "@lib/script.utils";
import { create_suggester, type Suggester, type Suggestion } from "@lib/suggest/suggest.engine";
import { fetch_custom_words, add_custom_words, migrate_legacy_words, type WordLang } from "@lib/suggest/learned_words";
import { load_word_files } from "@lib/suggest/word_files";
import { show_toast as push_toast } from "@lib/toast.svelte";

function init_state(script: any) {
  if (!script) return { id: null, title: "", title_en: "", project_id: null, characters: [], lines: [] };
  const chars: Character[] = (script.characters ?? []).map((c: any, i: number) => ({ name: c.name, id: i + 1 }));
  const char_index = Object.fromEntries(chars.map((c, i) => [c.name, i]));
  const lines: ScriptLine[] = (script.lines ?? []).map((l: any) => {
    if (l.line_type === "scene") return { is_scene: true, scene_number: l.scene_number } as ScriptLine;
    if (l.line_type === "context") return { is_context: true, character_index: -1, text: l.content ?? "", text_en: l.content_en ?? "" } as ScriptLine;
    return { character_index: char_index[l.character_name] ?? 0, text: l.content ?? "", text_en: l.content_en ?? "", line_type: l.line_type ?? "dialogue" } as ScriptLine;
  });
  return { id: script.id, title: script.name, title_en: script.name_en ?? "", project_id: script.project_id ?? null, characters: chars, lines };
}

export function create_script_store(
  initialScript: any = null,
  initialProjects: Project[] = [],
  defaultProjectId: string | null = null,
) {
  const init = init_state(initialScript);

  let script_id         = $state<string | null>(init.id);
  let script_title      = $state<string>(init.title);
  let script_title_en   = $state<string>(init.title_en);
  let lang              = $state<Lang>("es");
  let project_id        = $state<string | null>(init.project_id ?? (initialScript ? null : defaultProjectId));
  let projects          = $state<Project[]>(initialProjects);
  let characters        = $state<Character[]>(init.characters);
  let full_script       = $state<ScriptLine[]>(init.lines);
  let current_input     = $state<string>("");
  let current_character = $state<number>(0);
  let current_type      = $state<string>("dialogue");
  let save_status       = $state<string | null>(null);
  let show_onboarding   = $state<boolean>(initialScript === null);
  let view_mode         = $state<"normal" | "json">("normal");
  let select_mode       = $state<boolean>(false);
  let selected          = $state<Set<number>>(new Set());
  let rect_active       = $state<boolean>(false);
  let rect_pending      = $state<boolean>(false);
  let rect_start_x      = $state<number>(0);
  let rect_start_y      = $state<number>(0);
  let rect_cur_x        = $state<number>(0);
  let rect_cur_y        = $state<number>(0);
  let lines_area_el     = $state<HTMLElement | null>(null);
  let toast_timeout: ReturnType<typeof setTimeout> | null = null;

  // ── Guardado y cambios sin guardar ───────────────────────────
  // is_saving evita guardados simultáneos (p. ej. Ctrl+S dos veces con un
  // script nuevo creaba dos scripts). saved_snapshot es la "foto" del
  // contenido en el último guardado/carga: si difiere de la actual, hay
  // cambios sin guardar.
  let is_saving      = $state(false);
  let saved_snapshot = $state("");

  function make_snapshot(): string {
    return JSON.stringify([
      script_title,
      script_title_en,
      project_id,
      characters.map((c) => c.name),
      full_script.map((l) => [
        l.is_scene ? 1 : 0, l.is_context ? 1 : 0, l.line_type ?? "",
        l.character_index, l.text ?? "", l.text_en ?? "", l.scene_number ?? 0,
      ]),
    ]);
  }
  saved_snapshot = make_snapshot();
  let is_dirty = $derived(make_snapshot() !== saved_snapshot);

  // ── Sugerencias de palabras (local, sin IA) ──────────────────
  // Un suggester por idioma: cada pestaña sugiere con su propio diccionario.
  // No son reactivos por sí mismos: vocab_version sube cada vez que aprenden
  // algo nuevo para que `suggestions` se recalcule.
  const suggesters: Record<Lang, Suggester> = { es: create_suggester(), en: create_suggester() };
  let vocab_version = $state(0);

  function learn_from(text: string | undefined, for_lang: Lang = lang) {
    if (!text) return;
    suggesters[for_lang].learn(text);
    vocab_version++;
  }
  // Vocabulario inicial: lo que ya tiene el guion al abrirlo.
  for (const sg of Object.values(suggesters)) sg.learn_names(init.characters.map((c) => c.name));
  for (const l of init.lines) {
    if (l.is_scene) continue;
    suggesters.es.learn(l.text ?? "");
    suggesters.en.learn(l.text_en ?? "");
  }
  // Los diccionarios base vienen de archivos de texto (public/words/): al
  // terminar de cargar, se fuerza el recálculo de las sugerencias.
  for (const lg of ["es", "en"] as const) load_word_files(suggesters[lg], lg, () => vocab_version++);

  // Palabras personalizadas de la cuenta (tabla custom_words): las que la
  // persona usó en sus guiones y no están en el diccionario. Prioridad media:
  // entre tus palabras de <idioma>.custom.txt y el diccionario base.
  const LEARNED_SCORE = 3.5;
  const learned_words: Record<WordLang, string[]> = { es: [], en: [] };

  async function load_custom_words() {
    if (typeof window === "undefined") return;
    await migrate_legacy_words(); // palabras que una versión anterior guardó solo en el navegador
    const remote = await fetch_custom_words();
    for (const lg of ["es", "en"] as const) {
      learned_words[lg] = remote[lg];
      if (remote[lg].length) suggesters[lg].load_words(remote[lg].join("\n"), { score: LEARNED_SCORE });
    }
    vocab_version++;
  }
  load_custom_words();

  const MAX_SUGGESTIONS = 5;
  let computed_suggestions = $derived.by(() => {
    vocab_version;
    for (const sg of Object.values(suggesters)) sg.learn_names(characters.map((c) => c.name));
    return suggesters[lang].suggest(current_input, MAX_SUGGESTIONS);
  });

  // Tab repetido: la primera vez aplica la primera sugerencia; cada Tab
  // siguiente la reemplaza por la que sigue (Shift+Tab, por la anterior). La
  // sesión vale mientras el input siga siendo exactamente lo que aplicó: si se
  // escribe cualquier otra cosa o se cambia de idioma, termina sola.
  interface TabSession { base_input: string; list: Suggestion[]; index: number; applied: string; lang: Lang }
  let tab_session = $state<TabSession | null>(null);
  let session_active = $derived(tab_session !== null && tab_session.lang === lang && tab_session.applied === current_input);
  let suggestions = $derived(session_active ? tab_session!.list : computed_suggestions);
  let active_suggestion = $derived(session_active ? tab_session!.index : -1);

  function select_in_session(session: TabSession, index: number) {
    const applied = capitalize_first(suggesters[session.lang].apply(session.base_input, session.list[index].word));
    tab_session = { ...session, index, applied };
    current_input = applied;
  }

  function start_session(): TabSession | null {
    if (session_active) return tab_session;
    if (computed_suggestions.length === 0) return null;
    return { base_input: current_input, list: computed_suggestions, index: -1, applied: "", lang };
  }

  /** Devuelve true si hizo algo (para que el input decida si frena el Tab normal). */
  function cycle_suggestion(dir: 1 | -1): boolean {
    // Shift+Tab solo retrocede dentro de una sesión; fuera de ella sigue siendo
    // el "foco anterior" de siempre.
    if (dir < 0 && !session_active) return false;
    const session = start_session();
    if (!session) return false;
    const n = session.list.length;
    select_in_session(session, (session.index + dir + n) % n);
    return true;
  }

  function apply_suggestion(word: string) {
    const session = start_session();
    const i = session ? session.list.findIndex((sg) => sg.word === word) : -1;
    if (session && i !== -1) select_in_session(session, i);
    else current_input = capitalize_first(suggesters[lang].apply(current_input, word));
  }

  // Al guardar, las palabras que no existen en el diccionario del idioma se
  // guardan en la cuenta y se suman a las sugerencias (también en otros guiones).
  async function remember_unknown_words(lg: Lang, texts: string[]) {
    const known = new Set(learned_words[lg]);
    const fresh = suggesters[lg].find_unknown_words(texts).filter((w) => !known.has(w));
    if (fresh.length === 0) return;
    // Se sugieren de inmediato, se haya podido guardar o no.
    suggesters[lg].load_words(fresh.join("\n"), { score: LEARNED_SCORE });
    vocab_version++;
    const saved = await add_custom_words(lg, fresh);
    const where = lg === "es" ? "español" : "inglés";
    if (saved) {
      learned_words[lg].push(...fresh);
      const sample = fresh.slice(0, 4).join(", ") + (fresh.length > 4 ? "…" : "");
      push_toast(`${fresh.length} ${fresh.length === 1 ? "palabra nueva añadida" : "palabras nuevas añadidas"} a las sugerencias (${where}): ${sample}`, "neutral", { key: `learned-words-${lg}`, duration: 4000 });
    } else {
      // No se agregan a learned_words: el próximo guardado lo reintenta.
      push_toast(`No se pudieron guardar en tu cuenta las palabras nuevas (${where}); se reintentará al guardar`, "error", { key: `learned-words-${lg}` });
    }
  }
  const RECT_THRESHOLD = 6;
  // El mínimo alcanza para el badge más largo ("Pensamiento"); antes era ~60px
  // y por eso los badges salían cortados.
  const LABEL_MIN_PX = 96;
  const LABEL_MAX_PX = 140;
  const CHAR_PX = 7.5;

  let rect_style = $derived.by(() => {
    const x = Math.min(rect_start_x, rect_cur_x);
    const y = Math.min(rect_start_y, rect_cur_y);
    const w = Math.abs(rect_cur_x - rect_start_x);
    const h = Math.abs(rect_cur_y - rect_start_y);
    return `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  });

  let label_width = $derived.by(() => {
    const longest = characters.reduce((max, c) => Math.max(max, c.name.length), "contexto".length);
    return Math.min(Math.max(Math.ceil(longest * CHAR_PX), LABEL_MIN_PX), LABEL_MAX_PX);
  });

  // Líneas que ya tienen texto en español y cuántas de ellas ya están en inglés.
  // (Una línea escrita primero en inglés no cuenta hasta tener su versión en español.)
  let translatable_count = $derived(full_script.filter((l) => !l.is_scene && (l.text ?? "").trim() !== "").length);
  let translated_count = $derived(full_script.filter((l) => !l.is_scene && (l.text ?? "").trim() !== "" && (l.text_en ?? "").trim() !== "").length);

  let current_scene_number = $derived.by(() => {
    const scenes = full_script.filter((l) => l.is_scene);
    return scenes.length > 0 ? scenes[scenes.length - 1].scene_number ?? 0 : 0;
  });

  function handle_onboarding_done({ title, characters: chars }: { title: string; characters: string[] }) {
    script_title = title;
    characters = chars.map((name, i) => ({ name, id: i + 1 }));
    full_script = [{ is_scene: true, scene_number: 1, character_index: -1 }];
    show_onboarding = false;
  }

  // Bajar hasta el final SOLO cuando se agrega algo al final del guion. Antes
  // un effect sobre full_script.length bajaba ante cualquier cambio de tamaño
  // (insertar una escena o línea en medio, borrar, aplicar el JSON...).
  function scroll_to_bottom() {
    tick().then(() => {
      if (lines_area_el) lines_area_el.scrollTo({ top: lines_area_el.scrollHeight, behavior: "smooth" });
    });
  }

  function insert_scene(at_index: number) {
    const at_end = at_index >= full_script.length;
    const n = full_script.slice(0, at_index).filter((l) => l.is_scene).length + 1;
    const after = full_script.slice(at_index).map((l) => (l.is_scene ? { ...l, scene_number: (l.scene_number ?? 0) + 1 } : l));
    full_script = [...full_script.slice(0, at_index), { is_scene: true, scene_number: n, character_index: -1 }, ...after];
    if (at_end) scroll_to_bottom();
  }

  // Línea vacía en `at_index` (queda antes de la que estaba ahí), con el
  // personaje y tipo que estén elegidos abajo. Las líneas vacías no se guardan.
  function insert_line(at_index: number): boolean {
    if (select_mode) return false;
    const is_context = current_character === -1;
    if (!is_context && !characters[current_character]) {
      push_toast("Crea o elige un personaje para poder añadir una línea", "error", { key: "insert-line" });
      return false;
    }
    const blank: ScriptLine = is_context
      ? { is_context: true, character_index: -1, text: "", text_en: "" }
      : { character_index: current_character, text: "", text_en: "", line_type: current_type };
    full_script = [...full_script.slice(0, at_index), blank, ...full_script.slice(at_index)];
    return true;
  }

  // Mueve la línea `from` para que quede insertada en la posición `at` del
  // arreglo original (0 = al principio, length = al final). Devuelve el nuevo
  // índice, o null si no hubo cambio. Las escenas no se mueven, así que su
  // numeración sigue igual; la traducción viaja con la línea.
  function move_line(from: number, at: number): number | null {
    if (select_mode) return null;
    const item = full_script[from];
    if (!item || item.is_scene) return null;
    const target = Math.max(0, Math.min(at, full_script.length));
    if (target === from || target === from + 1) return null;
    const rest = full_script.filter((_, i) => i !== from);
    const dest = target > from ? target - 1 : target;
    full_script = [...rest.slice(0, dest), item, ...rest.slice(dest)];
    return dest;
  }

  function delete_scene(index: number) {
    const before = full_script.slice(0, index);
    const after = full_script.slice(index + 1).map((l) => (l.is_scene ? { ...l, scene_number: (l.scene_number ?? 0) - 1 } : l));
    full_script = [...before, ...after];
  }

  function scroll_to_scene(scene_number: number, scene_refs: Record<number, HTMLElement>) {
    const idx = full_script.findIndex((l) => l.is_scene && l.scene_number === scene_number);
    if (idx === -1) return;
    const el = scene_refs[idx];
    if (el && lines_area_el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handle_delete_character({ index, mode }: { index: number; mode: string }) {
    if (mode === "remove_lines") {
      full_script = full_script.filter((l) => l.is_scene || l.character_index !== index);
    } else {
      const unknown_count = characters.filter((c) => c.name.startsWith("Desconocido ")).length;
      const unknown_name = `Desconocido ${unknown_count + 1}`;
      const new_chars = [...characters, { name: unknown_name, id: Date.now() }];
      const unknown_index = new_chars.length - 1;
      full_script = full_script.map((l) => !l.is_scene && l.character_index === index ? { ...l, character_index: unknown_index } : l);
      characters = new_chars;
    }
    const next_chars = characters.filter((_, i) => i !== index);
    full_script = full_script.map((l) => l.is_scene ? l : { ...l, character_index: l.character_index > index ? l.character_index - 1 : l.character_index });
    characters = next_chars;
    // Igual que con las líneas: si el personaje activo era el borrado, resetear;
    // si estaba después en la lista, correrlo un lugar para que siga apuntando
    // al mismo personaje (antes esto solo se corregía si quedaba fuera de rango).
    if (current_character === index) current_character = 0;
    else if (current_character > index) current_character -= 1;
  }

  // ── Auto-capitalizar ─────────────────────────────────────────
  function capitalize_first(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function handle_input_change(value: string): string {
    return capitalize_first(value);
  }

  // El texto que se escribe y se edita es el del idioma de la pestaña activa;
  // la otra versión de la línea queda vacía hasta que se escriba en su pestaña.
  function save_input() {
    const input = capitalize_first(current_input.trim());
    if (!input) return;
    const own = lang === "en" ? { text: "", text_en: input } : { text: input, text_en: "" };
    if (current_character === -1) {
      full_script = [...full_script, { is_context: true, character_index: -1, ...own }];
    } else {
      full_script = [...full_script, { character_index: current_character, ...own, line_type: current_type }];
    }
    learn_from(input);
    current_input = "";
    scroll_to_bottom();
  }

  function update_line(new_text: string, i: number) {
    const field = lang === "en" ? "text_en" : "text";
    const next = lang === "en" ? new_text.trim() : capitalize_first(new_text);
    if ((full_script[i]?.[field] ?? "") === next) return;
    learn_from(next);
    full_script = full_script.map((l, index) => (index === i ? { ...l, [field]: next } : l));
  }

  // ── Idioma activo ────────────────────────────────────────────
  // Cada línea tiene su texto en español y en inglés. Las dos pestañas editan
  // el mismo guion (escenas, personajes, orden y tipos son compartidos); lo que
  // cambia es qué texto se escribe y se ve como principal.
  function set_lang(next: Lang) {
    if (next === lang) return;
    if (select_mode) exit_select_mode();
    _json_flush?.(); // si la vista JSON tiene algo pendiente, aplicarlo antes de cambiar de idioma
    lang = next;
  }

  // Líneas a las que les falta el texto del idioma activo pero tienen el del
  // otro: en English, las que aún no están traducidas; en Español, las que
  // se escribieron primero en inglés.
  const lacks = (l: ScriptLine, in_lang: Lang) =>
    !l.is_scene && (in_lang === "en" ? (l.text ?? "") : (l.text_en ?? "")).trim() !== "" && (in_lang === "en" ? (l.text_en ?? "") : (l.text ?? "")).trim() === "";
  let missing_count = $derived(full_script.filter((l) => lacks(l, lang)).length);

  function focus_first_missing() {
    const idx = full_script.findIndex((l) => lacks(l, lang));
    if (idx === -1) return;
    const el = document.getElementById(`script${idx}`) as HTMLInputElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  }

  // ── Proyectos ────────────────────────────────────────────────
  function set_project(id: string | null) { project_id = id; }

  async function create_project(name: string): Promise<boolean> {
    const clean = name.trim();
    if (!clean) return false;
    try {
      const res = await fetch("/api/project/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      if (!res.ok) return false;
      const { project_id: new_id } = await res.json();
      projects = [...projects, { id: new_id, name: clean }].sort((a, b) => a.name.localeCompare(b.name, "es"));
      project_id = new_id;
      return true;
    } catch {
      return false;
    }
  }

  function delete_line(index: number) {
    if (select_mode) return;
    full_script = full_script.filter((_, i) => i !== index);
  }

  // ── Vista JSON ───────────────────────────────────────────────
  // La vista JSON registra acá una función que aplica al instante lo último
  // escrito (hay un debounce); se usa al guardar y al volver a la vista normal.
  let _json_flush: (() => void) | null = null;
  function set_json_flush_handler(fn: (() => void) | null) { _json_flush = fn; }

  function set_view_mode(next: "normal" | "json") {
    if (next === view_mode) return;
    if (next === "json") exit_select_mode();
    else _json_flush?.();
    view_mode = next;
  }

  // El JSON en inglés solo trae title_en y las líneas; el de español, el resto.
  function apply_json(data: ScriptJsonData) {
    if (data.title !== undefined) script_title = data.title;
    if (data.title_en !== undefined) script_title_en = data.title_en;
    if (data.characters) {
      characters = data.characters.map((name, i) => ({ name, id: i + 1 }));
      if (current_character >= characters.length) current_character = 0;
    }
    full_script = data.lines;
    selected = new Set();
  }

  function enter_select_mode(index: number) { select_mode = true; selected = new Set([index]); }
  function exit_select_mode() { select_mode = false; selected = new Set(); rect_active = false; rect_pending = false; }

  function toggle_select(index: number) {
    if (!full_script[index]?.is_scene) {
      const s = new Set(selected);
      if (s.has(index)) s.delete(index); else s.add(index);
      selected = s;
    }
  }

  let _on_request_batch_delete: (() => void) | null = null;
  function set_batch_delete_handler(fn: () => void) { _on_request_batch_delete = fn; }
  function request_batch_delete() { if (selected.size > 0) _on_request_batch_delete?.(); }
  function execute_batch_delete() {
    full_script = full_script.filter((_, i) => !selected.has(i));
    exit_select_mode();
  }

  function update_rect_selection() {
    const rx1 = Math.min(rect_start_x, rect_cur_x);
    const rx2 = Math.max(rect_start_x, rect_cur_x);
    const ry1 = Math.min(rect_start_y, rect_cur_y);
    const ry2 = Math.max(rect_start_y, rect_cur_y);
    const new_selected = new Set<number>();
    document.querySelectorAll("[data-line-index]").forEach((el) => {
      const idx = parseInt((el as HTMLElement).dataset.lineIndex ?? "");
      if (isNaN(idx) || full_script[idx]?.is_scene) return;
      const r = el.getBoundingClientRect();
      if (r.bottom >= ry1 - 4 && r.top <= ry2 + 4 && r.right >= rx1 && r.left <= rx2) new_selected.add(idx);
    });
    selected = new_selected;
  }

  function on_mousemove(e: MouseEvent) {
    if (!rect_pending && !rect_active) return;
    rect_cur_x = e.clientX; rect_cur_y = e.clientY;
    if (rect_pending) {
      const dx = Math.abs(rect_cur_x - rect_start_x);
      const dy = Math.abs(rect_cur_y - rect_start_y);
      if (dx > RECT_THRESHOLD || dy > RECT_THRESHOLD) { rect_pending = false; rect_active = true; }
      else return;
    }
    update_rect_selection();
  }

  function on_mouseup() {
    rect_pending = false;
    if (rect_active) { rect_active = false; if (selected.size > 0) select_mode = true; }
  }

  function on_mousedown(e: MouseEvent) {
    if (e.button !== 0) return;
    if (view_mode === "json") return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A" || (e.target as HTMLElement).closest("dialog, [data-no-rect]")) return;
    if (select_mode && (e.target as HTMLElement).closest("[data-line-index]")) return;
    rect_pending = true; rect_active = false;
    rect_start_x = e.clientX; rect_start_y = e.clientY;
    rect_cur_x = e.clientX; rect_cur_y = e.clientY;
    selected = new Set();
  }

  function show_toast(status: string) {
    save_status = status;
    if (toast_timeout) clearTimeout(toast_timeout);
    toast_timeout = setTimeout(() => { if (!is_saving) save_status = null; }, 3000);
  }

  async function save_script() {
    if (is_saving) return;
    _json_flush?.();
    if (!script_title.trim()) { show_toast("no_title"); return; }
    // El servidor rechaza líneas sin texto: las que están vacías en ambos idiomas
    // (p. ej. una línea nueva que quedó en blanco) simplemente no se guardan.
    // Una línea con texto en un solo idioma sí se guarda.
    const to_save = full_script.filter((l) => l.is_scene || (l.text ?? "").trim() !== "" || (l.text_en ?? "").trim() !== "");
    const skipped = full_script.length - to_save.length;
    if (to_save.filter((l) => !l.is_scene && !l.is_context).length === 0) { show_toast("no_lines"); return; }
    // Toda línea con personaje debe apuntar a uno que exista; si no, antes
    // se lanzaba una excepción sin manejar y el guardado fallaba en silencio.
    if (to_save.some((l) => !l.is_scene && !l.is_context && !characters[l.character_index])) {
      show_toast("error");
      push_toast("Hay líneas asignadas a un personaje que no existe. Revisa los personajes.", "error");
      return;
    }

    const sent_snapshot = make_snapshot();
    is_saving = true;
    show_toast("saving");
    try {
      let res: Response;
      try {
        res = await fetch("/api/script/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script_id,
            script_name: script_title,
            script_name_en: script_title_en.trim() || null,
            project_id,
            characters: characters.map((c) => c.name),
            lines: to_save.map((line, i) => {
              if (line.is_scene) return { line_number: i + 1, line_type: "scene", scene_number: line.scene_number };
              const content = (line.text ?? "").trim() || undefined;
              const content_en = (line.text_en ?? "").trim() || undefined;
              if (line.is_context) return { line_number: i + 1, line_type: "context", content, content_en };
              return { line_number: i + 1, line_type: line.line_type ?? "dialogue", character_name: characters[line.character_index].name, content, content_en };
            }),
          }),
        });
      } catch {
        // Falla de red (no un error HTTP).
        show_toast("error");
        return;
      }
      if (!res.ok) { show_toast("error"); return; }

      let returned_id: string;
      try {
        ({ script_id: returned_id } = await res.json());
      } catch {
        show_toast("error");
        return;
      }

      const is_new = script_id === null;
      script_id = returned_id;
      // replaceState: la URL "nueva" reemplaza a la actual en vez de sumar una
      // entrada al historial (el botón Atrás no debe volver a un editor vacío).
      if (is_new) history.replaceState({}, "", `/scripts/editor?id=${returned_id}`);
      // La foto es la de lo que se envió: si el usuario siguió escribiendo
      // mientras se guardaba, esos cambios siguen contando como pendientes.
      saved_snapshot = sent_snapshot;
      show_toast("success");
      const written = to_save.filter((l) => !l.is_scene);
      remember_unknown_words("es", written.map((l) => l.text ?? ""));
      remember_unknown_words("en", written.map((l) => l.text_en ?? ""));
      if (skipped > 0) push_toast(`${skipped} ${skipped === 1 ? "línea vacía no se guardó" : "líneas vacías no se guardaron"}`, "neutral");
    } finally {
      is_saving = false;
    }
  }

  function do_export_txt() {
    if (lang === "en") export_txt(full_script, characters, script_title_en || script_title, "en");
    else export_txt(full_script, characters, script_title, "es");
  }
  function do_export_json() { export_json(full_script, characters, script_title, script_title_en, script_id, lang); }

  return {
    get script_id()            { return script_id; },
    get script_title()         { return script_title; },
    set script_title(v)        { script_title = v; },
    get script_title_en()      { return script_title_en; },
    set script_title_en(v)     { script_title_en = v; },
    get lang()                 { return lang; },
    get project_id()           { return project_id; },
    get projects()             { return projects; },
    get suggestions()          { return suggestions; },
    get active_suggestion()    { return active_suggestion; },
    get translatable_count()   { return translatable_count; },
    get translated_count()     { return translated_count; },
    get missing_count()        { return missing_count; },
    get characters()           { return characters; },
    set characters(v)          { characters = v; },
    get full_script()          { return full_script; },
    get current_input()        { return current_input; },
    set current_input(v)       { current_input = handle_input_change(v); },
    get current_character()    { return current_character; },
    // ── Reset tipo a dialogue al cambiar personaje ────────────
    set current_character(v)   {
      current_character = v;
      if (v !== -1) current_type = "dialogue";
    },
    get current_type()         { return current_type; },
    set current_type(v)        { current_type = v; },
    get save_status()          { return save_status; },
    get is_saving()            { return is_saving; },
    get is_dirty()             { return is_dirty; },
    get show_onboarding()      { return show_onboarding; },
    get view_mode()            { return view_mode; },
    get select_mode()          { return select_mode; },
    get selected()             { return selected; },
    get rect_active()          { return rect_active; },
    get rect_style()           { return rect_style; },
    get label_width()          { return label_width; },
    get current_scene_number() { return current_scene_number; },
    get lines_area_el()        { return lines_area_el; },
    set lines_area_el(v)       { lines_area_el = v; },

    handle_onboarding_done,
    apply_suggestion, cycle_suggestion,
    set_lang, focus_first_missing,
    set_project, create_project,
    insert_scene, insert_line, move_line, delete_scene, scroll_to_scene,
    handle_delete_character,
    save_input, update_line, delete_line,
    enter_select_mode, exit_select_mode, toggle_select,
    request_batch_delete, set_batch_delete_handler, execute_batch_delete,
    on_mousemove, on_mouseup, on_mousedown,
    set_view_mode, apply_json, set_json_flush_handler,
    save_script,
    do_export_txt, do_export_json,
  };
}




