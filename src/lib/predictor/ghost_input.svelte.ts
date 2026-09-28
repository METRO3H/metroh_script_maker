// src/lib/predictor/ghost_input.svelte.ts
// Acción de Svelte reutilizable en cualquier <input> de cualquier
// proyecto. No importa nada del editor de guiones: solo depende del
// predictor_store (para saber si está encendido) y de build_prompt,
// que quien la usa provee desde afuera.

import { predictor_store } from "./predictor.store.svelte";
import { debug_log, debug_error } from "./predictor.debug";

// Diagnóstico temporal: poner en false (o borrar el bloque) una vez que
// el autocompletado funcione. Loguea cada punto donde el flujo podría
// cortarse en silencio, y además lo guarda en el buffer compartido de
// predictor.debug.ts (bajable con __predictor_debug_dump() desde la
// consola).
const log = (...args: unknown[]) => debug_log("ghost_input", ...args);
const log_error = (...args: unknown[]) => debug_error("ghost_input", ...args);

export interface GhostInputOptions {
  /** Devuelve { system?, prompt, stop? } a partir del valor actual, o null para no sugerir nada. */
  build_prompt: (value: string) => { system?: string; prompt: string; stop?: string[] } | null;
  /** Debounce antes de pedir una sugerencia nueva, en ms. Default 400. */
  delay?: number;
}

// Estilos del input que hay que copiar al overlay para que el texto
// fantasma quede alineado con el texto real, letra por letra.
const COPIED_STYLES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
] as const;

// --- limpieza de la respuesta cruda del modelo -----------------------
// Estas funciones son puras y genéricas: no saben nada de "guion",
// "escena" ni "personaje". Su único trabajo es convertir la respuesta
// cruda del modelo en algo que se pueda pegar de forma segura al final
// del input.
//
// El system prompt le pide al modelo que no repita nada de lo ya
// tipeado, pero en la práctica lo hace bastante seguido igual (más
// notorio incluso ahora que ya no "piensa" antes de responder: repite
// todo el contexto antes de llegar a la parte nueva). Por eso se
// prueban dos estrategias en cadena, no una sola:
//   1. find_anchor_continuation(): busca si el texto tipeado reaparece
//      en cualquier parte de la respuesta cruda, y si aparece, se queda
//      con lo que sigue después de esa aparición.
//   2. Si no aparece en ningún lado, se cae a confiar en la respuesta
//      cruda tal cual (con strip_typed_overlap() como defensa extra por
//      si el modelo repite solo el final, sin llegar a formar un
//      "ancla" completa en ningún punto).

/**
 * Busca si el texto ya tipeado (typed_value) reaparece dentro de la
 * respuesta cruda del modelo, y si aparece, devuelve todo lo que sigue
 * después de esa aparición. Devuelve null si no aparece en ningún lado
 * (puede ser que falten más chunks, o que el modelo haya respondido
 * directo sin repetir nada — en ese caso el caller cae a otra
 * estrategia, esto no es la única fuente de verdad).
 */
function find_anchor_continuation(raw: string, typed_value: string): string | null {
  let anchor_index = raw.lastIndexOf(typed_value);
  if (anchor_index === -1) {
    anchor_index = raw.toLowerCase().lastIndexOf(typed_value.toLowerCase());
  }
  if (anchor_index === -1) return null;
  return raw.slice(anchor_index + typed_value.length);
}

/**
 * Defensa por si el modelo, pese a la instrucción de no repetir, arranca
 * su respuesta repitiendo el final de lo que el usuario ya tipeó (total
 * o parcialmente) sin que eso llegue a formar un ancla completa en
 * ningún lado (ver find_anchor_continuation de arriba). Busca el sufijo
 * más largo de typed_value (de al menos 2 caracteres, para no recortar
 * por una coincidencia de un solo espacio o letra) que aparezca como
 * prefijo de raw, sin distinguir mayúsculas, y lo recorta. Si no
 * encuentra overlap, devuelve raw tal cual.
 */
function strip_typed_overlap(raw: string, typed_value: string): string {
  const max_len = Math.min(typed_value.length, raw.length);
  for (let len = max_len; len >= 2; len--) {
    const suffix = typed_value.slice(typed_value.length - len);
    if (raw.slice(0, len).toLowerCase() === suffix.toLowerCase()) {
      return raw.slice(len);
    }
  }
  return raw;
}

/**
 * Limpieza conservadora de adornos típicos de un chat-LLM: negritas,
 * comillas envolviendo toda la respuesta, saltos de línea (el ghost
 * text vive en un <input> de una sola línea, así que cualquier cosa
 * después del primer salto de línea se descarta). Preserva como mucho
 * un espacio inicial, para no pegar la sugerencia contra la última
 * palabra ya tipeada.
 *
 * El orden importa: primero se descartan los espacios/saltos de línea
 * iniciales, y RECIÉN DESPUÉS se busca un salto de línea dentro de lo
 * que queda para cortar ahí. Al revés (como estaba antes) rompía
 * cualquier respuesta que arrancara con una línea en blanco: el primer
 * salto de línea aparecía en la posición 0, así que "todo lo de antes
 * del primer salto" quedaba vacío y se perdía el contenido real que
 * venía después.
 */
function sanitize_continuation(text: string): string {
  const had_leading_space = /^[ \t\n\r]/.test(text);
  let out = text.replace(/^[ \t\n\r]+/, "");

  const newline_index = out.search(/\r?\n/);
  if (newline_index !== -1) out = out.slice(0, newline_index);

  out = out.replace(/\*\*/g, "").replace(/__/g, "").replace(/`/g, "");
  out = out.trimEnd();

  const quote_pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["\u201c", "\u201d"],
    ["\u00ab", "\u00bb"],
  ];
  for (const [open, close] of quote_pairs) {
    if (out.startsWith(open) && out.endsWith(close) && out.length > 1) {
      out = out.slice(1, -1);
      break;
    }
  }

  if (!out) return "";
  return had_leading_space ? ` ${out}` : out;
}

export function ghost_input(node: HTMLInputElement, options: GhostInputOptions) {
  let current_options = options;
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;
  let abort_controller: AbortController | null = null;
  let suggestion = "";

  // --- overlay -------------------------------------------------------
  // No se envuelve el input en un wrapper nuevo (rompería selectores
  // CSS existentes, flex/grid del padre, etc.): en vez de eso, se pone
  // position:relative en el padre si hace falta, y el overlay se
  // posiciona absoluto ahí adentro, calcado sobre el input.

  const parent = node.parentElement;
  if (!parent) {
    throw new Error("ghost_input: el input necesita un elemento padre");
  }
  const previous_parent_position = parent.style.position;
  if (getComputedStyle(parent).position === "static") {
    parent.style.position = "relative";
  }

  const overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.position = "absolute";
  overlay.style.pointerEvents = "none";
  overlay.style.overflow = "hidden";
  overlay.style.whiteSpace = "pre";
  overlay.style.boxSizing = "border-box";

  const inner = document.createElement("span");
  inner.style.display = "inline-block";
  overlay.appendChild(inner);

  // Span invisible: ocupa el mismo ancho que el texto ya tipeado, así
  // el texto de sugerencia arranca justo donde termina el real. Se usa
  // un <span> con el layout real del navegador en vez de
  // canvas.measureText(), que puede no coincidir pixel a pixel.
  const mirror = document.createElement("span");
  mirror.style.visibility = "hidden";
  inner.appendChild(mirror);

  const ghost_text_el = document.createElement("span");
  ghost_text_el.style.color = "var(--text-muted, #888)";
  inner.appendChild(ghost_text_el);

  parent.insertBefore(overlay, node.nextSibling);

  function copy_input_metrics() {
    const cs = getComputedStyle(node);
    for (const prop of COPIED_STYLES) {
      overlay.style[prop] = cs[prop];
    }
    // El padding del overlay = borde + padding real del input, para que
    // el texto arranque en el mismo punto que el texto real (que vive
    // adentro del borde). El overlay no dibuja su propio borde: el
    // input real ya lo muestra, encima.
    const left = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const top = parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    const right = parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight);
    const bottom = parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom);
    overlay.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }

  function sync_overlay_geometry() {
    overlay.style.left = `${node.offsetLeft}px`;
    overlay.style.top = `${node.offsetTop}px`;
    overlay.style.width = `${node.offsetWidth}px`;
    overlay.style.height = `${node.offsetHeight}px`;
  }

  // El <input> hace scroll interno cuando el texto no entra en su
  // ancho visible (algo normal en una línea de diálogo larga). Sin
  // esto, el ghost quedaría en el lugar equivocado apenas el input
  // empieza a scrollear — es el bug más probable de este enfoque.
  function sync_overlay_scroll() {
    inner.style.transform = `translateX(-${node.scrollLeft}px)`;
  }

  function render_ghost() {
    mirror.textContent = node.value;
    ghost_text_el.textContent = suggestion;
    sync_overlay_scroll();
  }

  copy_input_metrics();
  sync_overlay_geometry();
  render_ghost();

  const resize_observer = new ResizeObserver(() => {
    sync_overlay_geometry();
  });
  resize_observer.observe(node);

  // Si carga una web font después de la primera medición, el ancho del
  // mirror puede haber quedado calculado con la fuente de reserva.
  document.fonts?.ready.then(() => {
    copy_input_metrics();
    render_ghost();
  });

  // --- lógica de sugerencia -------------------------------------------

  function is_caret_at_end(): boolean {
    return node.selectionStart === node.value.length && node.selectionEnd === node.value.length;
  }

  function clear_suggestion() {
    if (!suggestion) return;
    suggestion = "";
    render_ghost();
  }

  function abort_current() {
    abort_controller?.abort();
    abort_controller = null;
  }

  async function request_suggestion() {
    const value = node.value;
    if (!value || !is_caret_at_end()) {
      log("cortado: input vacío o cursor no está al final", {
        value,
        selectionStart: node.selectionStart,
        selectionEnd: node.selectionEnd,
        length: node.value.length,
      });
      return;
    }
    if (!predictor_store.enabled || predictor_store.status !== "ready") {
      log("cortado: predictor no está enabled+ready", {
        enabled: predictor_store.enabled,
        status: predictor_store.status,
      });
      return;
    }

    const built = current_options.build_prompt(value);
    if (!built) {
      log("cortado: build_prompt devolvió null para", value);
      return;
    }
    log("pidiendo sugerencia", built);

    abort_current();
    const controller = new AbortController();
    abort_controller = controller;

    // Acumula TODO lo que manda el modelo, tal cual. Nunca se muestra
    // directamente: mientras el stream corre, solo find_anchor_continuation()
    // decide si se actualiza la sugerencia (señal confiable apenas
    // aparece). Si el stream termina sin que el ancla haya aparecido
    // nunca, recién ahí strip_typed_overlap() + sanitize_continuation()
    // se aplican una sola vez sobre todo lo acumulado — ver el fallback
    // después del loop, más abajo.
    let raw_buffer = "";
    let anchor_found = false;

    try {
      const stream = predictor_store.instance.predict({
        ...built,
        signal: controller.signal,
      });
      let chunk_count = 0;
      for await (const chunk of stream) {
        chunk_count++;
        log("chunk recibido", chunk);
        if (controller.signal.aborted) {
          log("abortado durante el stream");
          return;
        }
        // El usuario pudo haber movido el cursor mientras llegaba la
        // respuesta: si ya no está al final, la sugerencia no aplica.
        if (!is_caret_at_end()) {
          log("cortado a mitad de stream: el cursor ya no está al final");
          return;
        }
        if (chunk.text) {
          raw_buffer += chunk.text;
          const anchored = find_anchor_continuation(raw_buffer, value);
          if (anchored !== null) {
            anchor_found = true;
            const cleaned = sanitize_continuation(anchored);
            if (cleaned !== suggestion) {
              suggestion = cleaned;
              render_ghost();
              log("sugerencia actualizada", { raw_buffer, suggestion, via: "ancla" });
            }
          }
          // Si todavía no apareció el ancla, no se muestra nada: no hay
          // forma de distinguir, chunk a chunk, si el modelo está
          // respondiendo directo o si va a terminar repitiendo contexto
          // antes de llegar a la parte nueva (que es exactamente lo que
          // pasaba acá: se llegó a mostrar "Escena 1 —" como sugerencia
          // válida por casi un segundo, con Tab activo, antes de que el
          // ancla apareciera y la corrigiera). El fallback directo se
          // aplica una sola vez, al final, ver más abajo.
        }
        if (chunk.done) break;
      }
      if (!anchor_found && raw_buffer) {
        // El ancla nunca apareció en toda la respuesta: recién acá, una
        // sola vez y con el raw_buffer ya completo, se confía en la
        // respuesta cruda como continuación directa.
        const cleaned = sanitize_continuation(strip_typed_overlap(raw_buffer, value));
        if (cleaned !== suggestion) {
          suggestion = cleaned;
          render_ghost();
          log("sugerencia actualizada (fallback sin ancla, al terminar el stream)", {
            raw_buffer,
            suggestion,
            via: "directo",
          });
        }
      }
      log("stream terminado, chunks totales:", chunk_count, "sugerencia final:", suggestion);
    } catch (err) {
      // Antes esto se tragaba el error en silencio. Ahora se loguea
      // completo (y queda en el buffer compartido) — es la forma más
      // rápida de ver qué está fallando de verdad en vez de adivinar.
      log_error("predict() falló:", err);
      clear_suggestion();
    }
  }

  function schedule() {
    // El ghost viejo se limpia ya, no cuando llegue la sugerencia
    // nueva — si no, mientras dura el debounce se ve una sugerencia
    // calculada sobre texto que ya no es el actual.
    clear_suggestion();
    abort_current();
    if (debounce_timer) clearTimeout(debounce_timer);
    log("input detectado, debounce arrancado");
    debounce_timer = setTimeout(() => {
      log("debounce cumplido, llamando a request_suggestion()");
      void request_suggestion();
    }, current_options.delay ?? 400);
  }

  function accept() {
    if (!suggestion) return;
    node.value = node.value + suggestion;
    clear_suggestion();
    node.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  function on_input() {
    render_ghost();
    schedule();
  }

  function on_keydown(e: KeyboardEvent) {
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();
      accept();
    } else if (e.key === "Escape" && suggestion) {
      abort_current();
      clear_suggestion();
    }
  }

  function on_blur() {
    abort_current();
    if (debounce_timer) clearTimeout(debounce_timer);
    clear_suggestion();
  }

  node.addEventListener("input", on_input);
  node.addEventListener("keydown", on_keydown);
  node.addEventListener("blur", on_blur);

  return {
    update(new_options: GhostInputOptions) {
      current_options = new_options;
    },
    destroy() {
      abort_current();
      if (debounce_timer) clearTimeout(debounce_timer);
      node.removeEventListener("input", on_input);
      node.removeEventListener("keydown", on_keydown);
      node.removeEventListener("blur", on_blur);
      resize_observer.disconnect();
      overlay.remove();
      parent.style.position = previous_parent_position;
    },
  };
}