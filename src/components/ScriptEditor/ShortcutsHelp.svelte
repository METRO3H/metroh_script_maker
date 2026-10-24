<script>
  // ShortcutsHelp.svelte — botón discreto de ayuda + diálogo con los atajos.
  // También se abre con "?" cuando no se está escribiendo en un campo.
  import Icon from "@components/ui/Icon.svelte";

  let dialog_el = $state(null);

  // ⌘ en Mac, Ctrl en el resto.
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

  // Cada tecla va en su propio arreglo: se dibuja una por una.
  const SECTIONS = [
    {
      title: "Escribir",
      items: [
        { keys: ["Enter"], text: "Añadir la línea" },
        { keys: ["Shift", "Space"], text: "Ir al campo de escritura" },
        { keys: ["Shift", "←"], alt: ["Shift", "→"], text: "Personaje anterior / siguiente" },
        { keys: ["Alt", "Z"], text: "Cambiar el tipo (diálogo, pensamiento, narración, contexto)" },
        { keys: ["Shift", "Num +"], text: "Nuevo personaje" },
      ],
    },
    {
      title: "Sugerencias de palabras",
      items: [
        { keys: ["Tab"], text: "Aplicar la primera sugerencia; otra vez Tab pasa a la siguiente" },
        { keys: ["Shift", "Tab"], text: "Volver a la sugerencia anterior" },
      ],
    },
    {
      title: "Guion",
      items: [
        { keys: ["Shift", "Enter"], text: "Nueva escena al final" },
        { keys: ["Shift", "↑"], alt: ["Shift", "↓"], text: "Escena anterior / siguiente" },
        { keys: ["Alt", "↑"], alt: ["Alt", "↓"], text: "Mover la línea que se está editando" },
        { keys: [mod, "S"], text: "Guardar" },
        { keys: ["Esc"], text: "Cerrar menús o salir de la selección" },
        { keys: ["?"], text: "Mostrar esta ayuda" },
      ],
    },
  ];

  const MOUSE = [
    "Mantén presionado el nombre o el badge de una línea: selección múltiple.",
    "Arrastra el agarre ⋮⋮ de una línea: la cambia de lugar.",
    "Pasa el mouse entre dos líneas: + línea / + escena.",
  ];

  function open() { dialog_el?.showModal(); }

  function on_window_keydown(e) {
    if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const el = document.activeElement;
    const tag = el?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
    e.preventDefault();
    dialog_el?.open ? dialog_el.close() : open();
  }
</script>

<svelte:window onkeydown={on_window_keydown} />

<button type="button" class="help-btn" onclick={open} title="Atajos de teclado (?)" aria-label="Ver atajos de teclado">
  <Icon name="keyboard" size={14} />
</button>

<dialog bind:this={dialog_el} class="help-dialog" aria-labelledby="help-title"
  onclick={(e) => e.target === dialog_el && dialog_el.close()}>
  <div class="help-head">
    <h2 id="help-title" class="help-title">Atajos de teclado</h2>
    <button type="button" class="help-close" onclick={() => dialog_el.close()} aria-label="Cerrar">
      <Icon name="x" size={13} stroke_width={2.5} />
    </button>
  </div>

  {#each SECTIONS as section}
    <section class="help-section">
      <h3 class="help-section-title">{section.title}</h3>
      <ul class="help-list">
        {#each section.items as item}
          <li class="help-row">
            <span class="help-keys">
              {#each item.keys as k, i}{#if i > 0}<span class="plus">+</span>{/if}<kbd>{k}</kbd>{/each}
              {#if item.alt}
                <span class="slash">/</span>
                {#each item.alt as k, i}{#if i > 0}<span class="plus">+</span>{/if}<kbd>{k}</kbd>{/each}
              {/if}
            </span>
            <span class="help-text">{item.text}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  <section class="help-section">
    <h3 class="help-section-title">Mouse</h3>
    <ul class="help-mouse">
      {#each MOUSE as m}<li>{m}</li>{/each}
    </ul>
  </section>
  <p class="help-note">En la pestaña English solo funcionan Guardar, Esc y moverse entre escenas.</p>
</dialog>

<style>
  .help-btn { display: inline-flex; align-items: center; justify-content: center; align-self: center; width: 26px; height: 26px; margin: 0 6px 4px 0; padding: 0; border: none; border-radius: var(--radius-sm); background: transparent; color: var(--text-muted); cursor: pointer; transition: color var(--transition), background var(--transition); }
  .help-btn:hover { color: var(--text-primary); background: var(--bg-muted); }
  .help-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  .help-dialog { max-width: 500px; max-height: min(80vh, 640px); overflow-y: auto; padding: 18px 22px 16px; }
  .help-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .help-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-primary); }
  .help-close { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; border-radius: var(--radius-sm); background: transparent; color: var(--text-muted); cursor: pointer; }
  .help-close:hover { color: var(--text-primary); background: var(--bg-muted); }

  .help-section { margin-top: 14px; }
  .help-section-title { margin: 0 0 6px; font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
  .help-list, .help-mouse { margin: 0; padding: 0; list-style: none; }
  .help-row { display: flex; align-items: baseline; gap: 14px; padding: 4px 0; }
  .help-keys { display: inline-flex; align-items: center; gap: 3px; flex: 0 0 188px; flex-wrap: wrap; }
  .help-text { font-size: 12.5px; line-height: 1.4; color: var(--text-secondary); }
  kbd { font-family: var(--font-mono); font-size: 10.5px; line-height: 1; padding: 3px 6px; border: 1px solid var(--border-strong); border-bottom-width: 2px; border-radius: 4px; background: var(--bg-subtle); color: var(--text-primary); white-space: nowrap; }
  .plus, .slash { font-size: 10px; color: var(--text-muted); }
  .slash { margin: 0 3px; }
  .help-mouse li { font-size: 12.5px; line-height: 1.5; color: var(--text-secondary); padding: 2px 0; }
  .help-note { margin: 14px 0 0; font-size: 11.5px; color: var(--text-muted); }

  @media (max-width: 520px) {
    .help-row { flex-direction: column; gap: 3px; }
    .help-keys { flex-basis: auto; }
  }
</style>
