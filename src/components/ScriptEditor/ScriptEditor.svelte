<script>
   // ScriptEditor.svelte
   import { tick } from "svelte";
   import CharacterMenu from "./CharacterMenu.svelte";
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
      }
      console.log(new_line)
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
      if (e.code === "Enter" && e.shiftKey === true) {
         e.preventDefault();
         save_input();
      }
   }

   function update_script(new_script, i) {
      full_script = full_script.map((s, index) => (index === i ? new_script : s));
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

{#if full_script.length > 0}
   {#each full_script as script, index}
      <div class="flex gap-2">
         <span class="flex justify-center items-center"> {characters[script.character_index].name} </span>

         <input
            name={`script${index}`}
            id={`script${index}`}
            class="p-4 rounded-xl bg-white text-black font-mono text-sm script-added flex-1"
            value={script.text}
            onblur={(e) => update_script(e.currentTarget.value, index)}
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
</style>
