<script>
   // ScriptOnboarding.svelte
   // Onboarding estilo Netflix: una pregunta a la vez, pantalla completa

   let { ondone } = $props();
   // ondone({ title: string, characters: string[] })

   let step = $state(1); // 1 = título, 2 = personajes
   let title = $state("");
   let characters = $state([]); // string[]
   let new_char = $state("");
   let char_input = $state(null);
   let title_input = $state(null);
   let animating = $state(false);

   // Ir al paso 2 con animación de salida/entrada
   async function go_to_step2() {
      if (!title.trim()) return;
      animating = true;
      await sleep(280);
      step = 2;
      animating = false;
      await sleep(50);
      char_input?.focus();
   }

   function add_char() {
      const name = new_char.trim();
      if (!name) return;
      if (characters.includes(name)) return; // no duplicados
      characters = [...characters, name];
      new_char = "";
      char_input?.focus();
   }

   function remove_char(name) {
      characters = characters.filter((c) => c !== name);
   }

   function finish() {
      if (characters.length === 0) return;
      ondone({ title: title.trim(), characters });
   }

   function handle_title_key(e) {
      if (e.key === "Enter") go_to_step2();
   }

   function handle_char_key(e) {
      if (e.key === "Enter") add_char();
   }

   function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
   }

   // Focus en el input del título al montar
   $effect(() => {
      if (step === 1) setTimeout(() => title_input?.focus(), 100);
   });
</script>

<div class="onboarding" class:animating>
   <!-- Paso 1 — Título -->
   {#if step === 1}
      <div class="step" class:step-exit={animating}>
         <div class="step-content">
            <p class="step-number">1 / 2</p>
            <h1 class="step-title">¿Cómo se llama tu script?</h1>
            <p class="step-sub">Puedes cambiarlo después cuando quieras.</p>

            <input
               bind:this={title_input}
               type="text"
               class="big-input"
               placeholder="El último tren..."
               value={title}
               oninput={(e) => (title = e.currentTarget.value)}
               onkeydown={handle_title_key}
               autocomplete="off"
               maxlength="200"
            />

            <button class="btn btn-primary next-btn" onclick={go_to_step2} disabled={!title.trim()}>
               Continuar →
            </button>
         </div>
      </div>

      <!-- Paso 2 — Personajes -->
   {:else if step === 2}
      <div class="step step-enter" class:step-exit={animating}>
         <div class="step-content">
            <p class="step-number">2 / 2</p>
            <h1 class="step-title">¿Quiénes participan?</h1>
            <p class="step-sub">Agrega al menos un personaje. Puedes añadir más mientras escribes.</p>

            <!-- Input de personaje -->
            <div class="char-input-row">
               <input
                  bind:this={char_input}
                  type="text"
                  class="big-input"
                  placeholder="Nombre del personaje..."
                  value={new_char}
                  oninput={(e) => (new_char = e.currentTarget.value)}
                  onkeydown={handle_char_key}
                  autocomplete="off"
                  maxlength="80"
               />
               <button class="btn btn-ghost add-char-btn" onclick={add_char} disabled={!new_char.trim()}>
                  <svg
                     xmlns="http://www.w3.org/2000/svg"
                     width="16"
                     height="16"
                     viewBox="0 0 24 24"
                     fill="none"
                     stroke="currentColor"
                     stroke-width="2.5"
                     stroke-linecap="round"
                     stroke-linejoin="round"
                  >
                     <path d="M5 12h14" /><path d="M12 5v14" />
                  </svg>
                  Agregar
               </button>
            </div>

            <!-- Chips de personajes agregados -->
            {#if characters.length > 0}
               <div class="char-chips">
                  {#each characters as char}
                     <div class="char-chip">
                        <span>{char}</span>
                        <button class="chip-remove" onclick={() => remove_char(char)} aria-label={`Quitar ${char}`}>
                           <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="3"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                           >
                              <path d="M18 6 6 18M6 6l12 12" />
                           </svg>
                        </button>
                     </div>
                  {/each}
               </div>
            {/if}

            <div class="step2-actions">
               <!-- Volver al paso 1 -->
               <button
                  class="btn btn-ghost back-btn"
                  onclick={() => {
                     step = 1;
                  }}
               >
                  ← Volver
               </button>

               <button class="btn btn-primary next-btn" onclick={finish} disabled={characters.length === 0}>
                  Empezar a escribir →
               </button>
            </div>
         </div>
      </div>
   {/if}
</div>

<style>
   /* ── Pantalla completa ── */
   .onboarding {
      position: fixed;
      top: 48px; /* altura del navbar */
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--bg);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 40;
      padding: 24px;
   }

   /* ── Step ── */
   .step {
      width: 100%;
      max-width: 520px;
      animation: step-in 0.35s cubic-bezier(0.34, 1.2, 0.64, 1) both;
   }

   .step-exit {
      animation: step-out 0.28s cubic-bezier(0.4, 0, 1, 1) both;
   }

   .step-enter {
      animation: step-in 0.35s cubic-bezier(0.34, 1.2, 0.64, 1) both;
   }

   @keyframes step-in {
      from {
         opacity: 0;
         transform: translateY(20px) scale(0.98);
      }
      to {
         opacity: 1;
         transform: translateY(0) scale(1);
      }
   }

   @keyframes step-out {
      from {
         opacity: 1;
         transform: translateY(0);
      }
      to {
         opacity: 0;
         transform: translateY(-16px);
      }
   }

   /* ── Contenido ── */
   .step-content {
      display: flex;
      flex-direction: column;
      gap: 0;
   }

   .step-number {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
   }

   .step-title {
      font-size: 32px;
      font-weight: 300;
      letter-spacing: -0.03em;
      color: var(--text-primary);
      margin-bottom: 8px;
      line-height: 1.15;
   }

   .step-sub {
      font-size: 14px;
      color: var(--text-muted);
      margin-bottom: 36px;
      line-height: 1.5;
   }

   /* ── Input grande ── */
   .big-input {
      width: 100%;
      background: transparent;
      border: none;
      border-bottom: 2px solid var(--border-strong);
      border-radius: 0;
      padding: 10px 0;
      font-family: var(--font-mono);
      font-size: 22px;
      font-weight: 600;
      color: var(--text-primary);
      outline: none;
      margin-bottom: 32px;
      transition: border-color var(--transition);
   }
   .big-input::placeholder {
      color: var(--text-placeholder);
      font-weight: 400;
   }
   .big-input:focus {
      border-bottom-color: var(--accent);
   }

   /* ── Botón principal ── */
   .next-btn {
      align-self: flex-start;
      font-size: 13px;
      padding: 10px 24px;
   }
   .next-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
   }

   /* ── Fila de input + agregar personaje ── */
   .char-input-row {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      margin-bottom: 0;
   }

   .char-input-row .big-input {
      flex: 1;
      margin-bottom: 0;
   }

   .add-char-btn {
      font-size: 12px;
      padding: 8px 16px;
      gap: 6px;
      flex-shrink: 0;
      margin-bottom: 2px;
   }
   .add-char-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
   }

   /* ── Chips de personajes ── */
   .char-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 20px;
      margin-bottom: 4px;
      min-height: 36px;
   }

   .char-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 600;
      padding: 5px 10px 5px 14px;
      border-radius: 99px;
      background: var(--accent-muted);
      color: var(--accent-text);
      border: 1px solid var(--accent);
      animation: chip-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both;
   }

   @keyframes chip-in {
      from {
         opacity: 0;
         transform: scale(0.8);
      }
      to {
         opacity: 1;
         transform: scale(1);
      }
   }

   .chip-remove {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--accent-text);
      cursor: pointer;
      padding: 0;
      opacity: 0.6;
      transition:
         opacity var(--transition),
         background var(--transition);
   }
   .chip-remove:hover {
      opacity: 1;
      background: var(--accent);
      color: white;
   }

   /* ── Acciones paso 2 ── */
   .step2-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 32px;
   }

   .back-btn {
      font-size: 12px;
      padding: 8px 16px;
      color: var(--text-muted);
   }
</style>
