<script>
  // ScriptEditor.svelte — orquestador
  import { untrack } from "svelte";
  import ScriptOnboarding from "./ScriptOnboarding.svelte";
  import ScriptHeader from "./ScriptHeader.svelte";
  import ScriptLines from "./ScriptLines.svelte";
  import ScriptInputZone from "./ScriptInputZone.svelte";
  import { create_script_store } from "@lib/script.store.svelte";

  let { initialScript = null } = $props();

  const store = untrack(() => create_script_store(initialScript));

  let scene_refs   = $state({});
  let char_menu    = $state(null);
  let delete_dialog = $state(null);

  const TYPES_CYCLE = ["dialogue", "thought", "narration", "context"];

  // Auto-scroll
  store.setup_autoscroll();

  // Registrar handler del dialog de eliminación por lote
  store.set_batch_delete_handler(() => delete_dialog?.showModal());

  // Teclado y mouse globales
  $effect(() => {
    function on_keydown(e) {
      const is_main_input = document.activeElement?.id === "script-input";
      const tag = document.activeElement?.tagName;
      const is_line_input = tag === "INPUT" && !is_main_input;

      if (e.code === "Escape") {
        if (store.select_mode) { store.exit_select_mode(); return; }
        char_menu?.close_all?.();
        delete_dialog?.close();
        return;
      }
      if (e.shiftKey && e.code === "Space" && !is_main_input) {
        e.preventDefault(); document.getElementById("script-input")?.focus(); return;
      }
      if (e.shiftKey && e.code === "NumpadAdd") {
        e.preventDefault(); char_menu?.open_add?.(); return;
      }
      if (e.shiftKey && (e.code === "Enter" || e.code === "NumpadEnter")) {
        e.preventDefault(); store.insert_scene(store.full_script.length); return;
      }
      if (is_line_input) return;
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault(); store.save_script(); return;
      }
      if (e.shiftKey && e.code === "ArrowUp") {
        e.preventDefault();
        const scenes = store.full_script.map((l) => l.is_scene ? l.scene_number : null).filter((n) => n != null);
        if (!scenes.length) return;
        const prev = [...scenes].reverse().find((n) => n < store.current_scene_number()) ?? scenes[scenes.length - 1];
        store.scroll_to_scene(prev, scene_refs);
        return;
      }
      if (e.shiftKey && e.code === "ArrowDown") {
        e.preventDefault();
        const scenes = store.full_script.map((l) => l.is_scene ? l.scene_number : null).filter((n) => n != null);
        if (!scenes.length) return;
        const next = scenes.find((n) => n > store.current_scene_number()) ?? scenes[0];
        store.scroll_to_scene(next, scene_refs);
        return;
      }
      if (e.shiftKey && e.code === "ArrowRight") {
        e.preventDefault();
        if (!store.characters.length) return;
        store.current_character = store.current_character === -1 ? 0 : (store.current_character + 1) % store.characters.length;
        return;
      }
      if (e.shiftKey && e.code === "ArrowLeft") {
        e.preventDefault();
        if (!store.characters.length) return;
        store.current_character = store.current_character === -1 ? store.characters.length - 1 : (store.current_character - 1 + store.characters.length) % store.characters.length;
        return;
      }
      if (e.shiftKey && e.code === "IntlBackslash") {
        e.preventDefault();
        const current_in_cycle = store.current_character === -1 ? "context" : store.current_type;
        const next = TYPES_CYCLE[(TYPES_CYCLE.indexOf(current_in_cycle) + 1) % TYPES_CYCLE.length];
        if (next === "context") { store.current_character = -1; }
        else { if (store.current_character === -1) store.current_character = 0; store.current_type = next; }
        return;
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

  <ScriptLines {store} bind:scene_refs />

  <div class="editor-divider"></div>

  <ScriptInputZone {store} bind:char_menu />
</div>

{#if store.rect_active}
  <div class="select-rect" style={store.rect_style()}></div>
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
