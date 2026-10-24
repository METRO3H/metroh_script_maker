<script>
  // ToastHost.svelte — dibuja los toasts de $lib/toast.svelte.ts.
  // Se monta una sola vez en MainLayout.
  import { toasts, dismiss_toast } from "@lib/toast.svelte";
  import Icon from "@components/ui/Icon.svelte";
</script>

<div class="toast-host" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <button
      type="button"
      class="toast toast-item toast-{t.kind}"
      role={t.kind === "error" ? "alert" : "status"}
      onclick={() => dismiss_toast(t.id)}
      title="Cerrar"
    >
      {#if t.kind === "success"}<Icon name="check" size={12} stroke_width={2.5} />
      {:else if t.kind === "error"}<Icon name="x" size={12} stroke_width={2.5} />{/if}
      <span class="toast-msg">{t.message}</span>
    </button>
  {/each}
</div>

<style>
  .toast-host { position: fixed; right: 20px; bottom: 20px; z-index: 1000; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; max-width: min(440px, calc(100vw - 40px)); }
  .toast-item { pointer-events: auto; cursor: pointer; text-align: left; align-items: flex-start; line-height: 1.4; box-shadow: var(--shadow-md, 0 6px 20px rgba(0,0,0,0.18)); background-color: var(--surface); }
  .toast-item :global(svg) { flex-shrink: 0; margin-top: 2px; }
  .toast-msg { overflow-wrap: anywhere; }
  /* Capa sólida debajo para que el color de estado no deje transparentar la página. */
  .toast-item.toast-success { background-image: linear-gradient(var(--success-bg), var(--success-bg)); }
  .toast-item.toast-error   { background-image: linear-gradient(var(--error-bg), var(--error-bg)); }
  .toast-item.toast-neutral { background-image: linear-gradient(var(--bg-muted), var(--bg-muted)); }
  @media (max-width: 600px) {
    .toast-host { left: 12px; right: 12px; bottom: 12px; max-width: none; align-items: stretch; }
  }
</style>
