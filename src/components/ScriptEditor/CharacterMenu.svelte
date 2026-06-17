<script>
   // CharacterMenu.svelte
   import { char_color } from "@lib/script.utils";
   import Icon from "@components/ui/Icon.svelte";

   let {
      characters = $bindable([]),
      current_character = $bindable(),
      current_type = $bindable("dialogue"),
      ondelete_character,
      ref = $bindable(null),
   } = $props();

   const TYPES = [
      { id: "dialogue", label: "Diálogo" },
      { id: "thought", label: "Pensamiento" },
      { id: "narration", label: "Narración" },
   ];

   const TYPE_COLOR = {
      dialogue: "var(--type-dialogue)",
      thought: "var(--type-thought)",
      narration: "var(--type-narration)",
   };

   ref = {
      open_add: () => { add_dialog?.showModal(); setTimeout(() => input_el?.focus(), 50); },
      close_all: () => { close_add(); close_delete(); close_edit(); type_popover_open = false; },
   };

   let type_popover_open = $state(false);
   let type_btn_el = $state(null);

   function toggle_type_popover() { type_popover_open = !type_popover_open; }
   function select_type(id) { current_type = id; if (current_character === -1) current_character = 0; type_popover_open = false; }

   let add_dialog = $state(null);
   let new_character = $state("");
   let input_el = $state(null);
   let delete_dialog = $state(null);
   let pending_delete_index = $state(null);
   let added_name = $state(null);
   let added_timeout = null;

   function open_add() { add_dialog?.showModal(); setTimeout(() => input_el?.focus(), 50); }
   function close_add() { add_dialog?.close(); new_character = ""; }
   function handle_add_backdrop(e) { if (e.target === add_dialog) close_add(); }

   function add_character() {
      const name = new_character.trim();
      if (!name) return;
      characters = [...characters, { name, id: Date.now() }];
      added_name = name;
      clearTimeout(added_timeout);
      added_timeout = setTimeout(() => (added_name = null), 2500);
      close_add();
   }

   let edit_dialog = $state(null);
   let edit_index = $state(null);
   let edit_name = $state("");
   let edit_input_el = $state(null);

   function open_edit(index) { edit_index = index; edit_name = characters[index].name; edit_dialog?.showModal(); setTimeout(() => edit_input_el?.focus(), 50); }
   function close_edit() { edit_dialog?.close(); edit_index = null; edit_name = ""; }
   function handle_edit_backdrop(e) { if (e.target === edit_dialog) close_edit(); }
   function confirm_edit() {
      const name = edit_name.trim();
      if (!name || edit_index === null) return;
      characters = characters.map((c, i) => (i === edit_index ? { ...c, name } : c));
      close_edit();
   }

   function open_delete(index) { if (characters.length <= 1) return; pending_delete_index = index; delete_dialog?.showModal(); }
   function close_delete() { delete_dialog?.close(); pending_delete_index = null; }
   function handle_delete_backdrop(e) { if (e.target === delete_dialog) close_delete(); }
   function confirm_delete(mode) { if (pending_delete_index === null) return; ondelete_character?.({ index: pending_delete_index, mode }); close_delete(); }

   let pending_name = $derived(pending_delete_index !== null ? (characters[pending_delete_index]?.name ?? "") : "");
   let unknown_count = $derived(characters.filter((c) => c.name.startsWith("Desconocido ")).length);
   let is_context = $derived(current_character === -1);
   let active_type_label = $derived(is_context ? "Contexto" : (TYPES.find((t) => t.id === current_type)?.label ?? "Diálogo"));

   $effect(() => {
      if (!type_popover_open) return;
      function on_click(e) { if (!type_btn_el?.contains(e.target)) type_popover_open = false; }
      window.addEventListener("mousedown", on_click);
      return () => window.removeEventListener("mousedown", on_click);
   });
</script>

<div class="char-menu-wrapper">
   <div class="menu-bar">
      <div class="type-selector" bind:this={type_btn_el}>
         <button
            class="type-active-btn"
            class:type-active-btn-context={is_context}
            style={is_context ? "" : `--type-color: ${TYPE_COLOR[current_type]}`}
            onclick={toggle_type_popover}
            title="Cambiar tipo de línea"
         >
            {active_type_label}
            <span class:chevron-up={type_popover_open}>
               <Icon name="chevron-down" size={9} stroke_width={2.5} />
            </span>
         </button>

         {#if type_popover_open}
            <div class="type-popover">
               <button class="type-popover-item" class:type-popover-item-active={is_context}
                  onclick={() => { current_character = -1; type_popover_open = false; }}>
                  <Icon name="context" size={11} stroke_width={2.5} />
                  Contexto
               </button>
               <div class="popover-divider"></div>
               {#each TYPES as t}
                  <button class="type-popover-item" class:type-popover-item-active={!is_context && current_type === t.id}
                     style="--item-color: {TYPE_COLOR[t.id]}" onclick={() => select_type(t.id)}>
                     <span class="type-popover-dot"></span>
                     {t.label}
                  </button>
               {/each}
            </div>
         {/if}
      </div>

      <div class="bar-divider"></div>

      {#each characters as character, index}
         <div class="char-pill-wrapper">
            <button
               class="char-pill"
               class:char-pill-active={!is_context && current_character === index}
               disabled={is_context}
               style={`--pill-color: ${char_color(index, characters.length)}`}
               onclick={() => { current_character = index; }}
               ondblclick={() => open_edit(index)}
               title={is_context ? "Desactiva Contexto para cambiar de personaje" : `${character.name} — doble clic para renombrar`}
            >
               {character.name}
            </button>
            {#if characters.length > 1}
               <button class="char-pill-delete" onclick={(e) => { e.stopPropagation(); open_delete(index); }}
                  aria-label={`Eliminar ${character.name}`} title={`Eliminar ${character.name}`}>
                  <Icon name="x" size={10} stroke_width={3} />
               </button>
            {/if}
         </div>
      {/each}

      <button class="char-add-btn" onclick={open_add} aria-label="Agregar nuevo personaje" title="Nuevo personaje">
         <Icon name="plus" size={14} stroke_width={2.5} />
      </button>

      {#if added_name}
         <span class="added-toast">
            <Icon name="check" size={11} stroke_width={2.5} />
            {added_name} agregado
         </span>
      {/if}
   </div>
</div>

<!-- Dialog: agregar -->
<dialog bind:this={add_dialog} onclick={handle_add_backdrop}>
   <h2 class="dialog-title">Nuevo personaje</h2>
   <div class="dialog-field">
      <label for="char-name" class="dialog-label">Nombre</label>
      <input bind:this={input_el} type="text" id="char-name" bind:value={new_character}
         placeholder="Ej: María, Detective, Narrador..." class="input-base"
         onkeydown={(e) => { if (e.key === "Enter") add_character(); if (e.key === "Escape") close_add(); }} />
   </div>
   <div class="dialog-actions">
      <button onclick={close_add} class="btn btn-ghost">Cancelar</button>
      <button onclick={add_character} class="btn btn-primary">Agregar</button>
   </div>
</dialog>

<!-- Dialog: editar -->
<dialog bind:this={edit_dialog} onclick={handle_edit_backdrop}>
   <h2 class="dialog-title">Renombrar personaje</h2>
   <div class="dialog-field">
      <label for="edit-char-name" class="dialog-label">Nuevo nombre</label>
      <input bind:this={edit_input_el} type="text" id="edit-char-name" bind:value={edit_name} class="input-base"
         onkeydown={(e) => { if (e.key === "Enter") confirm_edit(); if (e.key === "Escape") close_edit(); }} />
   </div>
   <div class="dialog-actions">
      <button onclick={close_edit} class="btn btn-ghost">Cancelar</button>
      <button onclick={confirm_edit} class="btn btn-primary">Renombrar</button>
   </div>
</dialog>

<!-- Dialog: eliminar -->
<dialog bind:this={delete_dialog} onclick={handle_delete_backdrop}>
   <h2 class="dialog-title">Eliminar "{pending_name}"</h2>
   <p class="dialog-body">¿Qué quieres hacer con sus líneas de diálogo?</p>
   <div class="delete-options">
      <button class="delete-option" onclick={() => confirm_delete("keep_as_unknown")}>
         <div class="delete-option-icon delete-option-icon-keep">
            <Icon name="user" size={16} />
         </div>
         <div class="delete-option-text">
            <span class="delete-option-title">Conservar diálogos</span>
            <span class="delete-option-sub">Se asignarán a "Desconocido {unknown_count + 1}"</span>
         </div>
      </button>
      <button class="delete-option delete-option-danger" onclick={() => confirm_delete("remove_lines")}>
         <div class="delete-option-icon delete-option-icon-remove">
            <Icon name="trash" size={16} />
         </div>
         <div class="delete-option-text">
            <span class="delete-option-title">Eliminar diálogos</span>
            <span class="delete-option-sub">Se borrarán todas sus líneas del script</span>
         </div>
      </button>
   </div>
   <div class="dialog-actions" style="margin-top: 8px;">
      <button onclick={close_delete} class="btn btn-ghost">Cancelar</button>
   </div>
</dialog>

<style>
   :global(:root) { --type-dialogue: #6d7cff; --type-thought: #c084fc; --type-narration: #fb923c; }
   :global([data-theme="dark"]) { --type-dialogue: #818cf8; --type-thought: #d8b4fe; --type-narration: #fdba74; }

   .char-menu-wrapper { display: flex; flex-direction: column; }
   .menu-bar { display: flex; align-items: center; gap: 4px; padding: 6px 10px; background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius-md); flex-wrap: wrap; }
   .bar-divider { width: 1px; height: 18px; background: var(--border-strong); margin: 0 4px; flex-shrink: 0; }

   .type-selector { position: relative; flex-shrink: 0; }
   .type-active-btn { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; padding: 4px 10px; border-radius: var(--radius-sm); border: 1px solid var(--type-color, var(--border-strong)); background: transparent; color: var(--type-color, var(--text-muted)); cursor: pointer; transition: background var(--transition), box-shadow var(--transition); min-width: 114px; justify-content: center; white-space: nowrap; box-sizing: border-box; }
   .type-active-btn:hover { background: color-mix(in srgb, var(--type-color, var(--border-strong)) 12%, transparent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--type-color, var(--border-strong)) 20%, transparent); }
   .type-active-btn-context { border-style: dashed; border-color: var(--border-strong); color: var(--text-muted); }
   .type-active-btn-context:hover { border-style: solid; color: var(--text-primary); background: var(--bg-muted); box-shadow: none; }
   .chevron-up { display: inline-flex; transform: rotate(180deg); }

   .type-popover { position: absolute; bottom: calc(100% + 8px); left: 0; min-width: 160px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-md); padding: 4px; z-index: 50; animation: popover-in 0.15s cubic-bezier(0.34, 1.4, 0.64, 1); }
   @keyframes popover-in { from { opacity: 0; transform: translateY(6px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

   .type-popover-item { display: flex; align-items: center; gap: 8px; width: 100%; font-family: var(--font-mono); font-size: 11px; font-weight: 600; letter-spacing: 0.06em; padding: 6px 10px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text-secondary); cursor: pointer; text-align: left; transition: background var(--transition), color var(--transition); }
   .type-popover-item:hover { background: var(--bg-muted); color: var(--text-primary); }
   .type-popover-item-active { color: var(--item-color, var(--accent-text)); background: color-mix(in srgb, var(--item-color, var(--accent)) 10%, transparent); }
   .type-popover-item-active:hover { background: color-mix(in srgb, var(--item-color, var(--accent)) 18%, transparent); }
   .type-popover-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--item-color, var(--accent)); flex-shrink: 0; }
   .popover-divider { height: 1px; background: var(--border); margin: 3px 6px; }

   .char-pill-wrapper { position: relative; display: inline-flex; align-items: center; }
   .char-pill { font-family: var(--font-mono); font-size: 11px; font-weight: 600; letter-spacing: 0.06em; padding: 4px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary); cursor: pointer; transition: background var(--transition), color var(--transition), border-color var(--transition), box-shadow var(--transition), padding-right var(--transition); }
   .char-pill:disabled { opacity: 0.35; cursor: not-allowed; }
   .char-pill-wrapper:hover .char-pill:not(:disabled) { border-color: var(--pill-color); color: var(--pill-color); background: color-mix(in srgb, var(--pill-color) 10%, transparent); padding-right: 24px; }
   .char-pill-active { background: color-mix(in srgb, var(--pill-color) 15%, transparent) !important; color: var(--pill-color) !important; border-color: var(--pill-color) !important; box-shadow: 0 0 0 2px color-mix(in srgb, var(--pill-color) 20%, transparent); }
   .char-pill-wrapper:hover .char-pill-active:not(:disabled) { padding-right: 24px; }

   .char-pill-delete { position: absolute; right: 4px; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; border: none; background: transparent; color: inherit; cursor: pointer; opacity: 0; padding: 0; transition: opacity var(--transition), background var(--transition); }
   .char-pill-wrapper:hover .char-pill-delete { opacity: 0.7; }
   .char-pill-delete:hover { opacity: 1 !important; }

   .char-add-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: var(--radius-sm); border: 1px dashed var(--border-strong); background: transparent; color: var(--text-muted); cursor: pointer; flex-shrink: 0; transition: border-color var(--transition), color var(--transition), background var(--transition); }
   .char-add-btn:hover { border-color: var(--accent); color: var(--accent-text); background: var(--accent-muted); border-style: solid; }

   .added-toast { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 11px; font-weight: 500; color: var(--success-text); background: var(--success-bg); border: 1px solid var(--success-border); padding: 3px 10px; border-radius: var(--radius-sm); animation: toast-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); white-space: nowrap; }

   .dialog-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; letter-spacing: -0.01em; }
   .dialog-body { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; }
   .dialog-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 24px; }
   .dialog-label { font-family: var(--font-mono); font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
   .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

   .delete-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
   .delete-option { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--surface); cursor: pointer; text-align: left; transition: border-color var(--transition), background var(--transition), box-shadow var(--transition); }
   .delete-option:hover { border-color: var(--accent); background: var(--accent-muted); box-shadow: 0 0 0 3px var(--accent-muted); }
   .delete-option-danger:hover { border-color: var(--error-text); background: var(--error-bg); box-shadow: 0 0 0 3px var(--error-bg); }
   .delete-option-icon { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--radius-sm); flex-shrink: 0; }
   .delete-option-icon-keep { background: var(--accent-muted); color: var(--accent-text); }
   .delete-option-icon-remove { background: var(--error-bg); color: var(--error-text); }
   .delete-option-text { display: flex; flex-direction: column; gap: 2px; }
   .delete-option-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
   .delete-option-sub { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }

   @keyframes toast-in { from { opacity: 0; transform: translateY(4px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
</style>
