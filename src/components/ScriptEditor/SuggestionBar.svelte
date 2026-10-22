<script>
   // SuggestionBar.svelte — chips de sugerencias, estilo teclado de celular.
   // Es solo presentación: recibe las sugerencias ya calculadas y avisa cuál
   // se tocó. Usa pointerdown + preventDefault para que el input no pierda
   // el foco (en el celular, perderlo cerraría el teclado).

   let { suggestions = [], onpick } = $props();
</script>

<div class="suggestion-bar" role="listbox" aria-label="Sugerencias de palabras" class:is-empty={suggestions.length === 0}>
   {#each suggestions as s, i (s.word + s.kind)}
      <button
         type="button"
         class="chip"
         class:chip-fix={s.kind === "fix"}
         role="option"
         aria-selected="false"
         tabindex="-1"
         title={s.kind === "fix" ? "Corregir palabra" : "Completar palabra"}
         onpointerdown={(e) => {
            e.preventDefault();
            onpick?.(s.word);
         }}
      >
         {s.word}
         {#if i === 0}<kbd>Tab</kbd>{/if}
      </button>
   {/each}
</div>

<style>
   /* Altura fija: la barra no empuja el layout cuando aparece o desaparece. */
   .suggestion-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 30px;
      overflow-x: auto;
      scrollbar-width: none;
   }
   .suggestion-bar::-webkit-scrollbar {
      display: none;
   }
   .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1;
      padding: 6px 12px;
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
   kbd {
      font-family: var(--font-mono);
      font-size: 9px;
      color: var(--text-muted);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 4px;
   }
   /* En pantallas táctiles no hay Tab: se oculta la pista. */
   @media (pointer: coarse) {
      kbd {
         display: none;
      }
      .chip {
         padding: 8px 14px;
      }
   }
</style>
