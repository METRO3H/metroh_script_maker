<script>
  // CharacterMenu.svelte
  let { characters = $bindable([]), current_character = $bindable(), ondelete_character } = $props();

  // ── Dialog: agregar personaje ──
  let add_dialog    = $state(null);
  let new_character = $state("");
  let input_el      = $state(null);

  // ── Dialog: eliminar personaje ──
  let delete_dialog        = $state(null);
  let pending_delete_index = $state(null);

  // ── Feedback ──
  let added_name    = $state(null);
  let added_timeout = null;

  // ── Abrir/cerrar: agregar ──
  function open_add() {
    add_dialog?.showModal();
    setTimeout(() => input_el?.focus(), 50);
  }
  function close_add() {
    add_dialog?.close();
    new_character = "";
  }
  function handle_add_backdrop(e) {
    if (e.target === add_dialog) close_add();
  }

  // ── Agregar personaje ──
  function add_character() {
    const name = new_character.trim();
    if (!name) return;
    characters = [...characters, { name, id: Date.now() }];

    added_name = name;
    clearTimeout(added_timeout);
    added_timeout = setTimeout(() => (added_name = null), 2500);

    close_add();
  }

  // ── Abrir/cerrar: eliminar ──
  function open_delete(index) {
    if (characters.length <= 1) return;
    pending_delete_index = index;
    delete_dialog?.showModal();
  }
  function close_delete() {
    delete_dialog?.close();
    pending_delete_index = null;
  }
  function handle_delete_backdrop(e) {
    if (e.target === delete_dialog) close_delete();
  }

  // ── Confirmar eliminación — delega al padre ──
  function confirm_delete(mode) {
    if (pending_delete_index === null) return;
    ondelete_character?.({ index: pending_delete_index, mode });
    close_delete();
  }

  let pending_name = $derived(
    pending_delete_index !== null
      ? (characters[pending_delete_index]?.name ?? "")
      : ""
  );

  // Conteo de Desconocidos (para mostrar el nombre en el dialog)
  let unknown_count = $derived(
    characters.filter((c) => c.name.startsWith("Desconocido ")).length
  );
</script>

<div class="char-menu-wrapper">
  <span class="char-menu-label">Personaje</span>

  <div class="char-bar">
    <div class="char-pills">
      {#each characters as character, index}
        <div class="char-pill-wrapper group">
          <button
            class="char-pill"
            class:char-pill-active={current_character === index}
            onclick={() => (current_character = index)}
          >
            {character.name}
          </button>

          {#if characters.length > 1}
            <button
              class="char-pill-delete"
              onclick={(e) => { e.stopPropagation(); open_delete(index); }}
              aria-label={`Eliminar ${character.name}`}
              title={`Eliminar ${character.name}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="3"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          {/if}
        </div>
      {/each}

      <button
        class="char-add-btn"
        onclick={open_add}
        aria-label="Agregar nuevo personaje"
        title="Nuevo personaje"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"/><path d="M12 5v14"/>
        </svg>
      </button>
    </div>

    {#if added_name}
      <span class="added-toast">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        {added_name} agregado
      </span>
    {/if}
  </div>
</div>

<!-- ── Dialog: agregar personaje ── -->
<dialog bind:this={add_dialog} onclick={handle_add_backdrop}>
  <h2 class="dialog-title">Nuevo personaje</h2>

  <div class="dialog-field">
    <label for="char-name" class="dialog-label">Nombre</label>
    <input
      bind:this={input_el}
      type="text"
      id="char-name"
      bind:value={new_character}
      placeholder="Ej: María, Detective, Narrador..."
      class="input-base"
      onkeydown={(e) => {
        if (e.key === "Enter") add_character();
        if (e.key === "Escape") close_add();
      }}
    />
  </div>

  <div class="dialog-actions">
    <button onclick={close_add} class="btn btn-ghost">Cancelar</button>
    <button onclick={add_character} class="btn btn-primary">Agregar</button>
  </div>
</dialog>

<!-- ── Dialog: eliminar personaje ── -->
<dialog bind:this={delete_dialog} onclick={handle_delete_backdrop}>
  <h2 class="dialog-title">Eliminar "{pending_name}"</h2>
  <p class="dialog-body">¿Qué quieres hacer con sus líneas de diálogo?</p>

  <div class="delete-options">
    <button class="delete-option" onclick={() => confirm_delete("keep_as_unknown")}>
      <div class="delete-option-icon delete-option-icon-keep">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <div class="delete-option-text">
        <span class="delete-option-title">Conservar diálogos</span>
        <span class="delete-option-sub">Se asignarán a "Desconocido {unknown_count + 1}"</span>
      </div>
    </button>

    <button class="delete-option delete-option-danger" onclick={() => confirm_delete("remove_lines")}>
      <div class="delete-option-icon delete-option-icon-remove">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        </svg>
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
  .char-menu-wrapper {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .char-menu-label {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding-left: 2px;
  }

  .char-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    flex-wrap: wrap;
  }

  .char-pills {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    flex: 1;
  }

  .char-pill-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .char-pill {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    cursor: pointer;
    transition: background var(--transition), color var(--transition),
                border-color var(--transition), box-shadow var(--transition),
                padding-right var(--transition);
  }
  .char-pill-wrapper:hover .char-pill {
    border-color: var(--accent);
    color: var(--accent-text);
    background: var(--accent-muted);
    padding-right: 24px;
  }
  .char-pill-active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-muted);
  }
  .char-pill-wrapper:hover .char-pill-active {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
    color: #fff;
    padding-right: 24px;
  }

  .char-pill-delete {
    position: absolute;
    right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0;
    padding: 0;
    transition: opacity var(--transition), background var(--transition);
  }
  .char-pill-wrapper:hover .char-pill-delete { opacity: 0.7; }
  .char-pill-delete:hover { opacity: 1 !important; }

  .char-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    border: 1px dashed var(--border-strong);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color var(--transition), color var(--transition), background var(--transition);
  }
  .char-add-btn:hover {
    border-color: var(--accent);
    color: var(--accent-text);
    background: var(--accent-muted);
    border-style: solid;
  }

  .added-toast {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--success-text);
    background: var(--success-bg);
    border: 1px solid var(--success-border);
    padding: 3px 10px;
    border-radius: var(--radius-sm);
    animation: toast-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    white-space: nowrap;
  }

  dialog {
    margin: auto;
    position: fixed;
    inset: 0;
    width: calc(100% - 48px);
    max-width: 380px;
  }

  .dialog-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 6px;
    letter-spacing: -0.01em;
  }

  .dialog-body {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 16px;
  }

  .dialog-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 24px;
  }

  .dialog-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .delete-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 4px;
  }

  .delete-option {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--surface);
    cursor: pointer;
    text-align: left;
    transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
  }
  .delete-option:hover {
    border-color: var(--accent);
    background: var(--accent-muted);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }
  .delete-option-danger:hover {
    border-color: var(--error-text);
    background: var(--error-bg);
    box-shadow: 0 0 0 3px var(--error-bg);
  }

  .delete-option-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }
  .delete-option-icon-keep {
    background: var(--accent-muted);
    color: var(--accent-text);
  }
  .delete-option-icon-remove {
    background: var(--error-bg);
    color: var(--error-text);
  }

  .delete-option-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .delete-option-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .delete-option-sub {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(4px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
</style>