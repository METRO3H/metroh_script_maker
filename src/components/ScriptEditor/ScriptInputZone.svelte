<!-- src/components/ScriptEditor/ScriptInputZone.svelte -->
<script>
   // ScriptInputZone.svelte — CharacterMenu + input de escritura
   import CharacterMenu from "./CharacterMenu.svelte";
   import { ghost_input } from "@lib/predictor/ghost_input.svelte";

   let { store, char_menu = $bindable(null) } = $props();

   // Único lugar del predictor que conoce el dominio: arma el prompt a
   // partir del guion. ghost_input no sabe nada de "escena", "línea" ni
   // "personaje" — solo recibe { system, prompt, stop? } o null.
   function build_prompt(value) {
      if (!value.trim()) return null;
      const last_lines = store.full_script
         .slice(-4)
         .map((l) =>
            l.is_scene
               ? `— Escena ${l.scene_number} —`
               : l.is_context
                 ? `[${l.text}]`
                 : `${store.characters[l.character_index]?.name}: ${l.text}`,
         )
         .join("\n");
      const character_name = store.characters[store.current_character]?.name ?? "Contexto";
      return {
         system:
            "/no_think\nEres un motor de autocompletado para guiones de visual novels en español. Tu única tarea es escribir las palabras que faltan para terminar la última línea, como si fueras la continuación natural de lo que la persona está tipeando. Reglas estrictas, sin excepciones: no repitas ni una palabra de lo que ya está escrito; no agregues nombres de personajes ni encabezados de escena; no uses comillas ni Markdown (nada de asteriscos, guiones bajos ni backticks); no agregues saltos de línea, la continuación es siempre una sola frase corta. Responde solo con la continuación, nada más.",
         prompt: `${last_lines}\n${character_name}: ${value}\n\nContinuá esa última línea exactamente donde queda cortada, sin repetirla.`,
      };
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
      onkeydown={(e) => {
         if (e.code === "Enter" || e.code === "NumpadEnter") {
            e.preventDefault();
            store.save_input();
         }
      }}
      use:ghost_input={{ build_prompt }}
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
