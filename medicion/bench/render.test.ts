import { describe, it } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import ScriptEditor from "@components/ScriptEditor/ScriptEditor.svelte";

const N = Number(process.env.BENCH_LINES ?? 1000);

// jsdom no trae esto; el editor no depende de ello para lo que se mide.
(globalThis as any).fetch = async () => ({ ok: false, status: 404, text: async () => "", json: async () => [] });
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
(Element.prototype as any).scrollIntoView ??= function () {};
(Element.prototype as any).scrollTo ??= function () {};
(HTMLDialogElement.prototype as any).showModal ??= function () {};
console.warn = () => {};

function make_script(n: number) {
  const characters = Array.from({ length: 8 }, (_, i) => ({ name: "Personaje" + (i + 1) }));
  const lines: any[] = [];
  for (let i = 0; i < n; i++) {
    if (i % 50 === 0) lines.push({ line_type: "scene", scene_number: i / 50 + 1 });
    if (i % 17 === 16) lines.push({ line_type: "context", content: "Pasa un rato " + i, content_en: i % 2 ? "A while passes " + i : null });
    else lines.push({ line_type: ["dialogue", "thought", "narration"][i % 3], character_name: "Personaje" + (1 + (i % 8)), content: "Esta es la línea número " + i + " del guion de prueba", content_en: i % 3 === 0 ? "This is line number " + i : null });
  }
  return { id: "s1", name: "Guion de prueba", name_en: "", project_id: null, characters, lines };
}

function time(fn: () => void, reps: number) {
  const ts: number[] = [];
  for (let i = 0; i < reps; i++) { const t = performance.now(); fn(); flushSync(); ts.push(performance.now() - t); }
  ts.sort((a, b) => a - b);
  return { mediana: +ts[Math.floor(ts.length / 2)].toFixed(2), p90: +ts[Math.floor(ts.length * 0.9)].toFixed(2) };
}

describe("editor", () => {
  it(`render y edición con ${N} líneas`, async () => {
    const target = document.createElement("div"); document.body.appendChild(target);
    const script = make_script(N);
    const t0 = performance.now();
    const app = mount(ScriptEditor, { target, props: { initialScript: script, initialProjects: [], defaultProjectId: null } });
    flushSync();
    const mount_ms = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 50));

    const inputs = () => Array.from(target.querySelectorAll<HTMLInputElement>("input.line-input"));
    const out: Record<string, unknown> = { lineas_en_pantalla: inputs().length, nodos_dom: target.querySelectorAll("*").length, montaje_ms: Math.round(mount_ms) };

    // 1) editar una línea (blur → update_line → full_script reasignado)
    let k = 0;
    out["editar_una_linea"] = time(() => {
      const el = inputs()[(k += 37) % inputs().length]; el.value = "texto editado " + k;
      el.dispatchEvent(new Event("blur"));
    }, 40);

    // 2) teclear en el input principal (1 tecla)
    const main = target.querySelector<HTMLInputElement>("#script-input")!;
    let c = 0;
    out["una_tecla_en_input_principal"] = time(() => { main.value = "palab" + ((c++) % 9); main.dispatchEvent(new Event("input", { bubbles: true })); }, 60);

    // 3) insertar una línea entre dos (botón + línea)
    out["insertar_linea"] = time(() => {
      const btn = target.querySelectorAll<HTMLButtonElement>(".insert-btn")[2 * 5]; btn.click();
    }, 15);

    // 4) borrar una línea
    out["borrar_linea"] = time(() => { target.querySelectorAll<HTMLButtonElement>(".line-delete")[7].click(); }, 15);

    // 5) cambiar de idioma ES ↔ EN (re-renderiza todas las líneas)
    const tabs = target.querySelectorAll<HTMLButtonElement>(".lang-tab");
    let flip = 0;
    out["cambiar_idioma"] = time(() => { tabs[(flip++) % 2 === 0 ? 1 : 0].click(); }, 10);

    console.log("\nRESULTADO " + JSON.stringify(out));
    unmount(app);
  });
});
