<script>
   // ScriptEditor.svelte
   import { tick } from "svelte";
   import CharacterMenu from "./CharacterMenu.svelte";
   let script_title = $state("");
   let full_script = $state([]);
   let current_input = $state("");
   let script_count = $state(0);
   let characters = $state([
      { name: "Juan", id: 1 },
      { name: "Maria", id: 2 },
      { name: "Pedro", id: 3 },
      { name: "Luis", id: 4 },
      { name: "Carlos", id: 5 },
   ]);
   let current_character = $state(0);

   function save_input() {
      const input = current_input.trim();
      if (input.length === 0) return;
      const new_line = {
         character_index: current_character,
         text: input,
      };
      console.log(new_line);
      full_script = [...full_script, new_line];
      script_count = full_script.length;
      current_input = "";
   }

   function handle_keydown(e) {
      console.log({
         key: e.key,
         code: e.code,
         shiftKey: e.shiftKey,
         location: e.location,
      });
      if (e.code === "Enter") {
         e.preventDefault();
         save_input();
      }
   }

   function update_input(new_script, i) {
      full_script = full_script.map((s, index) => (index === i ? new_script : s));
   }

   async function save_script() {
      // Armar el array de nombres únicos de personajes
      const character_names = characters.map((c) => c.name);

      // Armar las líneas con el nombre del personaje (no el índice)
      const lines = full_script.map((line, i) => ({
         character_name: characters[line.character_index].name,
         line_number: i + 1,
         content: line.text,
      }));

      const res = await fetch("/api/script/save", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
            script_name: script_title, // el valor de tu title-input
            characters: character_names,
            lines,
         }),
      });

      if (!res.ok) {
         console.error("Error al guardar:", await res.text());
         return;
      }

      const { script_id } = await res.json();
      console.log("Script guardado con ID:", script_id);
   }
   // Scroll to bottom every time a script is added
   $effect(() => {
      script_count;
      tick().then(() => {
         window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth",
         });
      });
   });
</script>

<div class="w-full flex justify-center">
   <div class="title-wrapper">
      <span class="title-label">título del script</span>
      <input type="text" class="title-input" placeholder="Escribe aquí..." bind:value={script_title} />
   </div>
</div>

{#if full_script.length > 0}
   {#each full_script as script, index}
      <div class="flex gap-2">
         <span class="flex justify-center items-center"> {characters[script.character_index].name} </span>

         <input
            name={`script${index}`}
            id={`script${index}`}
            class="p-4 rounded-xl bg-white text-black font-mono text-sm script-added flex-1"
            value={script.text}
            onblur={(e) => update_input(e.currentTarget.value, index)}
         />
      </div>
   {/each}
{/if}

<div class="mt-auto h-full flex flex-col gap-2">
   <CharacterMenu bind:characters bind:current_character />
   <input
      name="script"
      id="script"
      class="w-full p-4 rounded-xl bg-white text-black font-mono text-sm current-input"
      value={current_input}
      oninput={(e) => (current_input = e.currentTarget.value)}
      onkeydown={handle_keydown}
      placeholder="Escribe aquí... (RightShift + Enter para guardar)"
   />
</div>

<!-- al final del template, fuera de cualquier div -->
<button class="save-btn" onclick={save_script}> Guardar script </button>

<style>
   input {
      resize: none;
      overflow: hidden;
      background-color: #f0f0f0;
      outline: 1px solid transparent;
   }
   input:focus {
      outline-width: 2px;
   }
   .script-added {
      outline-color: green;
   }
   .current-input {
      outline-color: #1e3a5f;
   }

   .title-wrapper {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      max-width: 480px;
   }

   .title-label {
      font-family: monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #888;
   }

   .title-input {
      font-family: monospace;
      font-size: 1.4rem;
      font-weight: 600;
      padding: 10px 14px;
      border-radius: 12px;
      background-color: #f0f0f0;
      color: #111;
      border: none;
      outline: 2px solid #1e3a5f;
      width: 100%;
      transition: outline-color 0.15s ease;
   }

   .title-input::placeholder {
      color: #aaa;
      font-weight: 400;
   }

   .title-input:focus {
      outline-color: #1e3a5f;
      background-color: #e8e8e8;
   }

   .save-btn {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background-color: #1e3a5f;
      color: #f0f0f0;
      font-family: monospace;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      padding: 10px 20px;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      outline: 2px solid transparent;
      transition:
         background-color 0.15s ease,
         outline-color 0.15s ease;
      z-index: 50;
   }

   .save-btn:hover {
      background-color: #2a4f80;
   }

   .save-btn:focus {
      outline-color: #1e3a5f;
      outline-offset: 3px;
   }

   .save-btn:active {
      background-color: #162d4a;
   }
</style>
