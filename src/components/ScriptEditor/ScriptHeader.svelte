
<script>
  // ScriptHeader.svelte — título + acciones del editor
  import Icon from "@components/ui/Icon.svelte";
  import ProjectPicker from "./ProjectPicker.svelte";
  import ShortcutsHelp from "./ShortcutsHelp.svelte";

  let { store } = $props();

  const LANGS = [
    { id: "es", label: "Español" },
    { id: "en", label: "English" },
  ];
</script>

<div class="lang-tabs" role="tablist" aria-label="Idioma del script">
  {#each LANGS as l}
    <button
      type="button"
      role="tab"
      class="lang-tab"
      class:lang-tab-active={store.lang === l.id}
      aria-selected={store.lang === l.id}
      onclick={() => store.set_lang(l.id)}
    >
      {l.label}
      {#if l.id === "en" && store.translatable_count > 0}
        <span class="lang-count">{store.translated_count}/{store.translatable_count}</span>
      {/if}
    </button>
  {/each}
  <div class="tabs-spacer"></div>
  <div class="view-toggle" role="group" aria-label="Vista del script">
    <button type="button" class="view-opt" class:view-opt-active={store.view_mode === "normal"}
      aria-pressed={store.view_mode === "normal"} onclick={() => store.set_view_mode("normal")}
      title="Vista normal">
      <Icon name="lines" size={12} />Normal
    </button>
    <button type="button" class="view-opt" class:view-opt-active={store.view_mode === "json"}
      aria-pressed={store.view_mode === "json"} onclick={() => store.set_view_mode("json")}
      title="Ver y editar el script como JSON">
      <Icon name="braces" size={12} />JSON
    </button>
  </div>
  <ShortcutsHelp />
  <ProjectPicker {store} />
</div>

<div class="editor-header">
  <div class="title-block">
    <!-- En la vista JSON el título se muestra bloqueado con las mismas medidas
         que el input, para que el header no cambie de alto al alternar vistas;
         se edita desde el JSON ("name"). -->
    {#if store.lang === "es"}
      <label for="script-title" class="field-label">Título{#if store.view_mode === "json"}<span class="field-ref"> · se edita en el JSON</span>{/if}</label>
      <input id="script-title" type="text" class="title-input" class:title-locked={store.view_mode === "json"}
        placeholder="Sin título..." bind:value={store.script_title} autocomplete="off"
        readonly={store.view_mode === "json"} tabindex={store.view_mode === "json" ? -1 : 0} />
    {:else}
      <label for="script-title-en" class="field-label">Title <span class="field-ref">· {store.script_title || "sin título"}{store.view_mode === "json" ? " · edit it in the JSON" : ""}</span></label>
      <input id="script-title-en" type="text" class="title-input" class:title-locked={store.view_mode === "json"}
        placeholder="Title in English..." bind:value={store.script_title_en} autocomplete="off"
        readonly={store.view_mode === "json"} tabindex={store.view_mode === "json" ? -1 : 0} />
    {/if}
  </div>

  <div class="editor-actions">
    <button onclick={store.do_export_txt} class="btn btn-ghost btn-sm" title="Exportar como .txt">
      <Icon name="file-text" size={13} />{" "}TXT
    </button>
    <button onclick={store.do_export_json} class="btn btn-ghost btn-sm" title="Exportar como .json">
      <Icon name="file" size={13} />{" "}JSON
    </button>

    {#if store.select_mode}
      <button class="btn btn-ghost btn-sm" onclick={store.exit_select_mode} title="Cancelar selección (Esc)">
        <Icon name="x" size={11} stroke_width={2.5} />Cancelar
      </button>
      <button class="btn btn-sm delete-batch-btn" onclick={() => store.request_batch_delete()} disabled={store.selected.size === 0}>
        <Icon name="trash" size={11} stroke_width={2.5} />
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
          <Icon name="spinner" size={11} stroke_width={2.5} /><span>Guardando</span>
        </span>
        <span class="save-label save-label-icon" class:save-label-active={store.save_status === "success"}>
          <Icon name="check" size={11} stroke_width={2.5} /><span>Guardado</span>
        </span>
        <span class="save-label" class:save-label-active={store.save_status === "error"}>Error al guardar</span>
        <span class="save-label" class:save-label-active={store.save_status === "no_title"}>Falta el título</span>
        <span class="save-label" class:save-label-active={store.save_status === "no_lines"}>Script vacío</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .lang-tabs { display: flex; align-items: flex-end; gap: 4px; padding: 12px 24px 0; }
  .tabs-spacer { flex: 1; }
  .view-toggle { display: inline-flex; align-self: center; margin-bottom: 4px; margin-right: 6px; padding: 2px; gap: 2px; background: var(--bg-muted); border: 1px solid var(--border); border-radius: var(--radius-md); }
  .view-opt { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 10px; border: none; border-radius: calc(var(--radius-md) - 2px); background: transparent; color: var(--text-secondary); cursor: pointer; transition: background var(--transition), color var(--transition); }
  .view-opt:hover { color: var(--text-primary); }
  .view-opt-active { background: var(--surface); color: var(--accent-text); box-shadow: var(--shadow-sm); }
  .lang-tab { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 7px 14px; border: 1px solid transparent; border-bottom: none; border-radius: var(--radius-md) var(--radius-md) 0 0; background: transparent; color: var(--text-muted); cursor: pointer; transition: color var(--transition), background var(--transition), border-color var(--transition); }
  .lang-tab:hover { color: var(--text-primary); }
  .lang-tab-active { color: var(--accent-text); background: var(--accent-muted); border-color: var(--accent); }
  .lang-count { font-size: 9px; font-weight: 600; letter-spacing: 0.04em; opacity: 0.8; }
  .field-ref { text-transform: none; letter-spacing: 0; font-weight: 400; }

  .editor-header { display: flex; justify-content: space-between; align-items: flex-end; padding: 14px 24px 16px; gap: 16px; }
  .title-block { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
  .field-label { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
  .title-input { font-family: var(--font-mono); font-size: 22px; font-weight: 700; letter-spacing: -0.02em; background: transparent; border: none; border-bottom: 2px solid var(--accent); border-radius: 0; color: var(--text-primary); padding: 4px 0; outline: none; width: 100%; transition: border-color var(--transition); }
  .title-input::placeholder { color: var(--text-placeholder); font-weight: 400; }
  .title-input:focus { border-bottom-color: var(--accent-hover); }
  .title-locked { color: var(--text-muted); border-bottom-color: var(--border); cursor: default; }
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
</style>


