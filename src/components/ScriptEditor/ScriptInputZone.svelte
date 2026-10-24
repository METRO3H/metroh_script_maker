
<!-- src/components/ScriptEditor/ScriptInputZone.svelte -->
<script>
   // ScriptInputZone.svelte — CharacterMenu + input de escritura (español)
   // En la pestaña English no se agregan líneas: la estructura del guion es
   // una sola y se escribe en español. Ahí la zona muestra el progreso de la
   // traducción y un atajo a la primera línea sin traducir.
   import CharacterMenu from "./CharacterMenu.svelte";
   import SuggestionBar from "./SuggestionBar.svelte";

   let { store, char_menu = $bindable(null) } = $props();

   function on_keydown(e) {
      if (e.code === "Enter" || e.code === "NumpadEnter") {
         e.preventDefault();
         store.save_input();
         return;
      }
      // Tab aplica la primera sugerencia y, apretado de nuevo, pasa a la
      // siguiente (Shift+Tab, a la anterior). Sin sugerencias, Tab sigue
      // moviendo el foco como siempre.
      if (e.code === "Tab" && !e.isComposing && store.suggestions.length > 0) {
         if (store.cycle_suggestion(e.shiftKey ? -1 : 1)) e.preventDefault();
      }
   }
</script>

{#if store.lang === "es"}
   <div class="input-zone">
      <CharacterMenu
         bind:ref={char_menu}
         bind:characters={store.characters}
         bind:current_character={store.current_character}
         bind:current_type={store.current_type}
         ondelete_character={store.handle_delete_character}
      />
      <input
         id="script-input"
         class="current-input"
         value={store.current_input}
         oninput={(e) => (store.current_input = e.target.value)}
         onkeydown={on_keydown}
         placeholder={store.current_character === -1
            ? "Describe la situación... (Enter para añadir)"
            : store.current_type === "thought"
              ? "✦ Pensamiento... (Enter para añadir)"
              : store.current_type === "narration"
                ? "◈ Narración... (Enter para añadir)"
                : "Escribe aquí... (Enter para añadir)"}
         autocomplete="off"
         autocapitalize="sentences"
         spellcheck="true"
         enterkeyhint="send"
      />
      <!-- Debajo del input, como en el teclado del celular. Altura fija: no mueve el layout. -->
      <SuggestionBar suggestions={store.suggestions} active={store.active_suggestion} onpick={store.apply_suggestion} />
   </div>
{:else}
   <div class="input-zone en-zone">
      <p class="en-hint">
         Las líneas, escenas y personajes se editan en <strong>Español</strong>. Acá solo va la traducción de cada línea.
      </p>
      <div class="en-row">
         <span class="en-progress">
            {store.translated_count} / {store.translatable_count} traducidas
         </span>
         <button
            type="button"
            class="btn btn-ghost btn-sm"
            onclick={store.focus_first_untranslated}
            disabled={store.translated_count >= store.translatable_count}
         >
            Ir a la primera sin traducir
         </button>
      </div>
   </div>
{/if}

<style>
   .input-zone {
      display: flex;
      flex-direction: column;
      gap: 6px;
      /* Compacto: el footer ocupa lo mínimo y deja más espacio al guion. */
      padding: 8px 16px calc(8px + env(safe-area-inset-bottom, 0px));
   }
   .current-input {
      width: 100%;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 7px 12px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-primary);
      outline: none;
      transition:
         border-color var(--transition),
         background var(--transition),
         box-shadow var(--transition);
   }
   .current-input::placeholder {
      color: var(--text-placeholder);
   }
   .current-input:focus {
      border-color: var(--accent);
      background: var(--surface);
      box-shadow: 0 0 0 3px var(--accent-muted);
   }

   .en-zone {
      gap: 10px;
   }
   .en-hint {
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-secondary);
   }
   .en-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
   }
   .en-progress {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
   }
   .btn-sm {
      font-size: 10px;
      padding: 5px 10px;
   }
   .btn-sm:disabled {
      opacity: 0.5;
      cursor: not-allowed;
   }
</style>


