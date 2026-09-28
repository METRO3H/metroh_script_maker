<script lang="ts">
  import { predictor_store } from "@lib/predictor/predictor.store.svelte";

  function toggle() {
    if (predictor_store.status === "error") {
      predictor_store.enable();
    } else if (predictor_store.enabled) {
      predictor_store.disable();
    } else {
      predictor_store.enable();
    }
  }
</script>

{#if predictor_store.supported}
  <div class="predictor-toggle">
    {#if predictor_store.status === "loading"}
      <div class="predictor-progress" role="status" aria-live="polite">
        <div class="predictor-progress-track">
          <div
            class="predictor-progress-fill"
            style="width: {Math.round(predictor_store.progress * 100)}%"
          ></div>
        </div>
        <span class="predictor-label">
          {predictor_store.status_msg || "Cargando modelo…"}
        </span>
      </div>
    {:else}
      <button
        type="button"
        class="predictor-btn"
        class:is-on={predictor_store.enabled && predictor_store.status === "ready"}
        class:is-error={predictor_store.status === "error"}
        onclick={toggle}
      >
        {#if predictor_store.status === "error"}
          Autocompletado con IA: error — reintentar
        {:else if predictor_store.enabled && predictor_store.status === "ready"}
          Autocompletado con IA: ON
        {:else}
          Autocompletado con IA: OFF
        {/if}
      </button>
    {/if}
  </div>
{/if}

<style>
  .predictor-toggle {
    display: inline-flex;
    align-items: center;
  }

  .predictor-btn {
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 6px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-subtle);
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      border-color var(--transition),
      background var(--transition),
      color var(--transition);
  }
  .predictor-btn:hover {
    border-color: var(--accent);
    color: var(--text-primary);
  }
  .predictor-btn.is-on {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-muted);
  }
  .predictor-btn.is-error {
    border-color: var(--error-text);
    color: var(--error-text);
  }

  .predictor-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-secondary);
  }
  .predictor-progress-track {
    width: 100px;
    height: 6px;
    border-radius: 999px;
    background: var(--bg-subtle);
    overflow: hidden;
  }
  .predictor-progress-fill {
    height: 100%;
    background: var(--accent);
    transition: width 150ms ease;
  }
</style>
