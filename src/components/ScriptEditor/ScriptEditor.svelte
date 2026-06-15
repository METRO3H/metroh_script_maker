<script lang="ts">
  // ScriptEditor.svelte — solo UI y coordinación
  import { untrack } from "svelte";
  import CharacterMenu from "./CharacterMenu.svelte";
  import ScriptOnboarding from "./ScriptOnboarding.svelte";
  import { create_script_store } from "@lib/script.store.svelte";
  import { char_color } from "@lib/script.utils";

  let { initialScript = null } = $props();

  const store = untrack(() => create_script_store(initialScript));

  // ── Referencias DOM ───────────────────────────────────────────
  let lines_area    = $state(null);
  let scene_refs    = $state({});
  let char_menu     = $state(null);
  let delete_dialog = $state(null);

  // ── UI derivada ───────────────────────────────────────────────
  const LABEL_MAX_PX = 96;
  const CHAR_PX = 7.5;
  let label_width = $derived(() => {
    const longest = store.characters.reduce((max, c) => Math.max(max, c.name.length), "contexto".length);
    return Math.min(Math.ceil(longest * CHAR_PX), LABEL_MAX_PX);
  });

  const TYPES_CYCLE = ["dialogue", "thought", "narration", "context"];

  // ── Auto-scroll ───────────────────────────────────────────────
  store.setup_autoscroll(() => lines_area);

  // ── Teclado y mouse globales ──────────────────────────────────
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
        const scenes = store.full_script.map((l) => (l.is_scene ? l.scene_number : null)).filter((n) => n != null);
        if (!scenes.length) return;
        const prev = [...scenes].reverse().find((n) => n < store.current_scene_number()) ?? scenes[scenes.length - 1];
        store.scroll_to_scene(prev, scene_refs, lines_area);
        return;
      }
      if (e.shiftKey && e.code === "ArrowDown") {
        e.preventDefault();
        const scenes = store.full_script.map((l) => (l.is_scene ? l.scene_number : null)).filter((n) => n != null);
        if (!scenes.length) return;
        const next = scenes.find((n) => n > store.current_scene_number()) ?? scenes[0];
        store.scroll_to_scene(next, scene_refs, lines_area);
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

  // ── Dialog de eliminación por lote ────────────────────────────
  let show_delete_dialog = $state(false);
  function open_batch_delete() {
    if (store.selected.size === 0) return;
    show_delete_dialog = true;
    delete_dialog?.showModal();
  }
  function cancel_batch_delete() {
    show_delete_dialog = false;
    delete_dialog?.close();
  }
  function confirm_batch_delete() {
    store.execute_batch_delete();
    show_delete_dialog = false;
    delete_dialog?.close();
  }
</script>

{#if store.show_onboarding}
  <ScriptOnboarding ondone={store.handle_onboarding_done} />
{/if}

<div class="editor">
  <!-- Header -->
  <div class="editor-header">
    <div class="title-block">
      <label for="script-title" class="field-label">Título</label>
      <input id="script-title" type="text" class="title-input" placeholder="Sin título..."
        bind:value={store.script_title} autocomplete="off" />
    </div>

    <div class="editor-actions">
      <button onclick={store.do_export_txt} class="btn btn-ghost btn-sm" title="Exportar como .txt">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>TXT
      </button>
      <button onclick={store.do_export_json} class="btn btn-ghost btn-sm" title="Exportar como .json">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>JSON
      </button>

      {#if store.select_mode}
        <button class="btn btn-ghost btn-sm" onclick={store.exit_select_mode} title="Cancelar selección (Esc)">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>Cancelar
        </button>
        <button class="btn btn-sm delete-batch-btn" onclick={open_batch_delete} disabled={store.selected.size === 0}>
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
          Eliminar {store.selected.size > 0 ? `(${store.selected.size})` : ""}
        </button>
      {:else}
        <button
          class="btn btn-sm save-btn"
          class:save-btn-idle={store.save_status === null}
          class:save-btn-saving={store.save_status === "saving"}
          class:save-btn-success={store.save_status === "success"}
          class:save-btn-error={store.save_status === "error" || store.save_status === "no_title" || store.save_status === "no_lines"}
          onclick={store.save_script}
          disabled={store.save_status === "saving"}
        >
          <span class="save-label" class:save-label-active={store.save_status === null}>Guardar</span>
          <span class="save-label save-label-icon" class:save-label-active={store.save_status === "saving"}>
            <svg class="spin" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg><span>Guardando</span>
          </span>
          <span class="save-label save-label-icon" class:save-label-active={store.save_status === "success"}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg><span>Guardado</span>
          </span>
          <span class="save-label" class:save-label-active={store.save_status === "error"}>Error al guardar</span>
          <span class="save-label" class:save-label-active={store.save_status === "no_title"}>Falta el título</span>
          <span class="save-label" class:save-label-active={store.save_status === "no_lines"}>Script vacío</span>
        </button>
      {/if}
    </div>
  </div>

  <div class="editor-divider"></div>

  <!-- Área de líneas -->
  <div class="lines-area" bind:this={lines_area} style="--label-w: {label_width()}px">
    {#if store.full_script.length === 0}
      <div class="empty-state">
        <p class="empty-title">El script está vacío</p>
        <p class="empty-sub">Selecciona un personaje y empieza a escribir abajo</p>
      </div>
    {/if}

    {#each store.full_script as line, index}
      {#if line.is_scene}
        <div class="scene-separator" bind:this={scene_refs[index]}>
          <div class="scene-separator-inner">
            <span class="scene-label">Escena {line.scene_number}</span>
            <div class="scene-line"></div>
            <button class="scene-delete" onclick={() => store.delete_scene(index)}
              aria-label="Eliminar escena {line.scene_number}" title="Eliminar escena">
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
          class:select-mode-line={store.select_mode}
          class:line-selected={store.selected.has(index)}
          onmousedown={() => { if (!store.select_mode) { let t = setTimeout(() => store.enter_select_mode(index), 500); (window as any)._lp = t; } }}
          onmouseup={() => { clearTimeout((window as any)._lp); if (store.select_mode) store.toggle_select(index); }}
          onmouseleave={() => clearTimeout((window as any)._lp)}
          role="option"
          aria-selected={store.selected.has(index)}
          data-line-index={index}
        >
          <button class="insert-scene-btn" onclick={() => store.insert_scene(index)}
            title="Insertar escena aquí" aria-label="Insertar escena antes de esta línea" tabindex="-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"/><path d="M12 5v14"/>
            </svg>escena
          </button>

          <span
            class="line-character"
            class:context-label={line.is_context}
            class:thought-label={line.line_type === "thought"}
            class:narration-label={line.line_type === "narration"}
            style={line.is_context || line.line_type === "narration" || line.line_type === "thought" ? "" : `color: ${char_color(line.character_index, store.characters.length)}`}
          >
            {#if line.is_context}contexto
            {:else if line.line_type === "thought"}✦ {store.characters[line.character_index]?.name ?? "?"}
            {:else if line.line_type === "narration"}◈ {store.characters[line.character_index]?.name ?? "?"}
            {:else}{store.characters[line.character_index]?.name ?? "?"}
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
            onblur={(e) => store.update_line(e.target.value, index)}
            autocomplete="off"
            spellcheck="true"
            disabled={store.select_mode}
            tabindex={store.select_mode ? -1 : 0}
          />
          {#if !store.select_mode}
            <button class="line-delete" onclick={() => store.delete_line(index)}
              aria-label="Eliminar línea" tabindex="-1"
              title="Click para eliminar · Mantener para selección múltiple">
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

  <!-- Input zone -->
  <div class="input-zone">
    <CharacterMenu
      bind:ref={char_menu}
      bind:characters={store.characters}
      bind:current_character={store.current_character}
      bind:current_type={store.current_type}
      ondelete_character={store.handle_delete_character}
    />
    <input
      id="script-input"
      class="current-input"
      value={store.current_input}
      oninput={(e) => (store.current_input = e.target.value)}
      onkeydown={(e) => { if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); store.save_input(); } }}
      placeholder={store.current_character === -1
        ? "Describe la situación... (Enter para añadir)"
        : store.current_type === "thought"
          ? "✦ Pensamiento... (Enter para añadir)"
          : store.current_type === "narration"
            ? "◈ Narración... (Enter para añadir)"
            : "Escribe aquí... (Enter para añadir)"}
      autocomplete="off"
      spellcheck="true"
    />
  </div>
</div>

<!-- Rectángulo de selección -->
{#if store.rect_active}
  <div class="select-rect" style={store.rect_style()}></div>
{/if}

<!-- Dialog eliminación por lote -->
<dialog bind:this={delete_dialog}>
  <h2 class="dialog-title">¿Eliminar {store.selected.size} {store.selected.size === 1 ? "línea" : "líneas"}?</h2>
  <p class="dialog-body">Esta acción no se puede deshacer.</p>
  <div class="dialog-actions">
    <button onclick={cancel_batch_delete} class="btn btn-ghost">Cancelar</button>
    <button onclick={confirm_batch_delete} class="btn btn-danger">Eliminar</button>
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
