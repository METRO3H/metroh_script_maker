<script>
   // SuggestionBar.svelte — chips de sugerencias, estilo teclado de celular.
   // Es solo presentación: recibe las sugerencias ya calculadas y avisa cuál
   // se tocó. Usa pointerdown + preventDefault para que el input no pierda
   // el foco (en el celular, perderlo cerraría el teclado).
   //
   // `active` es la sugerencia aplicada por Tab (-1 si ninguna). El "Tab" de la
   // pista aparece en la que se aplicaría con el próximo Tab.

   let { suggestions = [], active = -1, onpick } = $props();

   let chips = $state([]);
   const next = $derived(suggestions.length === 0 ? -1 : (active + 1) % suggestions.length);
   // Con una sola sugerencia ya aplicada no hay a dónde pasar.
   const show_hint = (i) => i === next && !(suggestions.length === 1 && active === 0);

   // En pantallas angostas la fila se desplaza: mantener a la vista la activa.
   $effect(() => {
      if (active >= 0) chips[active]?.scrollIntoView({ block: "nearest", inline: "nearest" });
   });
</script>

<div class="suggestion-bar" role="listbox" aria-label="Sugerencias de palabras" class:is-empty={suggestions.length === 0}>
   {#each suggestions as s, i (s.word + s.kind)}
      <button
         bind:this={chips[i]}
         type="button"
         class="chip"
         class:chip-fix={s.kind === "fix"}
         class:chip-active={i === active}
         role="option"
         aria-selected={i === active}
         tabindex="-1"
         title={s.kind === "fix" ? "Corregir palabra" : "Completar palabra"}
         onpointerdown={(e) => {
            e.preventDefault();
            onpick?.(s.word);
         }}
      >
         {s.word}
         {#if show_hint(i)}<kbd>Tab</kbd>{/if}
      </button>
   {/each}
</div>

<style>
   /* Altura fija y baja: la barra no empuja el layout cuando aparece o desaparece. */
   .suggestion-bar {
      display: flex;
      align-items: center;
      gap: 5px;
      height: 22px;
      overflow-x: auto;
      scrollbar-width: none;
   }
   .suggestion-bar::-webkit-scrollbar {
      display: none;
   }
   .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1;
      height: 20px;
      padding: 0 9px;
      border-radius: 99px;
      border: 1px solid var(--border);
      background: var(--bg-subtle);
      color: var(--text-primary);
      cursor: pointer;
      transition:
         border-color var(--transition),
         background var(--transition);
   }
   .chip:hover {
      border-color: var(--accent);
      background: var(--accent-muted);
   }
   .chip-fix {
      border-style: dashed;
      color: var(--accent-text);
   }
   /* La que se aplicó con Tab */
   .chip-active,
   .chip-active:hover {
      border-style: solid;
      border-color: var(--accent);
      background: var(--accent-muted);
      color: var(--accent-text);
      font-weight: 600;
   }
   kbd {
      font-family: var(--font-mono);
      font-size: 8px;
      color: var(--text-muted);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 1px 3px;
   }
   /* En pantallas táctiles no hay Tab: se oculta la pista y el chip es más grande para el dedo. */
   @media (pointer: coarse) {
      kbd {
         display: none;
      }
      .suggestion-bar {
         height: 30px;
      }
      .chip {
         height: 28px;
         padding: 0 12px;
      }
   }
</style>
