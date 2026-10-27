// src/lib/suggest/word_cache.ts
// Caché de los diccionarios en IndexedDB.
//
// Los diccionarios son archivos grandes (~3 MB sin comprimir) que casi nunca
// cambian. Con esta caché, a partir de la segunda visita no se descargan: se
// leen del propio navegador. No depende de que el servidor mande cabeceras de
// caché adecuadas.
//
// Cómo se sabe que un archivo cambió: la URL de cada diccionario lleva un hash
// de su contenido (ver word_files.ts). Se guarda junto al texto; si la URL de
// ahora es distinta de la guardada, el archivo cambió y se vuelve a descargar.
// Cada archivo ocupa una sola entrada (por `cache_key`), así que las versiones
// viejas se reemplazan solas y no se acumulan.
//
// Todo es "mejor esfuerzo": si IndexedDB no existe, está bloqueado (navegación
// privada, cuota llena…) o tarda demasiado, simplemente se descarga como antes.
// Funciona igual dentro de un Web Worker y en el hilo principal.

const DB_NAME = "metroh-words";
const STORE = "files";
// Si IndexedDB no responde en este tiempo, se descarga sin esperarlo.
const IDB_TIMEOUT_MS = 4000;

interface CachedFile {
  key: string;
  url: string;
  text: string;
}

let db_promise: Promise<IDBDatabase | null> | null = null;

function open_db(): Promise<IDBDatabase | null> {
  db_promise ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: "key" });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Si otra pestaña pide actualizar o cerrar la base, se suelta y se reabre luego.
        db.onversionchange = () => { db.close(); db_promise = null; };
        db.onclose = () => { db_promise = null; };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return db_promise;
}

function within_timeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), IDB_TIMEOUT_MS);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

async function read_entry(key: string): Promise<CachedFile | null> {
  return within_timeout(
    (async () => {
      const db = await open_db();
      if (!db) return null;
      return new Promise<CachedFile | null>((resolve) => {
        try {
          const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
          req.onsuccess = () => resolve((req.result as CachedFile | undefined) ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    })(),
    null,
  );
}

async function write_entry(entry: CachedFile): Promise<void> {
  await within_timeout(
    (async () => {
      const db = await open_db();
      if (!db) return;
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(entry);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve(); // cuota llena, etc.: se sigue sin caché
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    })(),
    undefined,
  );
}

async function download_text(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Devuelve el texto de un diccionario: de la caché si está y es la misma
 * versión, o descargándolo (y guardándolo para la próxima vez).
 * Sin `cache_key` (por ejemplo en desarrollo, donde la URL no lleva hash y el
 * archivo cambia al editarlo) siempre se descarga.
 */
export async function fetch_word_text(
  url: string,
  cache_key?: string,
  download: (url: string) => Promise<string> = download_text,
): Promise<string> {
  if (!cache_key) return download(url);

  const hit = await read_entry(cache_key);
  if (hit && hit.url === url && typeof hit.text === "string" && hit.text.length > 0) return hit.text;

  const text = await download(url);
  if (text.length > 0) void write_entry({ key: cache_key, url, text });
  return text;
}
