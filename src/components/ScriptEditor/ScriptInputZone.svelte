<script>
  // ScriptInputZone.svelte — CharacterMenu + input de escritura
  import CharacterMenu from "./CharacterMenu.svelte";

  let { store, char_menu = $bindable(null) } = $props();
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
    onkeydown={(e) => { if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); store.save_input(); } }}
    placeholder={store.current_character === -1
      ? "Describe la situación... (Enter para añadir)"
      : store.current_type === "thought"
        ? "✦ Pensamiento... (Enter para añadir)"
        : store.current_type === "narration"
          ? "◈ Narración... (Enter para añadir)"
          : "Escribe aquí... (Enter para añadir)"}
    autocomplete="off"
    spellcheck="true"
  />
</div>

<style>
  .input-zone { display: flex; flex-direction: column; gap: 8px; padding: 16px 24px 20px; }
  .current-input { width: 100%; background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 10px 14px; font-family: var(--font-mono); font-size: 13px; color: var(--text-primary); outline: none; transition: border-color var(--transition), background var(--transition), box-shadow var(--transition); }
  .current-input::placeholder { color: var(--text-placeholder); }
  .current-input:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-muted); }
</style>
