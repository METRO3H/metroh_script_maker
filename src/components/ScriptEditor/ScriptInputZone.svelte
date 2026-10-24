
<!-- src/components/ScriptEditor/ScriptInputZone.svelte -->
<script>
   // ScriptInputZone.svelte — CharacterMenu + input de escritura.
   // Es la misma en Español y en English: lo que se escribe queda como el texto
   // de esa pestaña (la otra versión de la línea queda vacía hasta que se escriba
   // en su pestaña). Escenas, personajes y tipos son compartidos.
   import CharacterMenu from "./CharacterMenu.svelte";
   import SuggestionBar from "./SuggestionBar.svelte";

   let { store, char_menu = $bindable(null) } = $props();

   const en = $derived(store.lang === "en");

   const placeholder = $derived(
      store.current_character === -1
         ? en ? "Describe the situation... (Enter to add)" : "Describe la situación... (Enter para añadir)"
         : store.current_type === "thought"
           ? en ? "✦ Thought... (Enter to add)" : "✦ Pensamiento... (Enter para añadir)"
           : store.current_type === "narration"
             ? en ? "◈ Narration... (Enter to add)" : "◈ Narración... (Enter para añadir)"
             : en ? "Write here... (Enter to add)" : "Escribe aquí... (Enter para añadir)",
   );

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
      {placeholder}
      autocomplete="off"
      autocapitalize="sentences"
      spellcheck="true"
      lang={store.lang}
      enterkeyhint="send"
   />
   <!-- Debajo del input, como en el teclado del celular. Altura fija: no mueve el layout. -->
   <SuggestionBar suggestions={store.suggestions} active={store.active_suggestion} onpick={store.apply_suggestion} />
</div>

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
</style>


