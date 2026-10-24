
<script>
  // ScriptEditor.svelte — orquestador
  import { untrack } from "svelte";
  import ScriptOnboarding from "./ScriptOnboarding.svelte";
  import ScriptHeader from "./ScriptHeader.svelte";
  import ScriptLines from "./ScriptLines.svelte";
  import ScriptInputZone from "./ScriptInputZone.svelte";
  import ScriptJsonView from "./ScriptJsonView.svelte";
  import { create_script_store } from "@lib/script.store.svelte";

  let { initialScript = null, initialProjects = [], defaultProjectId = null } = $props();

  const store = untrack(() => create_script_store(initialScript, initialProjects, defaultProjectId));

  let scene_refs    = $state({});
  let char_menu     = $state(null);
  let delete_dialog = $state(null);

  const TYPES_CYCLE = ["dialogue", "thought", "narration", "context"];

  store.set_batch_delete_handler(() => delete_dialog?.showModal());

  // ── Navegación entre escenas ─────────────────────────────────
  // Antes "anterior/siguiente" se calculaba respecto de la ÚLTIMA escena del
  // guion (no de la que se está mirando), así que Shift+↑/↓ siempre saltaba
  // al mismo lugar. Ahora parte de la escena visible en pantalla.
  const SCENE_SNAP_PX = 40;
  let nav_scene = null;

  function scene_top(n, area_top) {
    const idx = store.full_script.findIndex((l) => l.is_scene && l.scene_number === n);
    const el = scene_refs[idx];
    return el ? el.getBoundingClientRect().top - area_top : null;
  }

  function viewed_scene(numbers) {
    const area = store.lines_area_el;
    if (!area) return null;
    const area_top = area.getBoundingClientRect().top;
    // Si el último salto no pudo llegar arriba del todo (fin del scroll),
    // esa escena sigue siendo la actual.
    if (nav_scene !== null) {
      const t = scene_top(nav_scene, area_top);
      const at_bottom = area.scrollTop + area.clientHeight >= area.scrollHeight - 4;
      if (t !== null && t >= -4 && (t <= SCENE_SNAP_PX || (at_bottom && t < area.clientHeight))) return nav_scene;
    }
    let current = null;
    for (const n of numbers) {
      const t = scene_top(n, area_top);
      if (t !== null && t <= SCENE_SNAP_PX) current = n;
    }
    return current;
  }

  function go_to_scene(direction) {
    const numbers = store.full_script.map((l) => (l.is_scene ? l.scene_number : null)).filter((n) => n != null);
    if (!numbers.length) return;
    const cur = viewed_scene(numbers);
    const i = cur === null ? -1 : numbers.indexOf(cur);
    const target = direction < 0
      ? (i > 0 ? numbers[i - 1] : numbers[numbers.length - 1])
      : (i >= 0 && i < numbers.length - 1 ? numbers[i + 1] : numbers[0]);
    nav_scene = target;
    store.scroll_to_scene(target, scene_refs);
  }

  function cycle_type() {
    const current_in_cycle = store.current_character === -1 ? "context" : store.current_type;
    const next = TYPES_CYCLE[(TYPES_CYCLE.indexOf(current_in_cycle) + 1) % TYPES_CYCLE.length];
    if (next === "context") { store.current_character = -1; }
    else { if (store.current_character === -1) store.current_character = 0; store.current_type = next; }
  }

  function cycle_character(step) {
    const n = store.characters.length;
    if (!n) return;
    store.current_character = store.current_character === -1
      ? (step > 0 ? 0 : n - 1)
      : (store.current_character + step + n) % n;
  }

  $effect(() => {
    function on_keydown(e) {
      if (e.isComposing) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      const is_main_input = el?.id === "script-input";
      // Cualquier campo de texto que no sea el input principal (título, una
      // línea existente, traducción, el JSON, un diálogo...).
      const in_text_field = !is_main_input && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable);
      const no_mods = !e.ctrlKey && !e.metaKey && !e.altKey;

      if (e.code === "Escape") {
        if (store.select_mode) { store.exit_select_mode(); return; }
        char_menu?.close_all?.();
        delete_dialog?.close();
        return;
      }
      // Ctrl/Cmd+S guarda desde cualquier lado. Antes estaba debajo del filtro
      // de campos de texto y no funcionaba con el foco en el título, en una
      // línea o en una traducción.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === "KeyS") {
        e.preventDefault(); store.save_script(); return;
      }
      // Los atajos de acá para abajo son del editor de guion: no se disparan
      // en la vista JSON ni mientras se escribe en otro campo.
      if (store.view_mode === "json" || in_text_field) return;

      // Todos los atajos valen igual en Español y en English.
      if (e.shiftKey && no_mods && e.code === "ArrowUp")   { e.preventDefault(); go_to_scene(-1); return; }
      if (e.shiftKey && no_mods && e.code === "ArrowDown") { e.preventDefault(); go_to_scene(1);  return; }

      if (e.shiftKey && no_mods && e.code === "Space" && !is_main_input) {
        e.preventDefault(); document.getElementById("script-input")?.focus(); return;
      }
      if (e.shiftKey && no_mods && e.code === "NumpadAdd") {
        e.preventDefault(); char_menu?.open_add?.(); return;
      }
      if (e.shiftKey && no_mods && (e.code === "Enter" || e.code === "NumpadEnter")) {
        e.preventDefault(); store.insert_scene(store.full_script.length); return;
      }
      if (e.shiftKey && no_mods && e.code === "ArrowRight") { e.preventDefault(); cycle_character(1);  return; }
      if (e.shiftKey && no_mods && e.code === "ArrowLeft")  { e.preventDefault(); cycle_character(-1); return; }
      // Alt+Z funciona siempre (también escribiendo). Shift+Z se mantiene,
      // pero solo fuera del input principal: ahí bloqueaba escribir la "Z".
      if (e.code === "KeyZ" && ((e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) || (e.shiftKey && no_mods && !is_main_input))) {
        e.preventDefault(); cycle_type(); return;
      }
    }

    window.addEventListener("keydown", on_keydown);
    window.addEventListener("mouseup", store.on_mouseup);
    window.addEventListener("mousemove", store.on_mousemove);
    window.addEventListener("mousedown", store.on_mousedown);
    return () => {
      window.removeEventListener("keydown", on_keydown);
      window.removeEventListener("mouseup", store.on_mouseup);
      window.removeEventListener("mousemove", store.on_mousemove);
      window.removeEventListener("mousedown", store.on_mousedown);
    };
  });
</script>

{#if store.show_onboarding}
  <ScriptOnboarding ondone={store.handle_onboarding_done} />
{/if}

<div class="editor">
  <ScriptHeader {store} />
  <div class="editor-divider"></div>
  {#if store.view_mode === "json"}
    <!-- {#key}: al cambiar de idioma el JSON se vuelve a armar desde cero -->
    {#key store.lang}
      <ScriptJsonView {store} />
    {/key}
  {:else}
    <ScriptLines {store} bind:scene_refs />
    <div class="editor-divider"></div>
    <ScriptInputZone {store} bind:char_menu />
  {/if}
</div>

{#if store.rect_active}
  <div class="select-rect" style={store.rect_style}></div>
{/if}

<dialog bind:this={delete_dialog}>
  <h2 class="dialog-title">¿Eliminar {store.selected.size} {store.selected.size === 1 ? "línea" : "líneas"}?</h2>
  <p class="dialog-body">Esta acción no se puede deshacer.</p>
  <div class="dialog-actions">
    <button onclick={() => delete_dialog?.close()} class="btn btn-ghost">Cancelar</button>
    <button onclick={() => { store.execute_batch_delete(); delete_dialog?.close(); }} class="btn btn-danger">Eliminar</button>
  </div>
</dialog>

<style>
  .editor { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
  .editor-divider { height: 1px; background: var(--border); }
  :global(.select-rect) { position: fixed; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); pointer-events: none; z-index: 100; border-radius: 2px; }
  .dialog-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
  .dialog-body { font-size: 13px; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.5; }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .btn-danger { background: var(--error-text); color: #fff; font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 7px 16px; border-radius: var(--radius-md); border: none; cursor: pointer; transition: opacity var(--transition); }
  .btn-danger:hover { opacity: 0.85; }
</style>


