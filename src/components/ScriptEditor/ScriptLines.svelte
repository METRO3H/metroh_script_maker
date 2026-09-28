
<script>
  // ScriptLines.svelte — área scrolleable de líneas
  import { char_color } from "@lib/script.utils";
  import Icon from "@components/ui/Icon.svelte";

  let { store, scene_refs = $bindable({}) } = $props();

  const TYPE_BADGE = {
    dialogue:  { emoji: "💬", label: "diálogo" },
    thought:   { emoji: "💭", label: "pensamiento" },
    narration: { emoji: "✍️", label: "narración" },
    context:   { emoji: "📍", label: "contexto" },
  };

  // Timer del "mantener presionado" para entrar en modo selección.
  // Variable local (no window._lp): además de no ensuciar el global,
  // siempre se cancela el timer anterior antes de programar uno nuevo,
  // así nunca queda un timer huérfano que dispare enter_select_mode
  // sobre el índice equivocado.
  let long_press_timer = null;

  function handle_line_mousedown(index) {
    if (store.select_mode) return;
    clearTimeout(long_press_timer);
    long_press_timer = setTimeout(() => store.enter_select_mode(index), 500);
  }
  function handle_line_mouseup(index) {
    clearTimeout(long_press_timer);
    if (store.select_mode) store.toggle_select(index);
  }
  function handle_line_mouseleave() {
    clearTimeout(long_press_timer);
  }

  function handle_line_keydown(e, original_text) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.currentTarget.value = original_text;
      e.currentTarget.blur();
    }
  }
</script>

<div class="lines-area" bind:this={store.lines_area_el} style="--label-w: {store.label_width}px">
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
            <Icon name="x" size={10} stroke_width={3} />
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
        onmousedown={() => handle_line_mousedown(index)}
        onmouseup={() => handle_line_mouseup(index)}
        onmouseleave={handle_line_mouseleave}
        role="option"
        aria-selected={store.selected.has(index)}
        data-line-index={index}
      >
        <button class="insert-scene-btn" onclick={() => store.insert_scene(index)}
          title="Insertar escena aquí" aria-label="Insertar escena antes de esta línea" tabindex="-1">
          <Icon name="plus" size={9} stroke_width={2.5} />escena
        </button>

        <!-- Label + badge -->
        <div class="line-meta" class:context-meta={line.is_context}>
          {#if !line.is_context}
            <span
              class="line-character"
              style={`color: ${char_color(line.character_index, store.characters.length)}`}
            >
              {store.characters[line.character_index]?.name ?? "?"}
            </span>
          {/if}
          <span
            class="line-badge"
            class:badge-dialogue={!line.is_context && (line.line_type === "dialogue" || !line.line_type)}
            class:badge-thought={line.line_type === "thought"}
            class:badge-narration={line.line_type === "narration"}
            class:badge-context={line.is_context}
          >
            {#if line.is_context}
              {TYPE_BADGE.context.emoji} {TYPE_BADGE.context.label}
            {:else}
              {TYPE_BADGE[line.line_type ?? "dialogue"].emoji} {TYPE_BADGE[line.line_type ?? "dialogue"].label}
            {/if}
          </span>
        </div>

        <input
          name={`script${index}`}
          id={`script${index}`}
          class="line-input"
          class:context-input={line.is_context}
          class:thought-input={line.line_type === "thought"}
          class:narration-input={line.line_type === "narration"}
          value={line.text}
          onblur={(e) => store.update_line(e.target.value, index)}
          onkeydown={(e) => handle_line_keydown(e, line.text)}
          autocomplete="off"
          spellcheck="true"
          disabled={store.select_mode}
          tabindex={store.select_mode ? -1 : 0}
        />

        {#if !store.select_mode}
          <button class="line-delete" onclick={() => store.delete_line(index)}
            aria-label="Eliminar línea" tabindex="-1"
            title="Click para eliminar · Mantener para selección múltiple">
            <Icon name="trash" size={14} />
          </button>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
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

  /* ── Línea ── */
  .script-line { position: relative; display: flex; align-items: center; gap: 12px; padding: 3px 0; border-radius: var(--radius-sm); }

  .insert-scene-btn { position: absolute; top: -1px; left: 50%; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); border-radius: 99px; padding: 2px 8px; cursor: pointer; opacity: 0; pointer-events: none; white-space: nowrap; transition: opacity var(--transition), color var(--transition), border-color var(--transition), background var(--transition); z-index: 2; }
  .script-line:hover .insert-scene-btn { opacity: 1; pointer-events: auto; }
  .insert-scene-btn:hover { color: var(--accent-text); border-color: var(--accent); background: var(--accent-muted); }

  /* ── Meta: nombre + badge ── */
  .line-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    width: var(--label-w, 72px);
    min-width: var(--label-w, 72px);
    flex-shrink: 0;
  }
  .context-meta { justify-content: center; }

  .line-character { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; text-align: right; word-break: break-word; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

  /* ── Badge ── */
  .line-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-radius: 99px;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badge-dialogue  { background: color-mix(in srgb, var(--type-dialogue) 15%, transparent); color: var(--type-dialogue); }
  .badge-thought   { background: color-mix(in srgb, var(--type-thought) 15%, transparent);  color: var(--type-thought); }
  .badge-narration { background: color-mix(in srgb, var(--type-narration) 15%, transparent); color: var(--type-narration); }
  .badge-context   { background: color-mix(in srgb, var(--text-muted) 15%, transparent); color: var(--text-muted); }

  /* ── Inputs ── */
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

  /* ── Modo selección ── */
  .select-mode-line { cursor: pointer; user-select: none; border-radius: var(--radius-sm); transition: background var(--transition); }
  .select-mode-line .line-input { pointer-events: none; }
  .select-mode-line .insert-scene-btn { pointer-events: none; }
  .select-mode-line .line-meta { pointer-events: none; }
  .select-mode-line:hover { background: var(--bg-muted); }
  .line-selected { background: color-mix(in srgb, var(--error-text) 10%, transparent) !important; border-radius: var(--radius-sm); }
  .line-selected .line-character { color: var(--error-text) !important; }
  .line-selected .line-badge { background: color-mix(in srgb, var(--error-text) 15%, transparent) !important; color: var(--error-text) !important; }
  .line-selected .line-input { color: var(--error-text) !important; }

  .context-line { margin: 2px 0; }
  .thought-line { margin: 1px 0; }
  .narration-line { margin: 1px 0; }
</style>


