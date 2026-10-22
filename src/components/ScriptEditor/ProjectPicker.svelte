<script>
  // ProjectPicker.svelte — elegir (o crear) el proyecto del script actual
  let { store } = $props();

  const NEW = "__new__";
  let dialog = $state(null);
  let name = $state("");
  let error = $state("");
  let busy = $state(false);
  let select_el = $state(null);

  function on_change(e) {
    const v = e.target.value;
    if (v === NEW) {
      // El <select> no debe quedarse mostrando "Nuevo proyecto…".
      e.target.value = store.project_id ?? "";
      name = ""; error = "";
      dialog?.showModal();
      return;
    }
    store.set_project(v || null);
  }

  async function submit() {
    if (!name.trim() || busy) return;
    busy = true; error = "";
    const ok = await store.create_project(name);
    busy = false;
    if (ok) dialog?.close();
    else error = "No se pudo crear el proyecto (¿ya existe uno con ese nombre?)";
  }
</script>

<label class="project-picker">
  <span class="project-label">Proyecto</span>
  <select bind:this={select_el} class="project-select" value={store.project_id ?? ""} onchange={on_change}>
    <option value="">Sin proyecto</option>
    {#each store.projects as p (p.id)}
      <option value={p.id}>{p.name}</option>
    {/each}
    <option value={NEW}>+ Nuevo proyecto…</option>
  </select>
</label>

<dialog bind:this={dialog} onclick={(e) => e.target === dialog && dialog.close()}>
  <h2 class="dialog-title">Nuevo proyecto</h2>
  <input class="dialog-input" type="text" placeholder="Nombre del proyecto" maxlength="120"
    bind:value={name} autocomplete="off"
    onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />
  {#if error}<p class="dialog-error">{error}</p>{/if}
  <div class="dialog-actions">
    <button type="button" class="btn btn-ghost" onclick={() => dialog?.close()}>Cancelar</button>
    <button type="button" class="btn btn-primary" onclick={submit} disabled={!name.trim() || busy}>Crear</button>
  </div>
</dialog>

<style>
  .project-picker { display: inline-flex; align-items: center; gap: 8px; padding-bottom: 4px; }
  .project-label { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
  .project-select { font-family: var(--font-mono); font-size: 11px; max-width: 200px; background: var(--bg-subtle); color: var(--text-primary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 5px 8px; outline: none; }
  .project-select:focus { border-color: var(--accent); }
  .dialog-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px; }
  .dialog-input { width: 100%; font-family: var(--font-mono); font-size: 13px; background: var(--bg-subtle); color: var(--text-primary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 9px 12px; outline: none; margin-bottom: 8px; }
  .dialog-input:focus { border-color: var(--accent); }
  .dialog-error { font-size: 12px; color: var(--error-text); margin-bottom: 8px; }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
