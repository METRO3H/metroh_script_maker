<script>
  // ScriptLines.svelte — área scrolleable de líneas
  import { tick } from "svelte";
  import { char_color, scene_visible_in, is_all_only, scene_mode } from "@lib/script.utils";

  let { store } = $props();

  // Cada tipo de línea tiene un ícono SVG (los emojis se renderizaban distinto
  // en cada sistema y desalineaban el badge) y un color propio.
  const TYPE_BADGE = {
    dialogue:  { icon: "message", label: "Diálogo" },
    thought:   { icon: "cloud",   label: "Pensamiento" },
    narration: { icon: "pen",     label: "Narración" },
    context:   { icon: "context", label: "Contexto" },
  };

  // ── Perspectivas de una escena (visible_in) ────────────────────
  // El botón junto al nombre de la escena muestra en qué perspectivas se ve y
  // abre un panel para cambiarlo. "Solo vista completa" = la escena únicamente
  // aparece al elegir "ver todas las perspectivas".
  let persp_open = $state(null); // índice de la escena con el panel abierto

  function toggle_persp(index) { persp_open = persp_open === index ? null : index; }

  function handle_persp_outside(e) {
    if (persp_open !== null && !e.target.closest?.(".persp-wrap")) persp_open = null;
  }
  function handle_persp_key(e) {
    if (e.key === "Escape" && persp_open !== null) { persp_open = null; e.stopPropagation(); }
  }

  // ── Datos de la escena: scene_id, pov y mode ───────────────────
  // El id es un texto corto y propio de la escena (no cambia con la posición).
  // Enter confirma; Escape descarta lo escrito.
  function handle_scene_id_keydown(e, line) {
    if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
    else if (e.key === "Escape") { e.currentTarget.value = line.scene_id ?? ""; e.currentTarget.blur(); e.stopPropagation(); }
  }
  function toggle_scene_mode(index, line) {
    store.set_scene_meta(index, { mode: scene_mode(line) === "render" ? "static" : "render" });
  }

  // ── Modo selección por "mantener presionado" ───────────────────
  // Solo se activa manteniendo presionada la columna izquierda de la línea
  // (nombre / contexto / badge), nunca el input de texto: así se puede
  // seleccionar texto con el mouse sin entrar en modo selección.
  const LONG_PRESS_MS = 500;
  const MOVE_TOLERANCE = 6;

  let long_press_timer = null;
  // true desde que el long-press dispara hasta que se suelta el botón: sirve
  // para que ese mismo "soltar" no des-seleccione la línea recién marcada.
  let long_press_fired = false;
  let press_x = 0;
  let press_y = 0;

  function cancel_long_press() {
    clearTimeout(long_press_timer);
    long_press_timer = null;
  }

  function handle_meta_mousedown(e, index) {
    if (e.button !== 0 || store.select_mode) return;
    cancel_long_press();
    long_press_fired = false;
    press_x = e.clientX;
    press_y = e.clientY;
    long_press_timer = setTimeout(() => {
      long_press_timer = null;
      long_press_fired = true;
      store.enter_select_mode(index);
    }, LONG_PRESS_MS);
  }

  // Si el mouse se arrastra, es la selección por rectángulo, no un long-press.
  function handle_meta_mousemove(e) {
    if (long_press_timer === null) return;
    if (Math.abs(e.clientX - press_x) > MOVE_TOLERANCE || Math.abs(e.clientY - press_y) > MOVE_TOLERANCE) {
      cancel_long_press();
    }
  }

  // Ya en modo selección, un click en cualquier parte de la línea la marca/desmarca.
  function handle_line_mouseup(index) {
    cancel_long_press();
    if (long_press_fired) { long_press_fired = false; return; }
    if (store.select_mode) store.toggle_select(index);
  }

  function handle_window_mouseup() {
    cancel_long_press();
    setTimeout(() => { long_press_fired = false; }, 0);
  }

  // ── Campo de línea con wrap ────────────────────────────────────
  // La línea es un <textarea rows=1> dentro de .line-field. El alto lo define
  // el navegador, sin medir nada en JS: .line-field::after copia el texto
  // (data-value) con las mismas medidas y comparte la celda del grid con el
  // textarea; si el texto hace wrap, la copia crece y el textarea la sigue.
  // Por eso data-value debe mantenerse igual al valor mientras se escribe.
  function sync_field(el) {
    const wrap = el.parentElement;
    if (wrap) wrap.dataset.value = el.value || el.placeholder;
  }

  // Una línea es de una sola "frase": si se pega texto con saltos de línea,
  // se convierten en espacios.
  function handle_line_input(e) {
    const el = e.currentTarget;
    if (/[\r\n]/.test(el.value)) {
      const pos = el.selectionStart;
      const clean = el.value.replace(/\s*[\r\n]+\s*/g, " ");
      el.value = clean;
      el.setSelectionRange(Math.min(pos, clean.length), Math.min(pos, clean.length));
    }
    sync_field(el);
  }

  // Teclado dentro del campo de una línea (vale para las dos pestañas).
  //  · Enter confirma. En English salta además a la siguiente línea (flujo
  //    rápido de traducción y revisión).
  //  · Escape descarta el cambio; si la línea queda vacía en ambos idiomas
  //    (p. ej. una línea recién insertada), se elimina.
  //  · Alt + ↑/↓ sube o baja la línea un lugar.
  function handle_line_keydown(e, index) {
    const line = store.full_script[index];
    const en = store.lang === "en";
    const original = (en ? line?.text_en : line?.text) ?? "";
    const other = (en ? line?.text : line?.text_en) ?? "";

    if (e.key === "Enter") {
      e.preventDefault();
      if (!en) { e.currentTarget.blur(); return; }
      const next = store.full_script.findIndex((l, i) => i > index && !l.is_scene);
      const target = next === -1 ? null : document.getElementById(`script${next}`);
      if (target) { target.focus(); target.scrollIntoView({ block: "center", behavior: "smooth" }); }
      else e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.currentTarget.value = original;
      sync_field(e.currentTarget);
      e.currentTarget.blur();
      if (original.trim() === "" && other.trim() === "") store.delete_line(index);
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      store.update_line(e.currentTarget.value, index);
      move_and_refocus(index, e.key === "ArrowUp" ? index - 1 : index + 2);
    }
  }

  // ── Insertar una línea entre dos líneas ────────────────────────
  function insert_line_here(index) {
    if (!store.insert_line(index)) return;
    flash(index);
    tick().then(() => document.getElementById(`script${index}`)?.focus());
  }

  // Destello breve en la línea que se movió o se insertó.
  let flash_index = $state(null);
  let flash_timer = null;
  function flash(index) {
    flash_index = index;
    clearTimeout(flash_timer);
    flash_timer = setTimeout(() => (flash_index = null), 900);
  }

  function move_and_refocus(from, at) {
    const dest = store.move_line(from, at);
    if (dest === null) return;
    flash(dest);
    tick().then(() => document.getElementById(`script${dest}`)?.focus());
  }

  // ── Drag & drop para reordenar ─────────────────────────────────
  // Se arrastra desde el "agarre" (⋮⋮) de la izquierda, no desde la fila
  // entera, para no interferir con seleccionar texto en el input. La posición
  // de soltado es un índice del arreglo (0 = al principio, length = al final).
  let drag_from = $state(null);
  let drop_at = $state(null);

  function handle_drag_start(e, index) {
    drag_from = index;
    drop_at = null;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index)); // Firefox lo exige
    const row = e.currentTarget.closest(".script-line");
    if (row) e.dataTransfer.setDragImage(row, 16, 14);
  }

  function handle_drag_over(e, index) {
    if (drag_from === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    const at = e.clientY < r.top + r.height / 2 ? index : index + 1;
    if (at !== drop_at) drop_at = at;
  }

  function handle_drop(e) {
    if (drag_from === null) return;
    e.preventDefault();
    const dest = drop_at === null ? null : store.move_line(drag_from, drop_at);
    reset_drag();
    if (dest !== null) flash(dest);
  }

  function reset_drag() { drag_from = null; drop_at = null; }

  // Un soltado que no cambiaría nada (justo encima o debajo de sí misma) no
  // muestra indicador.
  const drop_is_noop = $derived(drag_from !== null && (drop_at === drag_from || drop_at === drag_from + 1));
  const show_drop = (at) => drag_from !== null && drop_at === at && !drop_is_noop;
</script>

<svelte:window onmouseup={handle_window_mouseup} onmousedown={handle_persp_outside} onkeydown={handle_persp_key} />

<!--
  Íconos de cada fila como SVG estático (mismo dibujo que ui/Icon.svelte). Con
  Icon.svelte se creaba una instancia de componente por cada ícono de cada
  línea (5 por fila): en un guion largo eran miles de componentes.
-->
{#snippet ico_grip()}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>{/snippet}
{#snippet ico_plus()}<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>{/snippet}
{#snippet ico_trash()}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>{/snippet}
{#snippet ico_eye()}<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>{/snippet}
{#snippet ico_x()}<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>{/snippet}
{#snippet ico_badge(name)}{#if name === "message"}<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>{:else if name === "cloud"}<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>{:else if name === "pen"}<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>{:else}<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>{/if}{/snippet}

{#snippet meta(line, index, interactive)}
  {@const kind = line.is_context ? "context" : (line.line_type ?? "dialogue")}
  {@const badge = TYPE_BADGE[kind] ?? TYPE_BADGE.dialogue}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="line-meta"
    class:context-meta={line.is_context}
    class:meta-pressable={interactive}
    title={interactive ? "Mantén presionado para seleccionar varias líneas" : undefined}
    onmousedown={interactive ? (e) => handle_meta_mousedown(e, index) : undefined}
    onmousemove={interactive ? handle_meta_mousemove : undefined}
    onmouseleave={interactive ? cancel_long_press : undefined}
  >
    {#if !line.is_context}
      {@const name = store.characters[line.character_index]?.name ?? "?"}
      <span
        class="line-character"
        title={name}
        style={`color: ${char_color(line.character_index, store.characters.length)}`}
      >{name}</span>
    {/if}
    <span class="line-badge badge-{kind}">
      {@render ico_badge(badge.icon)}
      <span class="badge-text">{badge.label}</span>
    </span>
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="lines-area" bind:this={store.lines_area_el} style="--label-w: {store.label_width}px"
  ondragover={(e) => { if (drag_from !== null && e.target === e.currentTarget) { e.preventDefault(); drop_at = store.full_script.length; } }}
  ondrop={handle_drop}>
  {#if store.full_script.length === 0}
    <div class="empty-state">
      <p class="empty-title">El script está vacío</p>
      <p class="empty-sub">{store.lang === "en" ? "Select a character and start writing below" : "Selecciona un personaje y empieza a escribir abajo"}</p>
    </div>
  {/if}

  {#each store.full_script as line, index (line.uid)}
    {#if line.is_scene}
      {@const vis = scene_visible_in(line)}
      {@const all_only = is_all_only(vis)}
      {@const en_ui = store.lang === "en"}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="scene-separator" data-scene-index={index}
        class:drop-above={show_drop(index)}
        class:drop-below={index === store.full_script.length - 1 && show_drop(index + 1)}
        ondragover={(e) => handle_drag_over(e, index)}
        ondrop={handle_drop}>
        <div class="scene-separator-inner">
          <span class="scene-label">{store.lang === "en" ? "Scene" : "Escena"} {line.scene_number}</span>

          <div class="scene-meta" data-no-rect>
            <input
              class="scene-id-input"
              value={line.scene_id ?? ""}
              placeholder="id"
              maxlength="100"
              size="8"
              autocomplete="off"
              spellcheck="false"
              aria-label={en_ui ? "Scene id" : "ID de la escena"}
              title={en_ui ? "Scene id (e.g. 1_04S)" : "ID de la escena (p. ej. 1_04S)"}
              onblur={(e) => store.set_scene_meta(index, { scene_id: e.currentTarget.value })}
              onkeydown={(e) => handle_scene_id_keydown(e, line)}
            />
            <label class="scene-chip" class:chip-empty={!line.pov} title={en_ui ? "Character whose point of view this scene follows" : "Personaje desde cuyo punto de vista transcurre la escena"}>
              <span class="chip-key">POV</span>
              <select class="scene-pov-select" value={line.pov ?? ""} onchange={(e) => store.set_scene_meta(index, { pov: e.currentTarget.value })}>
                <option value="">{en_ui ? "None" : "Ninguno"}</option>
                {#each store.characters as c (c.id)}
                  <option value={c.name}>{c.name}</option>
                {/each}
              </select>
            </label>
            <button class="scene-chip scene-mode scene-mode-{scene_mode(line)}" onclick={() => toggle_scene_mode(index, line)}
              title={en_ui ? "Scene mode: click to switch between render and static" : "Modo de la escena: clic para alternar entre render y static"}>
              {scene_mode(line) === "render" ? "Render" : "Static"}
            </button>
          </div>

          <div class="persp-wrap" data-no-rect>
            <button class="persp-btn" class:persp-btn-all={all_only} class:persp-btn-open={persp_open === index}
              onclick={() => toggle_persp(index)}
              aria-haspopup="true" aria-expanded={persp_open === index}
              title={en_ui ? "Perspectives where this scene is visible" : "Perspectivas en las que se ve esta escena"}>
              {@render ico_eye()}
              <span class="persp-text">{all_only ? (en_ui ? "Full view only" : "Solo vista completa") : vis.join(", ")}</span>
            </button>

            {#if persp_open === index}
              <div class="persp-pop" role="group" aria-label={en_ui ? "Scene perspectives" : "Perspectivas de la escena"}>
                <p class="persp-title">{en_ui ? "Visible in…" : "Visible en…"}</p>
                <label class="persp-row">
                  <input type="radio" name={`persp-all-${index}`} checked={all_only} onchange={() => store.set_scene_visibility(index, [])} />
                  <span class="persp-name">{en_ui ? "Full view only" : "Solo vista completa"}</span>
                </label>
                <p class="persp-hint">{en_ui ? "Only seen when “see all perspectives” is chosen." : "Solo se ve al elegir «ver todas las perspectivas»."}</p>
                <div class="persp-sep"></div>
                {#each store.characters as c, ci (c.id)}
                  <label class="persp-row">
                    <input type="checkbox" checked={vis.includes(c.name)} onchange={() => store.toggle_scene_perspective(index, c.name)} />
                    <span class="persp-name" style={`color: ${char_color(ci, store.characters.length)}`}>{c.name}</span>
                  </label>
                {/each}
                <button class="persp-all-btn" onclick={() => store.set_scene_visibility(index, store.characters.map((x) => x.name))}>
                  {en_ui ? "All characters" : "Todos los personajes"}
                </button>
                <p class="persp-hint">{en_ui ? "Also seen in the full view." : "También se ve en la vista completa."}</p>
              </div>
            {/if}
          </div>

          <div class="scene-line"></div>
          <button class="scene-delete" onclick={() => store.delete_scene(index)}
            aria-label="Eliminar escena {line.scene_number}" title="Eliminar escena">
            {@render ico_x()}
          </button>
        </div>
      </div>
    {:else}
      <!-- Cada línea tiene su texto en español y en inglés. El input edita el del
           idioma activo; si existe, el del otro idioma se muestra encima como
           referencia (siempre en English; en Español, solo si esa línea todavía
           no tiene español). -->
      {@const en = store.lang === "en"}
      {@const own = (en ? line.text_en : line.text) ?? ""}
      {@const other = (en ? line.text : line.text_en) ?? ""}
      {@const show_ref = other.trim() !== "" && (en || own.trim() === "")}
      {@const ph = show_ref ? (en ? "Translation…" : "Escribe la versión en español…") : en ? "Write here…" : "Escribe aquí…"}
      <div
        class="script-line"
        class:with-ref={show_ref}
        class:line-missing={show_ref && own.trim() === ""}
        class:context-line={line.is_context}
        class:thought-line={line.line_type === "thought"}
        class:narration-line={line.line_type === "narration"}
        class:select-mode-line={store.select_mode}
        class:line-selected={store.selected.has(index)}
        class:line-dragging={drag_from === index}
        class:line-flash={flash_index === index}
        class:drop-above={show_drop(index)}
        class:drop-below={index === store.full_script.length - 1 && show_drop(index + 1)}
        onmouseup={() => handle_line_mouseup(index)}
        ondragover={(e) => handle_drag_over(e, index)}
        ondrop={handle_drop}
        role="option"
        aria-selected={store.selected.has(index)}
        data-line-index={index}
      >
        {#if !store.select_mode}
          <!-- Agarre para reordenar: solo este elemento es arrastrable. -->
          <span class="drag-handle" draggable="true" data-no-rect title="Arrastra para mover la línea (o Alt + ↑ / ↓)"
            role="presentation"
            ondragstart={(e) => handle_drag_start(e, index)} ondragend={reset_drag}>
            {@render ico_grip()}
          </span>
        {/if}

        <div class="insert-actions">
          <button class="insert-btn" onclick={() => insert_line_here(index)}
            title="Insertar una línea aquí" aria-label="Insertar línea antes de esta línea" tabindex="-1">
            {@render ico_plus()}línea
          </button>
          <button class="insert-btn" onclick={() => store.insert_scene(index)}
            title="Insertar escena aquí" aria-label="Insertar escena antes de esta línea" tabindex="-1">
            {@render ico_plus()}escena
          </button>
        </div>

        {@render meta(line, index, true)}

        <div class="line-main">
          {#if show_ref}
            <span class="line-ref" class:line-ref-italic={line.is_context || line.line_type === "thought" || line.line_type === "narration"}
              lang={en ? "es" : "en"} title={en ? "Versión en español" : "English version"}>{other}</span>
          {/if}
          <div
            class="line-field"
            class:field-italic={line.is_context || line.line_type === "thought" || line.line_type === "narration"}
            class:field-narration={line.line_type === "narration"}
            data-value={own || ph}
          >
            <textarea
              name={`script${index}`}
              id={`script${index}`}
              class="line-input"
              class:context-input={line.is_context}
              class:thought-input={line.line_type === "thought"}
              class:narration-input={line.line_type === "narration"}
              rows="1"
              value={own}
              oninput={handle_line_input}
              onblur={(e) => store.update_line(e.target.value, index)}
              onkeydown={(e) => handle_line_keydown(e, index)}
              placeholder={ph}
              autocomplete="off"
              spellcheck="true"
              lang={store.lang}
              disabled={store.select_mode}
              tabindex={store.select_mode ? -1 : 0}
            ></textarea>
          </div>
        </div>

        {#if !store.select_mode}
          <button class="line-delete" onclick={() => store.delete_line(index)}
            aria-label="Eliminar línea" tabindex="-1"
            title="Eliminar línea">
            {@render ico_trash()}
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

  .scene-separator { position: relative; padding: 12px 0 6px; scroll-margin-top: 12px; }
  .scene-separator-inner { display: flex; align-items: center; gap: 8px; }
  .scene-label { font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }
  .scene-line { flex: 1; height: 1px; background: var(--border); }
  .scene-delete { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; border: 1px solid transparent; background: transparent; color: var(--text-muted); cursor: pointer; opacity: 0; padding: 0; flex-shrink: 0; transition: opacity var(--transition), background var(--transition), color var(--transition), border-color var(--transition); }
  .scene-separator:hover .scene-delete { opacity: 1; }
  .scene-delete:hover { background: var(--error-bg); color: var(--error-text); border-color: var(--error-border); }

  /* ── Datos de la escena (id, pov, mode) ── */
  .scene-meta { display: flex; align-items: center; gap: 6px; flex-shrink: 0; min-width: 0; }
  .scene-id-input { width: 9ch; height: 18px; padding: 0 7px; border-radius: 99px; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.06em; outline: none; transition: border-color var(--transition), background var(--transition), color var(--transition); }
  .scene-id-input::placeholder { color: var(--text-placeholder); font-weight: 600; }
  .scene-id-input:hover { border-color: var(--border-strong, var(--border)); }
  .scene-id-input:focus { border-color: var(--accent); background: var(--surface); color: var(--text-primary); }
  .scene-chip { display: inline-flex; align-items: center; gap: 5px; height: 18px; padding: 0 8px; border-radius: 99px; border: 1px solid var(--accent); background: var(--accent-muted); color: var(--accent-text); font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.06em; cursor: pointer; transition: background var(--transition), border-color var(--transition), color var(--transition); }
  .chip-empty, .scene-mode-static { border-color: var(--border); background: transparent; color: var(--text-muted); }
  .scene-chip:hover { border-color: var(--accent); color: var(--accent-text); background: var(--accent-muted); }
  .chip-key { opacity: 0.75; }
  .scene-pov-select { max-width: 110px; padding: 0; border: 0; outline: none; background: transparent; color: inherit; font: inherit; letter-spacing: inherit; cursor: pointer; text-overflow: ellipsis; appearance: none; -webkit-appearance: none; }
  .scene-pov-select option { color: var(--text-primary); background: var(--surface); font-weight: 600; }
  .scene-chip:focus-within, .scene-mode:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  /* ── Perspectivas de la escena ── */
  .persp-wrap { position: relative; flex-shrink: 1; min-width: 0; }
  .persp-btn { display: inline-flex; align-items: center; gap: 5px; max-width: 260px; height: 18px; padding: 0 8px 0 6px; border-radius: 99px; border: 1px solid var(--accent); background: var(--accent-muted); color: var(--accent-text); font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.06em; cursor: pointer; transition: background var(--transition), border-color var(--transition), color var(--transition); }
  .persp-btn :global(svg) { flex-shrink: 0; }
  .persp-btn-all { border-color: var(--border); background: transparent; color: var(--text-muted); }
  .persp-btn:hover, .persp-btn-open { border-color: var(--accent); color: var(--accent-text); background: var(--accent-muted); }
  .persp-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .persp-pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 10; min-width: 220px; max-width: 320px; padding: 10px 12px; background: var(--surface-raised, var(--surface)); border: 1px solid var(--border-strong, var(--border)); border-radius: var(--radius-md); box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,.18)); display: flex; flex-direction: column; gap: 4px; }
  .persp-title { font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px; }
  .persp-row { display: flex; align-items: center; gap: 8px; padding: 3px 4px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; color: var(--text-primary); }
  .persp-row:hover { background: var(--bg-muted); }
  .persp-row input { accent-color: var(--accent); margin: 0; }
  .persp-name { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .persp-hint { font-size: 10.5px; line-height: 1.35; color: var(--text-muted); padding: 0 4px; }
  .persp-sep { height: 1px; background: var(--border); margin: 4px 0; }
  .persp-all-btn { align-self: flex-start; margin: 4px 4px 0; padding: 2px 8px; border-radius: 99px; border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary); font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; transition: color var(--transition), border-color var(--transition), background var(--transition); }
  .persp-all-btn:hover { color: var(--accent-text); border-color: var(--accent); background: var(--accent-muted); }

  /* ── Línea ── */
  /* Alineado arriba: si una línea hace wrap, nombre, badge y botones quedan junto a su primera fila. */
  .script-line { position: relative; display: flex; align-items: flex-start; gap: 12px; padding: 3px 0; border-radius: var(--radius-sm); }

  /* "+ línea" y "+ escena": aparecen al pasar el mouse, centrados sobre el borde superior de la línea. */
  .insert-actions { position: absolute; top: -1px; left: 50%; transform: translate(-50%, -50%); display: flex; gap: 6px; opacity: 0; pointer-events: none; transition: opacity var(--transition); z-index: 2; }
  .script-line:hover .insert-actions { opacity: 1; pointer-events: auto; }
  .insert-btn { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); border-radius: 99px; padding: 2px 8px; cursor: pointer; white-space: nowrap; transition: color var(--transition), border-color var(--transition), background var(--transition); }
  .insert-btn:hover { color: var(--accent-text); border-color: var(--accent); background: var(--accent-muted); }

  /* ── Reordenar (drag & drop) ── */
  .drag-handle { position: absolute; left: -22px; top: 3px; display: flex; align-items: center; justify-content: center; width: 18px; height: 28px; color: var(--text-muted); cursor: grab; opacity: 0; border-radius: var(--radius-sm); transition: opacity var(--transition), color var(--transition), background var(--transition); user-select: none; }
  .script-line:hover .drag-handle { opacity: 0.7; }
  .drag-handle:hover { opacity: 1 !important; color: var(--text-primary); background: var(--bg-muted); }
  .drag-handle:active { cursor: grabbing; }
  .line-dragging { opacity: 0.4; }
  .drop-above::before, .drop-below::after { content: ""; position: absolute; left: 0; right: 0; height: 2px; border-radius: 2px; background: var(--accent); box-shadow: 0 0 0 2px var(--accent-muted); pointer-events: none; z-index: 3; }
  .drop-above::before { top: -1px; }
  .drop-below::after { bottom: -1px; }
  .line-flash { animation: line-flash 0.9s ease-out; }
  @keyframes line-flash { from { background: var(--accent-muted); } to { background: transparent; } }

  /* ── Meta: nombre + badge ──
     El ancho de la columna (--label-w) viene del store y nunca baja del
     necesario para el badge más largo ("Pensamiento"), así no se corta. */
  .line-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    width: var(--label-w, 96px);
    min-width: var(--label-w, 96px);
    flex-shrink: 0;
    user-select: none;
    -webkit-user-select: none;
  }
  .context-meta { justify-content: center; }
  .line-character { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; text-align: right; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

  /* ── Badge ── */
  .line-badge {
    --badge-color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 15px;
    padding: 0 6px 0 5px;
    border-radius: 99px;
    border: 1px solid color-mix(in srgb, var(--badge-color) 28%, transparent);
    background: color-mix(in srgb, var(--badge-color) 11%, transparent);
    color: var(--badge-color);
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.02em;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .line-badge :global(svg) { flex-shrink: 0; }
  .badge-dialogue  { --badge-color: var(--type-dialogue); }
  .badge-thought   { --badge-color: var(--type-thought); }
  .badge-narration { --badge-color: var(--type-narration); }
  .badge-context   { --badge-color: var(--text-secondary); }

  /* ── Inputs ── */
  /* Campo que crece con el texto: textarea y ::after comparten celda y medidas. */
  .line-field { flex: 1; min-width: 0; display: grid; font-family: var(--font-mono); font-size: 13px; line-height: 1.35; }
  .line-field::after {
    content: attr(data-value);
    grid-area: 1 / 1;
    visibility: hidden;
    pointer-events: none;
    box-sizing: border-box;
    padding: 7px 10px; border: 1px solid transparent;
    white-space: pre-wrap; overflow-wrap: anywhere; word-break: normal;
    font: inherit; letter-spacing: inherit;
  }
  .field-italic { font-style: italic; }
  .field-narration { letter-spacing: 0.01em; }
  .line-input { grid-area: 1 / 1; display: block; box-sizing: border-box; width: 100%; min-width: 0; margin: 0; resize: none; overflow: hidden; background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); padding: 7px 10px; font: inherit; letter-spacing: inherit; color: var(--text-primary); outline: none; white-space: pre-wrap; overflow-wrap: anywhere; word-break: normal; transition: background var(--transition), border-color var(--transition); }
  .line-input:hover { background: var(--bg-subtle); border-color: var(--border); }
  .line-input:focus { background: var(--surface); border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-muted); }
  .context-input { font-style: italic; color: var(--text-secondary) !important; }
  .context-input:focus { border-color: var(--border-strong) !important; box-shadow: none !important; }
  .thought-input { font-style: italic; color: color-mix(in srgb, var(--type-thought) 80%, var(--text-primary)); }
  .narration-input { font-style: italic; color: color-mix(in srgb, var(--type-narration) 80%, var(--text-primary)); letter-spacing: 0.01em; }

  .line-delete { margin-top: 3px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text-muted); cursor: pointer; opacity: 0; transition: opacity var(--transition), background var(--transition), color var(--transition); flex-shrink: 0; }
  .script-line:hover .line-delete { opacity: 1; }
  .line-delete:hover { background: var(--error-bg); color: var(--error-text); }

  /* ── Modo selección ── */
  .select-mode-line { cursor: pointer; user-select: none; border-radius: var(--radius-sm); transition: background var(--transition); }
  .select-mode-line .line-input { pointer-events: none; }
  .select-mode-line .insert-actions { display: none; }
  .select-mode-line .line-meta { pointer-events: none; }
  .select-mode-line:hover { background: var(--bg-muted); }
  .line-selected { background: color-mix(in srgb, var(--error-text) 10%, transparent) !important; border-radius: var(--radius-sm); }
  .line-selected .line-character { color: var(--error-text) !important; }
  .line-selected .line-badge { --badge-color: var(--error-text); }
  .line-selected .line-input { color: var(--error-text) !important; }

  /* ── Pestaña English ── */
  /* Línea con la versión del otro idioma como referencia encima del input */
  .line-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .with-ref { padding: 5px 0 5px 8px; border-left: 2px solid transparent; }
  .with-ref .drag-handle { top: 50%; transform: translateY(-50%); }
  .with-ref .line-meta { padding-top: 4px; }
  .with-ref .line-delete { align-self: center; margin-top: 0; }
  /* Falta el texto principal de esta línea en el idioma activo */
  .line-missing { border-left-color: var(--accent); }
  .line-ref { font-size: 12px; line-height: 1.4; color: var(--text-muted); padding: 0 10px; overflow-wrap: anywhere; }
  .line-ref-italic { font-style: italic; }
  .with-ref .line-input { background: var(--bg-subtle); border-color: var(--border); }
  .with-ref .line-input::placeholder { color: var(--text-placeholder); }
</style>
