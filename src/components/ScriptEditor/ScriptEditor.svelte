<script>
   // ScriptEditor.svelte
   import { tick, untrack } from "svelte";
   import CharacterMenu from "./CharacterMenu.svelte";
   import ScriptOnboarding from "./ScriptOnboarding.svelte";

   let { initialScript = null } = $props();

   function init_state(script) {
      if (!script)
         return {
            id: null,
            title: "",
            characters: [],
            lines: [],
         };
      const chars = (script.characters ?? []).map((c, i) => ({ name: c.name, id: i + 1 }));
      const char_index = Object.fromEntries(chars.map((c, i) => [c.name, i]));
      const lines = (script.lines ?? []).map((l) => ({
         character_index: char_index[l.character_name] ?? 0,
         text: l.text,
      }));
      return { id: script.id, title: script.name, characters: chars, lines };
   }

   const init = untrack(() => init_state(initialScript));

   let script_id        = $state(init.id);
   let script_title     = $state(init.title);
   let characters       = $state(init.characters);
   let full_script      = $state(init.lines);
   let current_input    = $state("");
   let current_character = $state(0);

   // ✅ FIX 1 — script_count como estado derivado, no manual
   let script_count = $derived(full_script.length);

   // ✅ Onboarding solo para scripts nuevos
   let show_onboarding = $state(initialScript === null);

   function handle_onboarding_done({ title, characters: chars }) {
      script_title = title;
      characters = chars.map((name, i) => ({ name, id: i + 1 }));
      show_onboarding = false;
   }

   let save_status  = $state(null);
   let toast_timeout = null;

   let delete_dialog        = $state(null);
   let pending_delete_index = $state(null);
   let lines_area           = $state(null); // ref al contenedor scrollable

   // Eliminar personaje — manejado acá para poder operar sobre full_script
   // antes de que los índices se reordenen
   function handle_delete_character({ index, mode }) {
      if (mode === "remove_lines") {
         // 1. Borrar líneas del personaje eliminado
         full_script = full_script.filter((l) => l.character_index !== index);
      } else {
         // 1. Reasignar líneas a un nuevo personaje "Desconocido N"
         const unknown_count = characters.filter((c) => c.name.startsWith("Desconocido ")).length;
         const unknown_name  = `Desconocido ${unknown_count + 1}`;
         const unknown_id    = Date.now();
         // Insertar el Desconocido al final antes de reindexar
         const new_chars = [...characters, { name: unknown_name, id: unknown_id }];
         const unknown_index = new_chars.length - 1;
         full_script = full_script.map((l) =>
            l.character_index === index ? { ...l, character_index: unknown_index } : l
         );
         characters = new_chars;
      }

      // 2. Eliminar el personaje de la lista
      const next_chars = characters.filter((_, i) => i !== index);

      // 3. Reindexar las líneas que apuntaban a personajes posteriores al eliminado
      full_script = full_script.map((l) => ({
         ...l,
         character_index: l.character_index > index ? l.character_index - 1 : l.character_index,
      }));

      characters = next_chars;
      if (current_character >= next_chars.length) current_character = 0;
   }

   const CHAR_COLORS = ["var(--accent-text)", "var(--color-b)", "var(--color-c)", "var(--color-d)", "var(--color-e)"];

   function char_color(index) {
      return CHAR_COLORS[index % CHAR_COLORS.length];
   }

   function save_input() {
      const input = current_input.trim();
      if (!input) return;
      full_script = [...full_script, { character_index: current_character, text: input }];
      current_input = "";
   }

   function handle_keydown(e) {
      if (e.code === "Enter") {
         e.preventDefault();
         save_input();
      }
   }

   function update_input(new_text, i) {
      full_script = full_script.map((s, index) => (index === i ? { ...s, text: new_text } : s));
   }

   function confirm_delete(index) {
      pending_delete_index = index;
      delete_dialog?.showModal();
   }
   function cancel_delete() {
      pending_delete_index = null;
      delete_dialog?.close();
   }
   function execute_delete() {
      if (pending_delete_index === null) return;
      full_script = full_script.filter((_, i) => i !== pending_delete_index);
      pending_delete_index = null;
      delete_dialog?.close();
   }

   function show_toast(status) {
      save_status = status;
      clearTimeout(toast_timeout);
      toast_timeout = setTimeout(() => (save_status = null), 3000);
   }

   async function save_script() {
      if (!script_title.trim()) {
         show_toast("no_title");
         return;
      }
      if (full_script.length === 0) {
         show_toast("no_lines");
         return;
      }

      show_toast("saving");

      const res = await fetch("/api/script/save", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
            script_id,
            script_name: script_title,
            characters: characters.map((c) => c.name),
            lines: full_script.map((line, i) => ({
               character_name: characters[line.character_index].name,
               line_number: i + 1,
               content: line.text,
            })),
         }),
      });

      if (!res.ok) {
         show_toast("error");
         return;
      }
      const { script_id: returned_id } = await res.json();
      script_id = returned_id;
      show_toast("success");
   }

   function export_txt() {
      const header = `${script_title.toUpperCase()}\n${"─".repeat(48)}\n\n`;
      const content = full_script
         .map((l) => `${characters[l.character_index].name.toUpperCase()}\n   ${l.text}`)
         .join("\n\n");
      download_file(header + content, `${script_title || "script"}.txt`, "text/plain");
   }

   function export_json() {
      download_file(
         JSON.stringify(
            {
               id: script_id,
               name: script_title,
               characters: characters.map((c) => c.name),
               lines: full_script.map((l, i) => ({
                  line_number: i + 1,
                  character: characters[l.character_index].name,
                  content: l.text,
               })),
               exported_at: new Date().toISOString(),
            },
            null,
            2,
         ),
         `${script_title || "script"}.json`,
         "application/json",
      );
   }

   function download_file(content, filename, mime) {
      const a = Object.assign(document.createElement("a"), {
         href: URL.createObjectURL(new Blob([content], { type: mime })),
         download: filename,
      });
      a.click();
      URL.revokeObjectURL(a.href);
   }

   // Scroll al fondo del container interno solo al agregar líneas nuevas,
   // no al cargar el script inicial
   let is_mounted = $state(false);
   $effect(() => {
      // registrar dependencia en full_script.length
      const len = full_script.length;
      if (!is_mounted) return;
      tick().then(() => {
         if (lines_area) lines_area.scrollTo({ top: lines_area.scrollHeight, behavior: "smooth" });
      });
   });
   $effect(() => {
      // marcar como montado después del primer render
      is_mounted = true;
   });
</script>

{#if show_onboarding}
   <ScriptOnboarding ondone={handle_onboarding_done} />
{/if}

<!-- ══════════════════════════════════════════
     EDITOR
══════════════════════════════════════════ -->
<div class="editor">
   <!-- Cabecera: título + acciones -->
   <div class="editor-header">
      <div class="title-block">
         <label for="script-title" class="field-label">Título</label>
         <input
            id="script-title"
            type="text"
            class="title-input"
            placeholder="Sin título..."
            bind:value={script_title}
            autocomplete="off"
         />
      </div>

      <div class="editor-actions">
         <button onclick={export_txt} class="btn btn-ghost btn-sm" title="Exportar como .txt">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
               <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
               <polyline points="14 2 14 8 20 8" />
               <line x1="16" y1="13" x2="8" y2="13" />
               <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            TXT
         </button>
         <button onclick={export_json} class="btn btn-ghost btn-sm" title="Exportar como .json">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
               <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
               <polyline points="14 2 14 8 20 8" />
            </svg>
            JSON
         </button>
         <a href="/dashboard/scripts" class="btn btn-ghost btn-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
               <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
               <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Mis scripts
         </a>

         <!-- Separador visual -->
         <div class="actions-divider"></div>

         <button
            class="btn btn-sm save-btn"
            class:save-btn-idle={save_status === null}
            class:save-btn-saving={save_status === "saving"}
            class:save-btn-success={save_status === "success"}
            class:save-btn-error={save_status === "error" || save_status === "no_title" || save_status === "no_lines"}
            onclick={save_script}
            disabled={save_status === "saving"}
         >
            <!--
               Todos los estados están siempre en el DOM.
               El más ancho define el ancho del botón (visibility:hidden, aria-hidden).
               Solo el activo es visible (visibility:visible).
               Cero layout shift garantizado.
            -->

            <!-- Estado idle — el texto más largo define el ancho base -->
            <span class="save-label" class:save-label-active={save_status === null}>
               Guardar
            </span>

            <!-- Estado saving — ícono + texto mismo ancho que idle -->
            <span class="save-label save-label-icon" class:save-label-active={save_status === "saving"}>
               <svg class="spin" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
               </svg>
               <span>Guardando</span>
            </span>

            <!-- Estado success -->
            <span class="save-label save-label-icon" class:save-label-active={save_status === "success"}>
               <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
               </svg>
               <span>Guardado</span>
            </span>

            <!-- Estado error genérico -->
            <span class="save-label" class:save-label-active={save_status === "error"}>
               Error al guardar
            </span>

            <!-- Estado no_title -->
            <span class="save-label" class:save-label-active={save_status === "no_title"}>
               Falta el título
            </span>

            <!-- Estado no_lines -->
            <span class="save-label" class:save-label-active={save_status === "no_lines"}>
               Script vacío
            </span>
         </button>
      </div>
   </div>

   <div class="editor-divider"></div>

   <!-- Líneas del script -->
   <div class="lines-area" bind:this={lines_area}>
      {#if full_script.length === 0}
         <div class="empty-state">
            <p class="empty-title">El script está vacío</p>
            <p class="empty-sub">Selecciona un personaje y empieza a escribir abajo</p>
         </div>
      {/if}

      {#each full_script as line, index}
         <div class="script-line">
            <span class="line-character" style="color: {char_color(line.character_index)}">
               {characters[line.character_index]?.name ?? "?"}
            </span>
            <input
               name={`script${index}`}
               id={`script${index}`}
               class="line-input"
               value={line.text}
               onblur={(e) => update_input(e.currentTarget.value, index)}
               autocomplete="off"
               spellcheck="true"
            />
            <button class="line-delete" onclick={() => confirm_delete(index)} aria-label="Eliminar línea" tabindex="-1">
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
               </svg>
            </button>
         </div>
      {/each}
   </div>

   <div class="editor-divider"></div>

   <!-- Zona de input + personajes -->
   <div class="input-zone">
      <CharacterMenu bind:characters bind:current_character ondelete_character={handle_delete_character} />

      <input
         id="script-input"
         class="current-input"
         value={current_input}
         oninput={(e) => (current_input = e.currentTarget.value)}
         onkeydown={handle_keydown}
         placeholder="Escribe aquí... (Enter para añadir)"
         autocomplete="off"
         spellcheck="true"
      />
   </div>
</div>


<!-- ── Dialog de confirmación de borrado de línea ── -->
<dialog bind:this={delete_dialog}>
   <h2 class="dialog-title">¿Eliminar esta línea?</h2>
   <p class="dialog-body">Esta acción no se puede deshacer.</p>
   <div class="dialog-actions">
      <button onclick={cancel_delete} class="btn btn-ghost">Cancelar</button>
      <button onclick={execute_delete} class="btn btn-danger">Eliminar</button>
   </div>
</dialog>

<style>
   :global(:root) {
      --color-b: #0891b2;
      --color-c: #059669;
      --color-d: #d97706;
      --color-e: #db2777;
   }
   :global([data-theme="dark"]) {
      --color-b: #22d3ee;
      --color-c: #34d399;
      --color-d: #fbbf24;
      --color-e: #f472b6;
   }

   .editor {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
   }

   /* ── Cabecera ── */
   .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 20px 24px 16px;
      gap: 16px;
   }

   .title-block {
      display: flex;
      flex-direction: column;
      gap: 5px;
      flex: 1;
      min-width: 0;
   }

   .field-label {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted);
   }

   .title-input {
      font-family: var(--font-mono);
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: transparent;
      border: none;
      border-bottom: 2px solid var(--accent);
      border-radius: 0;
      color: var(--text-primary);
      padding: 4px 0;
      outline: none;
      width: 100%;
      transition: border-color var(--transition);
   }
   .title-input::placeholder {
      color: var(--text-placeholder);
      font-weight: 400;
   }
   .title-input:focus {
      border-bottom-color: var(--accent-hover);
   }

   .editor-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
   }

   .btn-sm {
      font-size: 10px;
      padding: 5px 10px;
      gap: 5px;
   }

   .editor-divider {
      height: 1px;
      background: var(--border);
   }

   /* ── Líneas ── */
   .lines-area {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      padding: 12px 24px;
      gap: 4px;
   }

   .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 0;
      gap: 6px;
   }
   .empty-title {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
   }
   .empty-sub {
      font-size: 12px;
      color: var(--text-muted);
      opacity: 0.6;
   }

   .script-line {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 3px 0;
      border-radius: var(--radius-sm);
   }

   .line-character {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      min-width: 72px;
      text-align: right;
      flex-shrink: 0;
   }

   .line-input {
      flex: 1;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      padding: 7px 10px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-primary);
      outline: none;
      transition: background var(--transition), border-color var(--transition);
   }
   .line-input:hover {
      background: var(--bg-subtle);
      border-color: var(--border);
   }
   .line-input:focus {
      background: var(--surface);
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-muted);
   }

   .line-delete {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      opacity: 0;
      transition: opacity var(--transition), background var(--transition), color var(--transition);
      flex-shrink: 0;
   }
   .script-line:hover .line-delete { opacity: 1; }
   .line-delete:hover {
      background: var(--error-bg);
      color: var(--error-text);
   }

   /* ── Input zone ── */
   .input-zone {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px 24px 20px;
   }

   .current-input {
      width: 100%;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-primary);
      outline: none;
      transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
   }
   .current-input::placeholder { color: var(--text-placeholder); }
   .current-input:focus {
      border-color: var(--accent);
      background: var(--surface);
      box-shadow: 0 0 0 3px var(--accent-muted);
   }

   .actions-divider {
      width: 1px;
      height: 20px;
      background: var(--border);
      margin: 0 2px;
   }

   .save-btn {
      font-size: 10px;
      padding: 5px 14px;
      position: relative;
      justify-content: center;
      transition: background var(--transition), color var(--transition),
                  border-color var(--transition), box-shadow var(--transition);
   }

   /* Todos los labels apilados en position:absolute, invisibles por defecto.
      El DOM los contiene siempre → el botón toma el ancho del más ancho. */
   .save-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      visibility: hidden;
      aria-hidden: true;
   }
   .save-label-icon {
      gap: 5px;
   }
   .save-label-active {
      visibility: visible;
   }

   /* Spacer invisible para que el botón tenga el ancho correcto.
      Es el texto más largo de todos los estados posibles. */
   .save-btn::before {
      content: "Error al guardar";
      display: block;
      visibility: hidden;
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
      pointer-events: none;
   }
   .save-btn-idle {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
   }
   .save-btn-idle:hover {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
      box-shadow: 0 0 0 3px var(--accent-muted);
   }
   .save-btn-saving {
      background: var(--bg-muted);
      color: var(--text-secondary);
      border-color: var(--border);
      cursor: not-allowed;
   }
   .save-btn-success {
      background: var(--success-bg);
      color: var(--success-text);
      border-color: var(--success-border);
   }
   .save-btn-error {
      background: var(--error-bg);
      color: var(--error-text);
      border-color: var(--error-border);
   }
   @keyframes spin {
      to { transform: rotate(360deg); }
   }
   .spin {
      animation: spin 0.8s linear infinite;
   }

   /* ── Dialog ── */
   .dialog-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
   }
   .dialog-body {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 24px;
      line-height: 1.5;
   }
   .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
   }

   .btn-danger {
      background: var(--error-text);
      color: #fff;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 7px 16px;
      border-radius: var(--radius-md);
      border: none;
      cursor: pointer;
      transition: opacity var(--transition);
   }
   .btn-danger:hover { opacity: 0.85; }
</style>