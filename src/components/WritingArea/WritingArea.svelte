<script>
   let full_script = $state([]);
   let current_input = $state("");

   function save_input() {
      const input = current_input.trim();
      if (input.length === 0) return;

      full_script = [...full_script, input];
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
</script>

{#if full_script.length > 0}
   {#each full_script as script, index}
      <textarea
         name={`script${index}`}
         id={`script${index}`}
         class="w-full p-4 rounded-xl bg-white text-black font-mono text-sm"
         value={script}
         onblur={(e) => update_script(e.currentTarget.value, index)}
      ></textarea>
   {/each}
{/if}

<textarea
   name="script"
   id="script"
   class="w-full h-full p-4 rounded-xl bg-white text-black font-mono text-sm"
   value={current_input}
   oninput={(e) => (current_input = e.currentTarget.value)}
   onkeydown={handle_keydown}
   placeholder="Escribe aquí... (RightShift + Enter para guardar)"
></textarea>
