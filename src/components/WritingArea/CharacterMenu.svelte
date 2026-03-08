<script>
   // CharacterMenu.svelte
   let { characters = $bindable([]), current_character = $bindable() } = $props();

   let dialog = $state(null);
   let new_character = $state("");

   function open_dialog() {
      dialog?.showModal();
   }

   function close_dialog() {
      dialog?.close();
      new_character = "";
   }

   function add_character() {
      const name = new_character.trim();
      if (name.length === 0) return;

      characters = [...characters, { name, id: Date.now() }];
      close_dialog();
   }
</script>

<div class="flex w-full gap-4 pl-3">
   {#each characters as character, index}
      <button
         class="border border-blue-500 text-blue-500 rounded-md px-4 py-2 hover:bg-blue-700 hover:text-white transition-colors"
         class:bg-blue-700={current_character === index}
         class:text-white={current_character === index}
         onclick={() => (current_character = index)}
      >
         {character.name}
      </button>
   {/each}

   <button onclick={open_dialog} class="border border-green-500 text-green-500 transition-colors hover:bg-green-700 hover:text-white px-3 rounded-md" aria-label="Agregar nuevo personaje">
      <svg
         xmlns="http://www.w3.org/2000/svg"
         width="24"
         height="24"
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         stroke-linejoin="round"
         class="lucide lucide-plus-icon lucide-plus"><path d="M5 12h14" /><path d="M12 5v14" /></svg
      >
   </button>
</div>

<!-- Dialog nativo -->
<dialog bind:this={dialog} class="rounded-xl p-6 w-80 backdrop:bg-black/50 m-auto">
   <h2 class="text-lg font-bold mb-4">Nuevo personaje</h2>

   <input
      type="text"
      bind:value={new_character}
      placeholder="Nombre del personaje"
      class="w-full border-b border-slate-800 outline-none p-2 mb-6"
      onkeydown={(e) => e.key === "Enter" && add_character()}
   />

   <div class="flex justify-end gap-2">
      <button onclick={close_dialog} class="px-4 py-2 rounded-md border border-slate-300"> Cancelar </button>
      <button onclick={add_character} class="px-4 py-2 rounded-md bg-blue-700 text-white"> Agregar </button>
   </div>
</dialog>
