/** Mini-Key-Value-Store auf IndexedDB (für Datei-Handles, die nicht in localStorage passen). */
const DB = 'molecad', STORE = 'kv'

function db(): Promise<IDBDatabase> {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fehler(r.error)
  })
}

async function tx<T>(modus: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((ok, fehler) => {
    const r = f(d.transaction(STORE, modus).objectStore(STORE))
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fehler(r.error)
  })
}

export const idbHolen = <T>(k: string) => tx<T | undefined>('readonly', (s) => s.get(k)).catch(() => undefined)
export const idbSetzen = (k: string, v: unknown) => tx('readwrite', (s) => s.put(v, k)).then(() => undefined).catch(() => undefined)
export const idbLoeschen = (k: string) => tx('readwrite', (s) => s.delete(k)).then(() => undefined).catch(() => undefined)
