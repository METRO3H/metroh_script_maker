<script>
  // ScriptJsonView.svelte — el script como JSON editable, un idioma a la vez.
  // Español: estructura + texto en español. English: solo el texto en inglés
  // (sin repetir el español). Lo válido se aplica al instante; si no, se
  // conserva la última versión válida y el error sale como toast.
  import { untrack, onDestroy } from "svelte";
  import Icon from "@components/ui/Icon.svelte";
  import { build_script_json, parse_script_json } from "@lib/script.utils";
  import { show_toast, dismiss_toast_key } from "@lib/toast.svelte";

  // ── Colores ──────────────────────────────────────────────────
  // El textarea (texto transparente, es el que se edita y copia) va encima de
  // un <pre> con el mismo texto coloreado. El texto real nunca lleva HTML.
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const TOKEN = /("(?:\\.|[^"\\\n])*"?)(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g;

  function highlight(src) {
    let out = "";
    let last = 0;
    for (const m of src.matchAll(TOKEN)) {
      out += esc(src.slice(last, m.index));
      const [tok, str, colon] = m;
      if (str !== undefined) out += `<span class="${colon ? "t-key" : "t-str"}">${esc(str)}</span>${colon ? `<span class="t-punct">${esc(colon)}</span>` : ""}`;
      else if (/^[-\d]/.test(tok)) out += `<span class="t-num">${esc(tok)}</span>`;
      else if (/^[tfn]/.test(tok)) out += `<span class="t-lit">${esc(tok)}</span>`;
      else out += `<span class="t-punct">${esc(tok)}</span>`;
      last = m.index + tok.length;
    }
    // El \n final extra evita que el <pre> quede una línea más corto que el
    // textarea cuando el texto termina en salto de línea.
    return out + esc(src.slice(last)) + "\n";
  }

  let { store } = $props();

  // El padre vuelve a montar esta vista al cambiar de idioma ({#key}), así que
  // todo esto se fija al montar.
  const lang = untrack(() => store.lang);
  const ctx = untrack(() => ({
    lang,
    // Copia del script al abrir: sus traducciones (y, en inglés, la
    // estructura) son la referencia contra la que se aplican las ediciones.
    base_lines: $state.snapshot(store.full_script),
    base_names: store.characters.map((c) => c.name),
  }));

  const serialize = () =>
    JSON.stringify(
      build_script_json(store.full_script, store.characters, store.script_title, store.script_title_en, lang),
      null,
      2,
    );

  let text = $state(untrack(serialize));
  let invalid = $state(false);
  let textarea_el = $state(null);
  let highlighted = $derived(highlight(text));

  // Feedback de "se presionó": el botón confirma con su propio estado un instante.
  let copied = $state(false);
  let formatted = $state(false);
  let copied_timer = null;
  let formatted_timer = null;
  function pulse(set, timer_name) {
    set(true);
    clearTimeout(timer_name === "copy" ? copied_timer : formatted_timer);
    const t = setTimeout(() => set(false), 1300);
    if (timer_name === "copy") copied_timer = t; else formatted_timer = t;
  }
  let apply_timer = null;

  function apply_now() {
    clearTimeout(apply_timer);
    apply_timer = null;
    const res = parse_script_json(text, ctx);
    if (res.ok) {
      invalid = false;
      dismiss_toast_key("json-error");
      store.apply_json(res.data);
    } else {
      invalid = true;
      // duration 0: queda visible hasta que el JSON vuelva a ser válido.
      show_toast(`${res.error} · Se conserva la última versión válida`, "error", { key: "json-error", duration: 0 });
    }
  }

  // Aplica lo pendiente (guardar, volver a la vista normal, cambiar de idioma).
  function flush() { if (apply_timer !== null) apply_now(); }

  function on_input(e) {
    text = e.currentTarget.value;
    clearTimeout(apply_timer);
    apply_timer = setTimeout(apply_now, 300);
  }

  $effect(() => {
    store.set_json_flush_handler(flush);
    return () => { store.set_json_flush_handler(null); };
  });

  onDestroy(() => {
    flush();
    dismiss_toast_key("json-error");
    if (invalid) show_toast("Se descartaron los cambios del JSON porque no eran válidos", "error");
  });

  if (lang === "en") {
    show_toast("Aquí solo se edita el texto en inglés. Escenas, personajes y tipos se cambian en Español.", "neutral", { key: "json-en-info", duration: 4500 });
  }

  async function copy_all() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Contextos sin Clipboard API (http, permisos): selecciona y copia.
      textarea_el?.select();
      document.execCommand("copy");
    }
    pulse((v) => (copied = v), "copy");
    show_toast("JSON copiado al portapapeles", "success", { key: "json-copy", duration: 1800 });
  }

  function format_json() {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
      apply_now();
      pulse((v) => (formatted = v), "format");
      show_toast("JSON formateado", "neutral", { key: "json-format", duration: 1500 });
    } catch {
      show_toast("No se puede formatear: el JSON tiene errores de sintaxis", "error", { key: "json-format" });
    }
  }
</script>

<div class="json-view" class:json-view-invalid={invalid}>
  <!-- Clic en el espacio vacío bajo el texto = enfocar el editor. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="json-scroll" onclick={(e) => e.target === e.currentTarget && textarea_el?.focus()}>
    <!-- Mismas medidas en ambas capas (ver .json-layer): el <pre> define el
         alto y el textarea se estira encima, así no hay scroll interno ni
         scroll horizontal: las líneas largas se parten al llegar al borde. -->
    <div class="json-stack">
      <pre class="json-layer json-pre" aria-hidden="true">{@html highlighted}</pre>
      <textarea
        bind:this={textarea_el}
        class="json-layer json-textarea"
        value={text}
        oninput={on_input}
        wrap="soft"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        aria-label={lang === "en" ? "Script en inglés en formato JSON" : "Script en español en formato JSON"}
        aria-invalid={invalid}
      ></textarea>
    </div>
  </div>

  <!-- Flotan sobre el texto (position: absolute): no ocupan una fila ni
       empujan el layout al entrar o salir de la vista JSON. -->
  <div class="json-actions">
    <button type="button" class="json-action" class:json-action-done={formatted} onclick={format_json} title="Dar formato al JSON">
      {#if formatted}<Icon name="check" size={11} stroke_width={2.5} />Formateado{:else}Formatear{/if}
    </button>
    <button type="button" class="json-action" class:json-action-done={copied} onclick={copy_all} title="Copiar todo el JSON (texto plano)">
      {#if copied}<Icon name="check" size={11} stroke_width={2.5} />Copiado{:else}<Icon name="copy" size={11} />Copiar todo{/if}
    </button>
  </div>
</div>

<style>
  .json-view { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--bg-subtle); transition: background var(--transition); }
  .json-view:focus-within { background: var(--surface); }
  /* Borde interior (no cambia el tamaño): marca el JSON inválido. */
  .json-view-invalid::after { content: ""; position: absolute; inset: 0; box-shadow: inset 0 0 0 1px var(--error-border); pointer-events: none; }

  .json-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
  .json-stack { display: grid; min-height: 100%; }

  /* Las dos capas deben medir y partir el texto exactamente igual. */
  .json-layer {
    grid-area: 1 / 1;
    box-sizing: border-box;
    margin: 0; padding: 16px 24px; border: 0;
    font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6; letter-spacing: normal;
    tab-size: 2;
    white-space: pre-wrap; overflow-wrap: anywhere; word-break: normal;
    min-width: 0;
  }
  .json-pre { pointer-events: none; color: var(--text-primary); }
  .json-textarea {
    resize: none; overflow: hidden; outline: none; width: 100%; height: 100%; align-self: stretch;
    background: transparent;
    color: transparent; -webkit-text-fill-color: transparent;
    caret-color: var(--text-primary);
  }
  .json-textarea::selection { background: color-mix(in srgb, var(--accent) 32%, transparent); color: transparent; -webkit-text-fill-color: transparent; }

  /* Colores del JSON (heredan el tema claro/oscuro de la página) */
  .json-pre :global(.t-key)   { color: var(--accent-text); }
  .json-pre :global(.t-str)   { color: var(--success-text); }
  .json-pre :global(.t-num)   { color: var(--type-thought); }
  .json-pre :global(.t-lit)   { color: var(--type-narration); font-weight: 600; }
  .json-pre :global(.t-punct) { color: var(--text-secondary); }

  .json-actions { position: absolute; top: 10px; right: 22px; display: flex; gap: 4px; opacity: 0.6; transition: opacity var(--transition); }
  .json-view:hover .json-actions, .json-actions:focus-within { opacity: 1; }
  .json-action {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    min-width: 88px;
    font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
    padding: 4px 9px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); color: var(--text-muted); cursor: pointer;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: blur(6px);
    transition: color var(--transition), border-color var(--transition), background var(--transition), transform 80ms ease;
  }
  .json-action:hover { color: var(--text-primary); border-color: var(--border-strong); background: var(--surface); }
  /* Presionado: se hunde y toma el color de acento, distinto del hover. */
  .json-action:active { transform: scale(0.94); color: var(--accent-text); border-color: var(--accent); background: var(--accent-muted); }
  .json-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  /* Confirmación tras la acción */
  .json-action-done, .json-action-done:hover { color: var(--success-text); border-color: var(--success-border); background: var(--success-bg); }
</style>
