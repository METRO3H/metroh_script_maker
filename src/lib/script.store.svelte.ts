
// src/lib/script.store.svelte.ts
import { tick } from "svelte";
import type { Character, ScriptLine } from "@types/script";
import { export_txt, export_json } from "@lib/script.utils";

function init_state(script: any) {
  if (!script) return { id: null, title: "", characters: [], lines: [] };
  const chars: Character[] = (script.characters ?? []).map((c: any, i: number) => ({ name: c.name, id: i + 1 }));
  const char_index = Object.fromEntries(chars.map((c, i) => [c.name, i]));
  const lines: ScriptLine[] = (script.lines ?? []).map((l: any) => {
    if (l.line_type === "scene") return { is_scene: true, scene_number: l.scene_number } as ScriptLine;
    if (l.line_type === "context") return { is_context: true, character_index: -1, text: l.content } as ScriptLine;
    return { character_index: char_index[l.character_name] ?? 0, text: l.content, line_type: l.line_type ?? "dialogue" } as ScriptLine;
  });
  return { id: script.id, title: script.name, characters: chars, lines };
}

export function create_script_store(initialScript: any = null) {
  const init = init_state(initialScript);

  let script_id         = $state<string | null>(init.id);
  let script_title      = $state<string>(init.title);
  let characters        = $state<Character[]>(init.characters);
  let full_script       = $state<ScriptLine[]>(init.lines);
  let current_input     = $state<string>("");
  let current_character = $state<number>(0);
  let current_type      = $state<string>("dialogue");
  let save_status       = $state<string | null>(null);
  let show_onboarding   = $state<boolean>(initialScript === null);
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
  const RECT_THRESHOLD = 6;
  const LABEL_MAX_PX = 96;
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
    return Math.min(Math.ceil(longest * CHAR_PX), LABEL_MAX_PX);
  });

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

  function insert_scene(at_index: number) {
    const n = full_script.slice(0, at_index).filter((l) => l.is_scene).length + 1;
    const after = full_script.slice(at_index).map((l) => (l.is_scene ? { ...l, scene_number: (l.scene_number ?? 0) + 1 } : l));
    full_script = [...full_script.slice(0, at_index), { is_scene: true, scene_number: n, character_index: -1 }, ...after];
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

  function save_input() {
    const input = capitalize_first(current_input.trim());
    if (!input) return;
    if (current_character === -1) {
      full_script = [...full_script, { is_context: true, character_index: -1, text: input }];
    } else {
      full_script = [...full_script, { character_index: current_character, text: input, line_type: current_type }];
    }
    current_input = "";
  }

  function update_line(new_text: string, i: number) {
    full_script = full_script.map((s, index) => (index === i ? { ...s, text: capitalize_first(new_text) } : s));
  }

  function delete_line(index: number) {
    if (select_mode) return;
    full_script = full_script.filter((_, i) => i !== index);
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
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "BUTTON" || tag === "A" || (e.target as HTMLElement).closest("dialog")) return;
    if (select_mode && (e.target as HTMLElement).closest("[data-line-index]")) return;
    rect_pending = true; rect_active = false;
    rect_start_x = e.clientX; rect_start_y = e.clientY;
    rect_cur_x = e.clientX; rect_cur_y = e.clientY;
    selected = new Set();
  }

  function show_toast(status: string) {
    save_status = status;
    if (toast_timeout) clearTimeout(toast_timeout);
    toast_timeout = setTimeout(() => (save_status = null), 3000);
  }

  async function save_script() {
    if (!script_title.trim()) { show_toast("no_title"); return; }
    if (full_script.filter((l) => !l.is_scene && !l.is_context).length === 0) { show_toast("no_lines"); return; }
    show_toast("saving");
    let res: Response;
    try {
      res = await fetch("/api/script/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_id,
          script_name: script_title,
          characters: characters.map((c) => c.name),
          lines: full_script.map((line, i) => {
            if (line.is_scene) return { line_number: i + 1, line_type: "scene", scene_number: line.scene_number };
            if (line.is_context) return { line_number: i + 1, line_type: "context", content: line.text };
            return { line_number: i + 1, line_type: line.line_type ?? "dialogue", character_name: characters[line.character_index].name, content: line.text };
          }),
        }),
      });
    } catch {
      // Falla de red (no un error HTTP): sin este catch, la promesa rechazada
      // quedaba sin manejar y el toast de "guardando" solo desaparecía solo
      // a los 3s sin avisar que en realidad no se guardó nada.
      show_toast("error");
      return;
    }
    if (!res.ok) { show_toast("error"); return; }
    const { script_id: returned_id } = await res.json();
    const is_new = script_id === null;
    script_id = returned_id;
    if (is_new) history.pushState({}, "", `/scripts/editor?id=${returned_id}`);
    show_toast("success");
  }

  function setup_autoscroll() {
    let is_mounted = false;
    $effect(() => {
      const len = full_script.length;
      if (!is_mounted) return;
      tick().then(() => {
        if (lines_area_el) lines_area_el.scrollTo({ top: lines_area_el.scrollHeight, behavior: "smooth" });
      });
    });
    $effect(() => { is_mounted = true; });
  }

  function do_export_txt() { export_txt(full_script, characters, script_title); }
  function do_export_json() { export_json(full_script, characters, script_title, script_id); }

  return {
    get script_id()            { return script_id; },
    get script_title()         { return script_title; },
    set script_title(v)        { script_title = v; },
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
    get show_onboarding()      { return show_onboarding; },
    get select_mode()          { return select_mode; },
    get selected()             { return selected; },
    get rect_active()          { return rect_active; },
    get rect_style()           { return rect_style; },
    get label_width()          { return label_width; },
    get current_scene_number() { return current_scene_number; },
    get lines_area_el()        { return lines_area_el; },
    set lines_area_el(v)       { lines_area_el = v; },

    handle_onboarding_done,
    insert_scene, delete_scene, scroll_to_scene,
    handle_delete_character,
    save_input, update_line, delete_line,
    enter_select_mode, exit_select_mode, toggle_select,
    request_batch_delete, set_batch_delete_handler, execute_batch_delete,
    on_mousemove, on_mouseup, on_mousedown,
    save_script, setup_autoscroll,
    do_export_txt, do_export_json,
  };
}


