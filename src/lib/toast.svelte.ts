// src/lib/toast.svelte.ts
// Toasts globales de la página. Es un módulo singleton: cualquier componente
// (o isla de Astro) puede llamar a show_toast() y <ToastHost /> —montado una
// sola vez en el layout— los dibuja.

export type ToastKind = "success" | "error" | "neutral";
export interface ToastItem { id: number; message: string; kind: ToastKind; key?: string }
export interface ToastOptions {
  /** Un toast con la misma key se actualiza en el lugar en vez de apilarse. */
  key?: string;
  /** ms antes de desaparecer. 0 = se queda hasta que se cierre o se llame a dismiss_toast_key. */
  duration?: number;
}

const MAX_TOASTS = 4;
let items = $state<ToastItem[]>([]);
let next_id = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const toasts = { get items() { return items; } };

function arm(id: number, duration: number) {
  const prev = timers.get(id);
  if (prev) clearTimeout(prev);
  timers.delete(id);
  if (duration > 0) timers.set(id, setTimeout(() => dismiss_toast(id), duration));
}

export function show_toast(message: string, kind: ToastKind = "neutral", opts: ToastOptions = {}): number {
  const duration = opts.duration ?? (kind === "error" ? 5000 : 2600);

  if (opts.key) {
    const existing = items.find((t) => t.key === opts.key);
    if (existing) {
      // Se actualiza en el lugar (mismo id): sin re-animar ni apilar repetidos.
      items = items.map((t) => (t.id === existing.id ? { ...t, message, kind } : t));
      arm(existing.id, duration);
      return existing.id;
    }
  }

  const id = next_id++;
  items = [...items, { id, message, kind, key: opts.key }].slice(-MAX_TOASTS);
  arm(id, duration);
  return id;
}

export function dismiss_toast(id: number) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  items = items.filter((x) => x.id !== id);
}

export function dismiss_toast_key(key: string) {
  const found = items.find((t) => t.key === key);
  if (found) dismiss_toast(found.id);
}
