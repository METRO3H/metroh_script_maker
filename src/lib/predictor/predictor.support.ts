// predictor.support.ts
// Decide si el predictor puede ofrecerse en este dispositivo/navegador.
// Cero dependencias del motor (no importa WebLLM) y cero dependencias
// del dominio. Se ejecuta de forma síncrona e instantánea: no dispara
// ninguna carga pesada, así que es seguro llamarlo al iniciar la página.

/**
 * Detecta iOS. Casos cubiertos:
 * - iPhone / iPod: user agent explícito.
 * - iPad moderno: iPadOS reporta un user agent de escritorio ("Macintosh")
 *   a propósito, así que se distingue por tener soporte táctil multi-touch.
 *
 * Por qué se excluye iOS específicamente (y no Android): Safari borra
 * todo el storage creado por script (incluido IndexedDB, donde WebLLM
 * cachea el modelo) si pasan 7 días sin interacción del usuario con el
 * origen — y en iOS, todo navegador usa WebKit por debajo, así que la
 * regla aplica sin importar cuál use la persona. Eso rompe la premisa
 * de "se descarga una vez y listo": en un patrón de uso típico de
 * escritura (con pausas de más de una semana) el modelo se puede borrar
 * solo y forzar una redescarga de ~400MB sin aviso. Android no tiene
 * esta política, así que ahí solo se valida soporte de WebGPU.
 */
export function is_ios(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * true si el predictor puede ofrecerse en este dispositivo.
 * Si esto da false, el resto del módulo (worker, cliente WebLLM, store)
 * no debería ni importarse — ver predictor.store.svelte.ts.
 *
 * Guard de SSR: Node.js 22+ define su propio `navigator` global (con
 * userAgent "Node.js/22"), así que probar solo `typeof navigator` no
 * alcanza para detectar el servidor. Se chequea `window` en su lugar,
 * que no existe en Node. Durante SSR esto siempre da false; el valor
 * real se recalcula en el cliente al hidratar.
 */
export function is_predictor_supported(): boolean {
  if (typeof window === "undefined") return false;
  if (is_ios()) return false;
  if (!("gpu" in navigator)) return false;
  return true;
}
