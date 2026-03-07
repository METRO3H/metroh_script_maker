<script>
    // CharacterMenu.svelte
    let characters = $state([
        { name: "Juan", id: 1 },
        { name: "Maria", id: 2 },
        { name: "Pedro", id: 3 },
        { name: "Luis", id: 4 },
        { name: "Carlos", id: 5 },
    ]);
</script>

<!-- characters in row showing the name in a toast -->
 <div class="flex w-full gap-4">
     {#each characters as character}
             <div class="flex justify-center items-center">
                 <button class="bg-blue-500 text-white rounded-md px-4 py-2">
                     {character.name}
                 </button>
             </div>
     {/each}
 </div>
