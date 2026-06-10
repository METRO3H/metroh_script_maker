<script>
  // ScriptList.svelte
  let { scripts = [] } = $props();

  let delete_dialog     = $state(null);
  let pending_id        = $state(null);
  let pending_name      = $state("");
  let script_list       = $state(scripts);

  function format_date(ts) {
    return new Date(ts).toLocaleDateString("es-CL", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }

  function open_delete(id, name) {
    pending_id   = id;
    pending_name = name;
    delete_dialog?.showModal();
  }

  function cancel_delete() {
    pending_id   = null;
    pending_name = "";
    delete_dialog?.close();
  }

  function handle_backdrop(e) {
    if (e.target === delete_dialog) cancel_delete();
  }

  async function confirm_delete() {
    if (!pending_id) return;
    const id = pending_id;
    cancel_delete();

    const res = await fetch("/api/script/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script_id: id }),
    });

    if (res.ok) {
      script_list = script_list.filter((s) => s.id !== id);
    }
  }
</script>

{#if script_list.length === 0}
  <div class="empty-state">
    <div class="empty-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
    </div>
    <p class="empty-title">No tienes scripts guardados</p>
    <p class="empty-sub">Crea uno nuevo y aparecerá aquí</p>
    <a href="/dashboard" class="btn btn-primary" style="margin-top: 8px;">
      Crear el primero
    </a>
  </div>
{:else}
  <div class="scripts-grid">
    {#each script_list as s}
      <div class="script-card-wrapper">
        <a href={`/dashboard?id=${s.id}`} class="script-card">
          <h2 class="script-name">{s.name}</h2>
          <div class="script-meta">
            <span class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {s.character_count} personaje{s.character_count !== 1 ? "s" : ""}
            </span>
            <span class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="15" y2="18"/>
              </svg>
              {s.line_count} línea{s.line_count !== 1 ? "s" : ""}
            </span>
          </div>
          <div class="script-footer">
            <span class="script-date">{format_date(s.updated_at)}</span>
            <span class="script-cta">Editar →</span>
          </div>
        </a>

        <button
          class="script-delete-btn btn btn-danger-ghost"
          onclick={(e) => { e.preventDefault(); open_delete(s.id, s.name); }}
          aria-label={`Eliminar ${s.name}`}
          title={`Eliminar ${s.name}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

<dialog bind:this={delete_dialog} onclick={handle_backdrop}>
  <h2 class="dialog-title">Eliminar "{pending_name}"</h2>
  <p class="dialog-body">Se eliminarán todos los personajes y líneas. Esta acción no se puede deshacer.</p>
  <div class="dialog-actions">
    <button onclick={cancel_delete} class="btn btn-ghost">Cancelar</button>
    <button onclick={confirm_delete} class="btn btn-danger">Eliminar</button>
  </div>
</dialog>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 24px;
    gap: 8px;
    text-align: center;
  }
  .empty-icon { color: var(--text-muted); margin-bottom: 8px; opacity: 0.5; }
  .empty-title { font-size: 15px; font-weight: 500; color: var(--text-secondary); }
  .empty-sub { font-size: 13px; color: var(--text-muted); }

  .scripts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
  }

  .script-card-wrapper {
    position: relative;
  }

  .script-delete-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    opacity: 0;
    padding: 5px 7px;
    transition: opacity var(--transition), color var(--transition),
                border-color var(--transition), background var(--transition);
    z-index: 1;
  }
  .script-card-wrapper:hover .script-delete-btn {
    opacity: 1;
  }

  .script-name {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color var(--transition);
    padding-right: 28px;
  }
  .script-card-wrapper:hover .script-name { color: var(--accent-text); }

  .script-meta { display: flex; gap: 14px; margin-bottom: 16px; }
  .meta-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
  }

  .script-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .script-date { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
  .script-cta {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    color: var(--accent-text);
    opacity: 0;
    transition: opacity var(--transition);
  }
  .script-card-wrapper:hover .script-cta { opacity: 1; }

  .dialog-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
  .dialog-body  { font-size: 13px; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.5; }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

  .btn-danger {
    background: var(--error-text); color: #fff;
    font-family: var(--font-mono); font-size: 11px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 7px 16px; border-radius: var(--radius-md); border: none;
    cursor: pointer; transition: opacity var(--transition);
  }
  .btn-danger:hover { opacity: 0.85; }
</style>