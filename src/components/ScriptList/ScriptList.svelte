<script>
  // ScriptList.svelte — scripts agrupados por proyecto
  import Icon from "@components/ui/Icon.svelte";

  let { scripts = [], projects = [] } = $props();

  let script_list  = $state(scripts);
  let project_list = $state(projects);

  // Un grupo por proyecto (aunque esté vacío) + "Sin proyecto" al final,
  // solo si tiene scripts.
  let groups = $derived.by(() => {
    const by_project = project_list.map((p) => ({
      id: p.id,
      name: p.name,
      scripts: script_list.filter((s) => s.project_id === p.id),
    }));
    const loose = script_list.filter((s) => !s.project_id || !project_list.some((p) => p.id === s.project_id));
    return loose.length ? [...by_project, { id: null, name: "Sin proyecto", scripts: loose }] : by_project;
  });

  function format_date(ts) {
    return new Date(ts).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
  }

  // ── Eliminar script ──
  let delete_dialog = $state(null);
  let pending_id    = $state(null);
  let pending_name  = $state("");
  function open_delete(id, name) { pending_id = id; pending_name = name; delete_dialog?.showModal(); }
  function cancel_delete() { pending_id = null; pending_name = ""; delete_dialog?.close(); }
  function handle_backdrop(e) { if (e.target === delete_dialog) cancel_delete(); }
  async function confirm_delete() {
    if (!pending_id) return;
    const id = pending_id;
    cancel_delete();
    const res = await fetch("/api/script/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script_id: id }),
    });
    if (res.ok) script_list = script_list.filter((s) => s.id !== id);
  }

  // ── Crear / renombrar proyecto ──
  let project_dialog = $state(null);
  let project_mode   = $state("create"); // "create" | "rename"
  let project_target = $state(null);
  let project_name   = $state("");
  let project_error  = $state("");
  let project_busy   = $state(false);

  function open_create_project() { project_mode = "create"; project_target = null; project_name = ""; project_error = ""; project_dialog?.showModal(); }
  function open_rename_project(p) { project_mode = "rename"; project_target = p.id; project_name = p.name; project_error = ""; project_dialog?.showModal(); }

  async function submit_project() {
    const name = project_name.trim();
    if (!name || project_busy) return;
    project_busy = true; project_error = "";
    try {
      const url = project_mode === "create" ? "/api/project/create" : "/api/project/rename";
      const body = project_mode === "create" ? { name } : { project_id: project_target, name };
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { project_error = "No se pudo guardar (¿ya existe un proyecto con ese nombre?)"; return; }
      if (project_mode === "create") {
        const { project_id } = await res.json();
        project_list = [...project_list, { id: project_id, name }];
      } else {
        project_list = project_list.map((p) => (p.id === project_target ? { ...p, name } : p));
      }
      project_list = [...project_list].sort((a, b) => a.name.localeCompare(b.name, "es"));
      project_dialog?.close();
    } catch {
      project_error = "Error de red";
    } finally {
      project_busy = false;
    }
  }

  // ── Eliminar proyecto (los scripts NO se borran: quedan sin proyecto) ──
  let pdelete_dialog = $state(null);
  let pdelete_target = $state(null);
  function open_delete_project(p) { pdelete_target = p; pdelete_dialog?.showModal(); }
  async function confirm_delete_project() {
    const p = pdelete_target;
    if (!p) return;
    pdelete_dialog?.close();
    const res = await fetch("/api/project/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: p.id }),
    });
    if (res.ok) {
      project_list = project_list.filter((x) => x.id !== p.id);
      script_list = script_list.map((s) => (s.project_id === p.id ? { ...s, project_id: null } : s));
    }
  }
</script>

<div class="list-toolbar">
  <button type="button" class="btn btn-ghost btn-sm" onclick={open_create_project}>
    <Icon name="plus" size={11} stroke_width={2.5} />Nuevo proyecto
  </button>
</div>

{#if script_list.length === 0 && project_list.length === 0}
  <div class="empty-state">
    <div class="empty-icon"><Icon name="file-plus" size={32} stroke_width={1.5} /></div>
    <p class="empty-title">No tienes scripts guardados</p>
    <p class="empty-sub">Crea uno nuevo y aparecerá aquí</p>
    <a href="/scripts/editor" class="btn btn-primary" style="margin-top: 8px;">Crear el primero</a>
  </div>
{:else}
  {#each groups as g (g.id ?? "none")}
    <section class="group">
      <header class="group-header">
        <h2 class="group-title">{g.name}</h2>
        <span class="group-count">{g.scripts.length} script{g.scripts.length !== 1 ? "s" : ""}</span>
        <div class="group-spacer"></div>
        {#if g.id}
          <a href={`/scripts/editor?project=${g.id}`} class="btn btn-ghost btn-sm">
            <Icon name="plus" size={11} stroke_width={2.5} />Script
          </a>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => open_rename_project(g)} title="Renombrar proyecto">Renombrar</button>
          <button type="button" class="btn btn-danger-ghost btn-sm" onclick={() => open_delete_project(g)} aria-label={`Eliminar proyecto ${g.name}`} title="Eliminar proyecto">
            <Icon name="trash" size={12} />
          </button>
        {/if}
      </header>

      {#if g.scripts.length === 0}
        <p class="group-empty">Este proyecto todavía no tiene scripts.</p>
      {:else}
        <div class="scripts-grid">
          {#each g.scripts as s (s.id)}
            <div class="script-card-wrapper">
              <a href={`/scripts/editor?id=${s.id}`} class="script-card">
                <h3 class="script-name">{s.name}</h3>
                <div class="script-meta">
                  <span class="meta-item">
                    <Icon name="user" size={12} />
                    {s.character_count} personaje{s.character_count !== 1 ? "s" : ""}
                  </span>
                  <span class="meta-item">
                    <Icon name="lines" size={12} />
                    {s.line_count} línea{s.line_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div class="en-status" class:en-done={s.line_count > 0 && s.translated_count >= s.line_count}>
                  EN {s.translated_count ?? 0}/{s.line_count}
                </div>
                <div class="script-footer">
                  <span class="script-date">{format_date(s.updated_at)}</span>
                  <span class="script-cta">Editar →</span>
                </div>
              </a>
              <button class="script-delete-btn btn btn-danger-ghost"
                onclick={(e) => { e.preventDefault(); open_delete(s.id, s.name); }}
                aria-label={`Eliminar ${s.name}`} title={`Eliminar ${s.name}`}>
                <Icon name="trash" size={12} />
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/each}
{/if}

<dialog bind:this={delete_dialog} onclick={handle_backdrop}>
  <h2 class="dialog-title">Eliminar "{pending_name}"</h2>
  <p class="dialog-body">Se eliminarán todos los personajes y líneas, en español y en inglés. Esta acción no se puede deshacer.</p>
  <div class="dialog-actions">
    <button onclick={cancel_delete} class="btn btn-ghost">Cancelar</button>
    <button onclick={confirm_delete} class="btn btn-danger">Eliminar</button>
  </div>
</dialog>

<dialog bind:this={project_dialog} onclick={(e) => e.target === project_dialog && project_dialog.close()}>
  <h2 class="dialog-title">{project_mode === "create" ? "Nuevo proyecto" : "Renombrar proyecto"}</h2>
  <input class="dialog-input" type="text" placeholder="Nombre del proyecto" maxlength="120"
    bind:value={project_name} autocomplete="off"
    onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit_project(); } }} />
  {#if project_error}<p class="dialog-error">{project_error}</p>{/if}
  <div class="dialog-actions">
    <button type="button" class="btn btn-ghost" onclick={() => project_dialog?.close()}>Cancelar</button>
    <button type="button" class="btn btn-primary" onclick={submit_project} disabled={!project_name.trim() || project_busy}>
      {project_mode === "create" ? "Crear" : "Guardar"}
    </button>
  </div>
</dialog>

<dialog bind:this={pdelete_dialog} onclick={(e) => e.target === pdelete_dialog && pdelete_dialog.close()}>
  <h2 class="dialog-title">Eliminar proyecto "{pdelete_target?.name ?? ""}"</h2>
  <p class="dialog-body">Los scripts de este proyecto no se eliminan: pasan a "Sin proyecto".</p>
  <div class="dialog-actions">
    <button onclick={() => pdelete_dialog?.close()} class="btn btn-ghost">Cancelar</button>
    <button onclick={confirm_delete_project} class="btn btn-danger">Eliminar proyecto</button>
  </div>
</dialog>

<style>
  .list-toolbar { display: flex; justify-content: flex-end; margin-bottom: 8px; }
  .btn-sm { font-size: 10px; padding: 5px 10px; }

  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 24px; gap: 8px; text-align: center; }
  .empty-icon { color: var(--text-muted); margin-bottom: 8px; opacity: 0.5; }
  .empty-title { font-size: 15px; font-weight: 500; color: var(--text-secondary); }
  .empty-sub { font-size: 13px; color: var(--text-muted); }

  .group { margin-bottom: 32px; }
  .group-header { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; margin-bottom: 12px; border-bottom: 1px solid var(--border); }
  .group-title { font-family: var(--font-mono); font-size: 13px; font-weight: 700; letter-spacing: 0.04em; color: var(--text-primary); }
  .group-count { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
  .group-spacer { flex: 1; }
  .group-empty { font-size: 12px; color: var(--text-muted); padding: 4px 0 8px; }

  .scripts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .script-card-wrapper { position: relative; }
  .script-delete-btn { position: absolute; top: 10px; right: 10px; opacity: 0; padding: 5px 7px; transition: opacity var(--transition), color var(--transition), border-color var(--transition), background var(--transition); z-index: 1; }
  .script-card-wrapper:hover .script-delete-btn { opacity: 1; }

  .script-name { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color var(--transition); padding-right: 28px; }
  .script-card-wrapper:hover .script-name { color: var(--accent-text); }

  .script-meta { display: flex; gap: 14px; margin-bottom: 8px; }
  .meta-item { display: flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
  .en-status { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); margin-bottom: 12px; }
  .en-done { color: var(--success-text); }

  .script-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--border); }
  .script-date { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
  .script-cta { font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--accent-text); opacity: 0; transition: opacity var(--transition); }
  .script-card-wrapper:hover .script-cta { opacity: 1; }

  .dialog-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
  .dialog-body { font-size: 13px; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.5; }
  .dialog-input { width: 100%; font-family: var(--font-mono); font-size: 13px; background: var(--bg-subtle); color: var(--text-primary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 9px 12px; outline: none; margin-bottom: 8px; }
  .dialog-input:focus { border-color: var(--accent); }
  .dialog-error { font-size: 12px; color: var(--error-text); margin-bottom: 8px; }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .btn-danger { background: var(--error-text); color: #fff; font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 7px 16px; border-radius: var(--radius-md); border: none; cursor: pointer; transition: opacity var(--transition); }
  .btn-danger:hover { opacity: 0.85; }
</style>
