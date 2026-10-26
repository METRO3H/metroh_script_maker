import { describe, it } from "vitest";
import { mount, flushSync, tick } from "svelte";
import { writeFileSync } from "fs";
import ScriptEditor from "@components/ScriptEditor/ScriptEditor.svelte";

(globalThis as any).fetch = async () => ({ ok: false, status: 404, text: async () => "", json: async () => [] });
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
const scrolled: string[] = [];
(Element.prototype as any).scrollIntoView = function () { scrolled.push((this as HTMLElement).querySelector?.(".scene-label")?.textContent?.trim() ?? ((this as HTMLElement).id || "?")); };
(Element.prototype as any).scrollTo = function () {};
(HTMLDialogElement.prototype as any).showModal ??= function () {};
console.warn = () => {};

function make_script(n: number) {
  const characters = ["Ana", "Beto", "Carla"].map((name) => ({ name }));
  const lines: any[] = [];
  for (let i = 0; i < n; i++) {
    if (i % 12 === 0) lines.push({ line_type: "scene", scene_number: i / 12 + 1 });
    if (i % 7 === 6) lines.push({ line_type: "context", content: "Contexto " + i, content_en: i % 2 ? "Context " + i : null });
    else lines.push({ line_type: ["dialogue", "thought", "narration"][i % 3], character_name: characters[i % 3].name, content: "Línea " + i, content_en: i % 3 === 0 ? "Line " + i : null });
  }
  return { id: "s1", name: "Prueba", name_en: "", project_id: null, characters, lines };
}

describe("comportamiento", () => {
  it("traza", async () => {
    const trace: Record<string, unknown>[] = [];
    const target = document.createElement("div"); document.body.appendChild(target);
    mount(ScriptEditor, { target, props: { initialScript: make_script(60), initialProjects: [], defaultProjectId: null } });
    flushSync(); await new Promise((r) => setTimeout(r, 30));
    const q = <T extends Element>(sel: string) => Array.from(target.querySelectorAll<T>(sel));
    const rows = () => q<HTMLElement>(".script-line, .scene-separator");
    const snap = (label: string) => trace.push({
      label,
      focus: (document.activeElement as HTMLElement)?.id ?? null,
      dirty: !!target.querySelector(".dirty-dot"),
      counts: q(".lang-count").map((e) => e.textContent?.trim()),
      rows: rows().map((r) => r.classList.contains("scene-separator")
        ? "S:" + r.querySelector(".scene-label")?.textContent?.trim() + "@" + r.getAttribute("data-scene-index")
        : (() => { const inp = r.querySelector<HTMLInputElement>("input.line-input")!; return `${inp.id}|${inp.value}|${r.querySelector(".line-character")?.textContent ?? "-"}|${r.querySelector(".line-badge")?.textContent?.trim()}|${[...r.classList].filter((c) => c !== "script-line").sort().join(",")}|ref:${r.querySelector(".line-ref")?.textContent ?? ""}`; })()),
    });
    const flush = async () => { flushSync(); await tick(); await new Promise((r) => setTimeout(r, 5)); flushSync(); };
    const inputs = () => q<HTMLInputElement>("input.line-input");
    const edit = async (i: number, v: string) => { const el = inputs()[i]; el.focus(); el.value = v; el.dispatchEvent(new Event("blur")); await flush(); };

    snap("inicial");
    await edit(3, "Línea 3 EDITADA"); snap("editar línea 3");
    await edit(3, "Línea 3"); snap("deshacer edición (¿sigue sucio?)");
    q<HTMLButtonElement>(".insert-btn")[2 * 8].click(); await flush(); snap("insertar línea antes de la fila 8");
    q<HTMLButtonElement>(".insert-btn")[2 * 20 + 1].click(); await flush(); snap("insertar escena antes de la fila 20");
    q<HTMLButtonElement>(".line-delete")[5].click(); await flush(); snap("borrar línea 5");
    // mover con Alt+↓ y Alt+↑
    const k = inputs()[10]; k.focus(); k.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true })); await flush(); snap("Alt+↓ en línea 10");
    const k2 = inputs()[4]; k2.focus(); k2.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true })); await flush(); snap("Alt+↑ en línea 4");
    // borrar una escena
    q<HTMLButtonElement>(".scene-delete")[1].click(); await flush(); snap("borrar escena 2");
    // añadir al final desde el input principal
    const main = target.querySelector<HTMLInputElement>("#script-input")!;
    main.value = "hola mundo nuevo"; main.dispatchEvent(new Event("input", { bubbles: true })); flushSync();
    main.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); await flush(); snap("añadir línea al final");
    // idioma
    const tabs = q<HTMLButtonElement>(".lang-tab");
    tabs[1].click(); await flush(); snap("idioma EN");
    await edit(2, "Traducción 2"); snap("traducir línea 2 (EN)");
    tabs[0].click(); await flush(); snap("idioma ES");
    // navegación entre escenas (Shift+↓ x2, Shift+↑)
    scrolled.length = 0;
    for (const code of ["ArrowDown", "ArrowDown", "ArrowUp"]) { (document.activeElement as HTMLElement)?.blur?.(); window.dispatchEvent(new KeyboardEvent("keydown", { code, shiftKey: true, bubbles: true })); await flush(); }
    trace.push({ label: "saltos de escena (índice del elemento al que se hizo scroll)", scrolled: [...scrolled] });
    // selección por rectángulo: se simulan las posiciones de las filas (jsdom no tiene layout)
    const lines = q<HTMLElement>("[data-line-index]");
    lines.forEach((el) => { const i = Number(el.dataset.lineIndex); el.getBoundingClientRect = () => ({ top: i * 30, bottom: i * 30 + 28, left: 0, right: 800, width: 800, height: 28, x: 0, y: i * 30, toJSON() {} }) as DOMRect; });
    const area = target.querySelector<HTMLElement>(".lines-area")!;
    area.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 900, clientY: 5 * 30, bubbles: true })); flushSync();
    for (const y of [6 * 30, 9 * 30, 12 * 30 + 10]) window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: y, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); await flush();
    trace.push({ label: "rectángulo", selected: q<HTMLElement>(".line-selected").map((e) => e.dataset.lineIndex), select_mode: q(".select-mode-line").length > 0 });
    q<HTMLElement>(".line-selected").length && window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true })); await flush(); snap("Esc: sale de selección");

    writeFileSync(process.env.TRACE_OUT!, JSON.stringify(trace, null, 1));
  });
});
