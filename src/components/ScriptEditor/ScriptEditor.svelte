<script>
   // ScriptEditor.svelte
   import { tick, untrack } from "svelte";
   import CharacterMenu from "./CharacterMenu.svelte";
   import ScriptOnboarding from "./ScriptOnboarding.svelte";
   import { char_color, export_txt, export_json, TYPE_ICONS } from "@lib/script.utils";

   let { initialScript = null } = $props();

   function init_state(script) {
      if (!script) return { id: null, title: "", characters: [], lines: [] };
      const chars = (script.characters ?? []).map((c, i) => ({ name: c.name, id: i + 1 }));
      const char_index = Object.fromEntries(chars.map((c, i) => [c.name, i]));
      const lines = (script.lines ?? []).map((l) => {
         if (l.line_type === "scene") return { is_scene: true, scene_number: l.scene_number };
         if (l.line_type === "context") return { is_context: true, character_index: -1, text: l.content };
         return { character_index: char_index[l.character_name] ?? 0, text: l.content, line_type: l.line_type ?? "dialogue" };
      });
      return { id: script.id, title: script.name, characters: chars, lines };
   }

   const init = untrack(() => init_state(initialScript));

   let script_id = $state(init.id);
   let script_title = $state(init.title);
   let characters = $state(init.characters);
   let full_script = $state(init.lines);
   let current_input = $state("");
   let current_character = $state(0);
   let current_type = $state("dialogue");
   let script_count = $derived(full_script.length);

   let show_onboarding = $state(initialScript === null);

   function handle_onboarding_done({ title, characters: chars }) {
      script_title = title;
      characters = chars.map((name, i) => ({ name, id: i + 1 }));
      full_script = [{ is_scene: true, scene_number: 1 }];
      show_onboarding = false;
   }

   let save_status = $state(null);
   let toast_timeout = null;

   let delete_dialog = $state(null);
   let pending_delete_index = $state(null);
   let lines_area = $state(null);

   let select_mode = $state(false);
   let selected = $state(new Set());
   let long_press_timer = null;

   let rect_active = $state(false);
   let rect_pending = $state(false);
   let rect_start_x = $state(0);
   let rect_start_y = $state(0);
   let rect_cur_x = $state(0);
   let rect_cur_y = $state(0);
   const RECT_THRESHOLD = 6;

   let rect_style = $derived(() => {
      const x = Math.min(rect_start_x, rect_cur_x);
      const y = Math.min(rect_start_y, rect_cur_y);
      const w = Math.abs(rect_cur_x - rect_start_x);
      const h = Math.abs(rect_cur_y - rect_start_y);
      return `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
   });

   function enter_select_mode(index) { select_mode = true; selected = new Set([index]); }
   function exit_select_mode() { select_mode = false; selected = new Set(); rect_active = false; rect_pending = false; }
   function toggle_select(index) {
      if (!full_script[index]?.is_scene) {
         const s = new Set(selected);
         if (s.has(index)) s.delete(index); else s.add(index);
         selected = s;
      }
   }
   function start_long_press(index) { long_press_timer = setTimeout(() => enter_select_mode(index), 500); }
   function cancel_long_press() { clearTimeout(long_press_timer); }

   function update_rect_selection() {
      const rx1 = Math.min(rect_start_x, rect_cur_x);
      const rx2 = Math.max(rect_start_x, rect_cur_x);
      const ry1 = Math.min(rect_start_y, rect_cur_y);
      const ry2 = Math.max(rect_start_y, rect_cur_y);
      const new_selected = new Set();
      document.querySelectorAll("[data-line-index]").forEach((el) => {
         const idx = parseInt(el.dataset.lineIndex);
         if (isNaN(idx) || full_script[idx]?.is_scene) return;
         const r = el.getBoundingClientRect();
         const threshold = 4;
         if (r.bottom >= ry1 - threshold && r.top <= ry2 + threshold && r.right >= rx1 && r.left <= rx2) new_selected.add(idx);
      });
      selected = new_selected;
   }

   function on_mouseup() {
      rect_pending = false;
      if (rect_active) { rect_active = false; if (selected.size === 0 && !select_mode) return; select_mode = true; }
   }

   function delete_selected() {
      if (selected.size === 0) return;
      pending_delete_index = -1;
      delete_dialog?.showModal();
   }

   let scene_refs = $state({});

   function insert_scene(at_index) {
      const n = full_script.slice(0, at_index).filter((l) => l.is_scene).length + 1;
      const after = full_script.slice(at_index).map((l) => (l.is_scene ? { ...l, scene_number: l.scene_number + 1 } : l));
      full_script = [...full_script.slice(0, at_index), { is_scene: true, scene_number: n }, ...after];
   }

   function delete_scene(index) {
      const before = full_script.slice(0, index);
      const after = full_script.slice(index + 1).map((l) => (l.is_scene ? { ...l, scene_number: l.scene_number - 1 } : l));
      full_script = [...before, ...after];
   }

   function scroll_to_scene(scene_number) {
      const idx = full_script.findIndex((l) => l.is_scene && l.scene_number === scene_number);
      if (idx === -1) return;
      const el = scene_refs[idx];
      if (el && lines_area) el.scrollIntoView({ behavior: "smooth", block: "start" });
   }

   let total_scenes = $derived(full_script.filter((l) => l.is_scene).length);
   let current_scene_number = $derived(() => {
      const scenes = full_script.filter((l) => l.is_scene);
      return scenes.length > 0 ? scenes[scenes.length - 1].scene_number : 0;
   });

   function handle_delete_character({ index, mode }) {
      if (mode === "remove_lines") {
         full_script = full_script.filter((l) => l.is_scene || l.character_index !== index);
      } else {
         const unknown_count = characters.filter((c) => c.name.startsWith("Desconocido ")).length;
         const unknown_name = `Desconocido ${unknown_count + 1}`;
         const unknown_id = Date.now();
         const new_chars = [...characters, { name: unknown_name, id: unknown_id }];
         const unknown_index = new_chars.length - 1;
         full_script = full_script.map((l) => !l.is_scene && l.character_index === index ? { ...l, character_index: unknown_index } : l);
         characters = new_chars;
      }
      const next_chars = characters.filter((_, i) => i !== index);
      full_script = full_script.map((l) => l.is_scene ? l : { ...l, character_index: l.character_index > index ? l.character_index - 1 : l.character_index });
      characters = next_chars;
      if (current_character >= next_chars.length) current_character = 0;
   }

   const LABEL_MAX_PX = 96;
   const CHAR_PX = 7.5;
   let label_width = $derived(() => {
      const longest = characters.reduce((max, c) => Math.max(max, c.name.length), "contexto".length);
      return Math.min(Math.ceil(longest * CHAR_PX), LABEL_MAX_PX);
   });

   function save_input() {
      const input = current_input.trim();
      if (!input) return;
      if (current_character === -1) {
         full_script = [...full_script, { is_context: true, character_index: -1, text: input }];
      } else {
         full_script = [...full_script, { character_index: current_character, text: input, line_type: current_type }];
      }
      current_input = "";
   }

   function handle_keydown(e) {
      if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); save_input(); }
   }

   let char_menu = $state(null);
   const TYPES_CYCLE = ["dialogue", "thought", "narration", "context"];

   $effect(() => {
      function on_keydown(e) {
         const is_main_input = document.activeElement?.id === "script-input";
         const tag = document.activeElement?.tagName;
         const is_line_input = tag === "INPUT" && !is_main_input;

         if (e.code === "Escape") {
            if (select_mode) { exit_select_mode(); return; }
            char_menu?.close_all?.();
            cancel_delete();
            return;
         }
         if (e.shiftKey && e.code === "Space" && !is_main_input) { e.preventDefault(); document.getElementById("script-input")?.focus(); return; }
         if (e.shiftKey && e.code === "NumpadAdd") { e.preventDefault(); char_menu?.open_add?.(); return; }
         if (e.shiftKey && (e.code === "Enter" || e.code === "NumpadEnter")) { e.preventDefault(); insert_scene(full_script.length); return; }
         if (is_line_input) return;
         if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") { e.preventDefault(); save_script(); return; }

         if (e.shiftKey && e.code === "ArrowUp") {
            e.preventDefault();
            const scenes = full_script.map((l) => (l.is_scene ? l.scene_number : null)).filter((n) => n !== null);
            if (scenes.length === 0) return;
            const active = current_scene_number();
            scroll_to_scene([...scenes].reverse().find((n) => n < active) ?? scenes[scenes.length - 1]);
            return;
         }
         if (e.shiftKey && e.code === "ArrowDown") {
            e.preventDefault();
            const scenes = full_script.map((l) => (l.is_scene ? l.scene_number : null)).filter((n) => n !== null);
            if (scenes.length === 0) return;
            const active = current_scene_number();
            scroll_to_scene(scenes.find((n) => n > active) ?? scenes[0]);
            return;
         }
         if (e.shiftKey && e.code === "ArrowRight") {
            e.preventDefault();
            if (characters.length === 0) return;
            current_character = current_character === -1 ? 0 : (current_character + 1) % characters.length;
            return;
         }
         if (e.shiftKey && e.code === "ArrowLeft") {
            e.preventDefault();
            if (characters.length === 0) return;
            current_character = current_character === -1 ? characters.length - 1 : (current_character - 1 + characters.length) % characters.length;
            return;
         }
         if (e.shiftKey && e.code === "IntlBackslash") {
            e.preventDefault();
            const current_in_cycle = current_character === -1 ? "context" : current_type;
            const next = TYPES_CYCLE[(TYPES_CYCLE.indexOf(current_in_cycle) + 1) % TYPES_CYCLE.length];
            if (next === "context") { current_character = -1; }
            else { if (current_character === -1) current_character = 0; current_type = next; }
            return;
         }
      }

      function on_mouseup_global() { on_mouseup(); }
      function on_mousemove_global(e) {
         if (!rect_pending && !rect_active) return;
         rect_cur_x = e.clientX; rect_cur_y = e.clientY;
         if (rect_pending) {
            const dx = Math.abs(rect_cur_x - rect_start_x);
            const dy = Math.abs(rect_cur_y - rect_start_y);
            if (dx > RECT_THRESHOLD || dy > RECT_THRESHOLD) { rect_pending = false; rect_active = true; cancel_long_press(); }
            else return;
         }
         update_rect_selection();
      }
      function on_mousedown_global(e) {
         if (e.button !== 0) return;
         const tag = e.target.tagName;
         if (tag === "INPUT" || tag === "BUTTON" || tag === "A" || e.target.closest("dialog")) return;
         if (select_mode && e.target.closest("[data-line-index]")) return;
         rect_pending = true; rect_active = false;
         rect_start_x = e.clientX; rect_start_y = e.clientY;
         rect_cur_x = e.clientX; rect_cur_y = e.clientY;
         selected = new Set();
      }

      window.addEventListener("keydown", on_keydown);
      window.addEventListener("mouseup", on_mouseup_global);
      window.addEventListener("mousemove", on_mousemove_global);
      window.addEventListener("mousedown", on_mousedown_global);
      return () => {
         window.removeEventListener("keydown", on_keydown);
         window.removeEventListener("mouseup", on_mouseup_global);
         window.removeEventListener("mousemove", on_mousemove_global);
         window.removeEventListener("mousedown", on_mousedown_global);
      };
   });

   function update_input(new_text, i) { full_script = full_script.map((s, index) => (index === i ? { ...s, text: new_text } : s)); }
   function confirm_delete(index) { if (select_mode) return; full_script = full_script.filter((_, i) => i !== index); }
   function cancel_delete() { pending_delete_index = null; delete_dialog?.close(); }
   function execute_delete() {
      if (pending_delete_index === null) return;
      if (pending_delete_index === -1) { full_script = full_script.filter((_, i) => !selected.has(i)); exit_select_mode(); }
      else { full_script = full_script.filter((_, i) => i !== pending_delete_index); }
      pending_delete_index = null;
      delete_dialog?.close();
   }

   function show_toast(status) { save_status = status; clearTimeout(toast_timeout); toast_timeout = setTimeout(() => (save_status = null), 3000); }

   async function save_script() {
      if (!script_title.trim()) { show_toast("no_title"); return; }
      if (full_script.filter((l) => !l.is_scene && !l.is_context).length === 0) { show_toast("no_lines"); return; }
      show_toast("saving");
      const res = await fetch("/api/script/save", {
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
      if (!res.ok) { show_toast("error"); return; }
      const { script_id: returned_id } = await res.json();
      const is_new = script_id === null;
      script_id = returned_id;
      if (is_new) history.pushState({}, "", `/scripts/editor?id=${returned_id}`);
      show_toast("success");
   }

   let is_mounted = $state(false);
   $effect(() => {
      const len = full_script.length;
      if (!is_mounted) return;
      tick().then(() => { if (lines_area) lines_area.scrollTo({ top: lines_area.scrollHeight, behavior: "smooth" }); });
   });
   $effect(() => { is_mounted = true; });
</script>

{#if show_onboarding}
   <ScriptOnboarding ondone={handle_onboarding_done} />
{/if}

<div class="editor">
   <div class="editor-header">
      <div class="title-block">
         <label for="script-title" class="field-label">Título</label>
         <input id="script-title" type="text" class="title-input" placeholder="Sin título..."
            bind:value={script_title} autocomplete="off" />
      </div>

      <div class="editor-actions">
         <button onclick={() => export_txt(full_script, characters, script_title)} class="btn btn-ghost btn-sm" title="Exportar como .txt">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
               <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>TXT
         </button>
         <button onclick={() => export_json(full_script, characters, script_title, script_id)} class="btn btn-ghost btn-sm" title="Exportar como .json">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
               <polyline points="14 2 14 8 20 8"/>
            </svg>JSON
         </button>

         {#if select_mode}
            <button class="btn btn-ghost btn-sm" onclick={exit_select_mode} title="Cancelar selección (Esc)">
               <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
               </svg>Cancelar
            </button>
            <button class="btn btn-sm delete-batch-btn" onclick={delete_selected} disabled={selected.size === 0}>
               <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
               </svg>
               Eliminar {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
         {:else}
            <button
               class="btn btn-sm save-btn"
               class:save-btn-idle={save_status === null}
               class:save-btn-saving={save_status === "saving"}
               class:save-btn-success={save_status === "success"}
               class:save-btn-error={save_status === "error" || save_status === "no_title" || save_status === "no_lines"}
               onclick={save_script}
               disabled={save_status === "saving"}
            >
               <span class="save-label" class:save-label-active={save_status === null}>Guardar</span>
               <span class="save-label save-label-icon" class:save-label-active={save_status === "saving"}>
                  <svg class="spin" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg><span>Guardando</span>
               </span>
               <span class="save-label save-label-icon" class:save-label-active={save_status === "success"}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                     <polyline points="20 6 9 17 4 12"/>
                  </svg><span>Guardado</span>
               </span>
               <span class="save-label" class:save-label-active={save_status === "error"}>Error al guardar</span>
               <span class="save-label" class:save-label-active={save_status === "no_title"}>Falta el título</span>
               <span class="save-label" class:save-label-active={save_status === "no_lines"}>Script vacío</span>
            </button>
         {/if}
      </div>
   </div>

   <div class="editor-divider"></div>

   <div class="lines-area" bind:this={lines_area} style="--label-w: {label_width()}px">
      {#if full_script.length === 0}
         <div class="empty-state">
            <p class="empty-title">El script está vacío</p>
            <p class="empty-sub">Selecciona un personaje y empieza a escribir abajo</p>
         </div>
      {/if}

      {#each full_script as line, index}
         {#if line.is_scene}
            <div class="scene-separator" bind:this={scene_refs[index]}>
               <div class="scene-separator-inner">
                  <span class="scene-label">Escena {line.scene_number}</span>
                  <div class="scene-line"></div>
                  <button class="scene-delete" onclick={() => delete_scene(index)} aria-label="Eliminar escena {line.scene_number}" title="Eliminar escena">
                     <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                     </svg>
                  </button>
               </div>
            </div>
         {:else}
            <div
               class="script-line"
               class:context-line={line.is_context}
               class:thought-line={line.line_type === "thought"}
               class:narration-line={line.line_type === "narration"}
               class:select-mode-line={select_mode}
               class:line-selected={selected.has(index)}
               onmousedown={() => { if (!select_mode) start_long_press(index); }}
               onmouseup={() => { cancel_long_press(); if (select_mode) toggle_select(index); }}
               onmouseleave={cancel_long_press}
               role="option"
               aria-selected={selected.has(index)}
               data-line-index={index}
            >
               <button class="insert-scene-btn" onclick={() => insert_scene(index)} title="Insertar escena aquí" aria-label="Insertar escena antes de esta línea" tabindex="-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M5 12h14"/><path d="M12 5v14"/>
                  </svg>escena
               </button>

               <span
                  class="line-character"
                  class:context-label={line.is_context}
                  class:thought-label={line.line_type === "thought"}
                  class:narration-label={line.line_type === "narration"}
                  style={line.is_context || line.line_type === "narration" || line.line_type === "thought" ? "" : `color: ${char_color(line.character_index, characters.length)}`}
               >
                  {#if line.is_context}contexto
                  {:else if line.line_type === "thought"}✦ {characters[line.character_index]?.name ?? "?"}
                  {:else if line.line_type === "narration"}◈ {characters[line.character_index]?.name ?? "?"}
                  {:else}{characters[line.character_index]?.name ?? "?"}
                  {/if}
               </span>
               <input
                  name={`script${index}`}
                  id={`script${index}`}
                  class="line-input"
                  class:context-input={line.is_context}
                  class:thought-input={line.line_type === "thought"}
                  class:narration-input={line.line_type === "narration"}
                  value={line.text}
                  onblur={(e) => update_input(e.currentTarget.value, index)}
                  autocomplete="off"
                  spellcheck="true"
                  disabled={select_mode}
                  tabindex={select_mode ? -1 : 0}
               />
               {#if !select_mode}
                  <button class="line-delete" onclick={() => confirm_delete(index)} aria-label="Eliminar línea" tabindex="-1" title="Click para eliminar · Mantener para selección múltiple">
                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                     </svg>
                  </button>
               {/if}
            </div>
         {/if}
      {/each}
   </div>

   <div class="editor-divider"></div>

   <div class="input-zone">
      <CharacterMenu
         bind:ref={char_menu}
         bind:characters
         bind:current_character
         bind:current_type
         ondelete_character={handle_delete_character}
      />
      <input
         id="script-input"
         class="current-input"
         value={current_input}
         oninput={(e) => (current_input = e.currentTarget.value)}
         onkeydown={handle_keydown}
         placeholder={current_character === -1
            ? "Describe la situación... (Enter para añadir)"
            : current_type === "thought"
              ? "✦ Pensamiento... (Enter para añadir)"
              : current_type === "narration"
                ? "◈ Narración... (Enter para añadir)"
                : "Escribe aquí... (Enter para añadir)"}
         autocomplete="off"
         spellcheck="true"
      />
   </div>
</div>

{#if rect_active}
   <div class="select-rect" style={rect_style()}></div>
{/if}

<dialog bind:this={delete_dialog}>
   <h2 class="dialog-title">¿Eliminar {selected.size} {selected.size === 1 ? "línea" : "líneas"}?</h2>
   <p class="dialog-body">Esta acción no se puede deshacer.</p>
   <div class="dialog-actions">
      <button onclick={cancel_delete} class="btn btn-ghost">Cancelar</button>
      <button onclick={execute_delete} class="btn btn-danger">Eliminar</button>
   </div>
</dialog>

<style>
   :global(:root) { --color-b: #0891b2; --color-c: #059669; --color-d: #d97706; --color-e: #db2777; }
   :global([data-theme="dark"]) { --color-b: #22d3ee; --color-c: #34d399; --color-d: #fbbf24; --color-e: #f472b6; }

   .editor { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
   .editor-header { display: flex; justify-content: space-between; align-items: flex-end; padding: 20px 24px 16px; gap: 16px; }
   .title-block { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
   .field-label { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
   .title-input { font-family: var(--font-mono); font-size: 22px; font-weight: 700; letter-spacing: -0.02em; background: transparent; border: none; border-bottom: 2px solid var(--accent); border-radius: 0; color: var(--text-primary); padding: 4px 0; outline: none; width: 100%; transition: border-color var(--transition); }
   .title-input::placeholder { color: var(--text-placeholder); font-weight: 400; }
   .title-input:focus { border-bottom-color: var(--accent-hover); }
   .editor-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
   .btn-sm { font-size: 10px; padding: 5px 10px; gap: 5px; }
   .editor-divider { height: 1px; background: var(--border); }

   .lines-area { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; padding: 12px 24px; gap: 0; }
   .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 0; gap: 6px; }
   .empty-title { font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--text-muted); }
   .empty-sub { font-size: 12px; color: var(--text-muted); opacity: 0.6; }

   .scene-separator { padding: 12px 0 6px; scroll-margin-top: 12px; }
   .scene-separator-inner { display: flex; align-items: center; gap: 8px; }
   .scene-label { font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }
   .scene-line { flex: 1; height: 1px; background: var(--border); }
   .scene-delete { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; border: 1px solid transparent; background: transparent; color: var(--text-muted); cursor: pointer; opacity: 0; padding: 0; flex-shrink: 0; transition: opacity var(--transition), background var(--transition), color var(--transition), border-color var(--transition); }
   .scene-separator:hover .scene-delete { opacity: 1; }
   .scene-delete:hover { background: var(--error-bg); color: var(--error-text); border-color: var(--error-border); }

   .script-line { position: relative; display: flex; align-items: center; gap: 12px; padding: 3px 0; border-radius: var(--radius-sm); }
   .insert-scene-btn { position: absolute; top: -1px; left: 50%; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); border-radius: 99px; padding: 2px 8px; cursor: pointer; opacity: 0; pointer-events: none; white-space: nowrap; transition: opacity var(--transition), color var(--transition), border-color var(--transition), background var(--transition); z-index: 2; }
   .script-line:hover .insert-scene-btn { opacity: 1; pointer-events: auto; }
   .insert-scene-btn:hover { color: var(--accent-text); border-color: var(--accent); background: var(--accent-muted); }

   .context-line { margin: 2px 0; }
   .thought-line { margin: 1px 0; }
   .narration-line { margin: 1px 0; }

   .line-character { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; width: var(--label-w, 72px); min-width: var(--label-w, 72px); text-align: right; flex-shrink: 0; word-break: break-word; line-height: 1.3; }
   .context-label { color: var(--text-muted) !important; font-style: italic; opacity: 0.7; }
   .thought-label { color: var(--type-thought) !important; font-style: italic; }
   .narration-label { color: var(--type-narration) !important; }

   .line-input { flex: 1; background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); padding: 7px 10px; font-family: var(--font-mono); font-size: 13px; color: var(--text-primary); outline: none; transition: background var(--transition), border-color var(--transition); }
   .line-input:hover { background: var(--bg-subtle); border-color: var(--border); }
   .line-input:focus { background: var(--surface); border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-muted); }
   .context-input { font-style: italic; color: var(--text-secondary) !important; }
   .context-input:focus { border-color: var(--border-strong) !important; box-shadow: none !important; }
   .thought-input { font-style: italic; color: color-mix(in srgb, var(--type-thought) 80%, var(--text-primary)); }
   .narration-input { font-style: italic; color: color-mix(in srgb, var(--type-narration) 80%, var(--text-primary)); letter-spacing: 0.01em; }

   .line-delete { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text-muted); cursor: pointer; opacity: 0; transition: opacity var(--transition), background var(--transition), color var(--transition); flex-shrink: 0; }
   .script-line:hover .line-delete { opacity: 1; }
   .line-delete:hover { background: var(--error-bg); color: var(--error-text); }

   .select-mode-line { cursor: pointer; user-select: none; border-radius: var(--radius-sm); transition: background var(--transition); }
   .select-mode-line .line-input { pointer-events: none; }
   .select-mode-line .insert-scene-btn { pointer-events: none; }
   .select-mode-line .line-character { pointer-events: none; }
   .select-mode-line:hover { background: var(--bg-muted); }
   .line-selected { background: color-mix(in srgb, var(--error-text) 10%, transparent) !important; border-radius: var(--radius-sm); }
   .line-selected .line-character { color: var(--error-text) !important; opacity: 1 !important; }
   .line-selected .line-input { color: var(--error-text) !important; }

   .delete-batch-btn { background: var(--error-text); color: #fff; border-color: var(--error-text); min-width: 114px; justify-content: center; }
   .delete-batch-btn:hover:not(:disabled) { opacity: 0.85; }
   .delete-batch-btn:disabled { opacity: 0.5; cursor: not-allowed; }

   .input-zone { display: flex; flex-direction: column; gap: 8px; padding: 16px 24px 20px; }
   .current-input { width: 100%; background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 10px 14px; font-family: var(--font-mono); font-size: 13px; color: var(--text-primary); outline: none; transition: border-color var(--transition), background var(--transition), box-shadow var(--transition); }
   .current-input::placeholder { color: var(--text-placeholder); }
   .current-input:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-muted); }

   .save-btn { font-size: 10px; padding: 5px 14px; position: relative; justify-content: center; transition: background var(--transition), color var(--transition), border-color var(--transition), box-shadow var(--transition); }
   .save-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; white-space: nowrap; visibility: hidden; }
   .save-label-icon { gap: 5px; }
   .save-label-active { visibility: visible; }
   .save-btn::before { content: "Error al guardar"; display: block; visibility: hidden; font-size: 10px; font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; pointer-events: none; }
   .save-btn-idle { background: var(--accent); color: #fff; border-color: var(--accent); }
   .save-btn-idle:hover { background: var(--accent-hover); border-color: var(--accent-hover); box-shadow: 0 0 0 3px var(--accent-muted); }
   .save-btn-saving { background: var(--bg-muted); color: var(--text-secondary); border-color: var(--border); cursor: not-allowed; }
   .save-btn-success { background: var(--success-bg); color: var(--success-text); border-color: var(--success-border); }
   .save-btn-error { background: var(--error-bg); color: var(--error-text); border-color: var(--error-border); }

   @keyframes spin { to { transform: rotate(360deg); } }
   .spin { animation: spin 0.8s linear infinite; }

   .dialog-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
   .dialog-body { font-size: 13px; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.5; }
   .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

   :global(.select-rect) { position: fixed; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); pointer-events: none; z-index: 100; border-radius: 2px; }
   .btn-danger { background: var(--error-text); color: #fff; font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 7px 16px; border-radius: var(--radius-md); border: none; cursor: pointer; transition: opacity var(--transition); }
   .btn-danger:hover { opacity: 0.85; }
</style>
