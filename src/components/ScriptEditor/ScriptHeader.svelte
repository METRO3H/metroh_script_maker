<script>
  // ScriptHeader.svelte — título + acciones del editor
  let { store } = $props();
</script>

<div class="editor-header">
  <div class="title-block">
    <label for="script-title" class="field-label">Título</label>
    <input
      id="script-title"
      type="text"
      class="title-input"
      placeholder="Sin título..."
      bind:value={store.script_title}
      autocomplete="off"
    />
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
      <button class="btn btn-sm delete-batch-btn" onclick={() => store.request_batch_delete()} disabled={store.selected.size === 0}>
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

<style>
  .editor-header { display: flex; justify-content: space-between; align-items: flex-end; padding: 20px 24px 16px; gap: 16px; }
  .title-block { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
  .field-label { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
  .title-input { font-family: var(--font-mono); font-size: 22px; font-weight: 700; letter-spacing: -0.02em; background: transparent; border: none; border-bottom: 2px solid var(--accent); border-radius: 0; color: var(--text-primary); padding: 4px 0; outline: none; width: 100%; transition: border-color var(--transition); }
  .title-input::placeholder { color: var(--text-placeholder); font-weight: 400; }
  .title-input:focus { border-bottom-color: var(--accent-hover); }
  .editor-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .btn-sm { font-size: 10px; padding: 5px 10px; gap: 5px; }

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

  .delete-batch-btn { background: var(--error-text); color: #fff; border-color: var(--error-text); min-width: 114px; justify-content: center; }
  .delete-batch-btn:hover:not(:disabled) { opacity: 0.85; }
  .delete-batch-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }
</style>
