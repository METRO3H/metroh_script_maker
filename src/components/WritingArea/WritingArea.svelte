<script>
   import { tick } from "svelte";
   let full_script = $state([]);
   let current_input = $state("");
   let script_count = $state(0);

   function save_input() {
      const input = current_input.trim();
      if (input.length === 0) return;

      full_script = [...full_script, input];
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
      <input
         name={`script${index}`}
         id={`script${index}`}
         class="w-full p-4 rounded-xl bg-white text-black font-mono text-sm script-added"
         value={script}
         onblur={(e) => update_script(e.currentTarget.value, index)}
      />
   {/each}
{/if}

<input
   name="script"
   id="script"
   class="w-full h-full p-4 rounded-xl bg-white text-black font-mono text-sm flex-1"
   value={current_input}
   oninput={(e) => (current_input = e.currentTarget.value)}
   onkeydown={handle_keydown}
   placeholder="Escribe aquí... (RightShift + Enter para guardar)"
   
/>

<style>
   input {
      resize: none;
      overflow: hidden;
   }
   .script-added {
      outline: 2px solid #1e3a5f;
   }
</style>
