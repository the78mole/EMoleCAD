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
/** Wie idbSetzen/idbLoeschen, aber Fehler (Speicher voll, IndexedDB gesperrt) werden weitergereicht */
export const idbSchreibenStreng = (k: string, v: unknown) => tx('readwrite', (s) => s.put(v, k)).then(() => undefined)
export const idbLoeschenStreng = (k: string) => tx('readwrite', (s) => s.delete(k)).then(() => undefined)
/** Lesen, Fehler (IndexedDB gesperrt o. ä.) werden weitergereicht statt als „nicht vorhanden“ gemeldet */
export const idbHolenStreng = <T>(k: string) => tx<T | undefined>('readonly', (s) => s.get(k))

/**
 * Wert in einer einzigen Schreib-Transaktion lesen, ändern und zurückschreiben.
 * IndexedDB serialisiert solche Transaktionen auch über Tabs hinweg, Änderungen
 * aus anderen Tabs gehen also nicht verloren. Liefert den geschriebenen Wert.
 */
export async function idbAendern<T>(k: string, f: (alt: unknown) => T): Promise<T> {
  const d = await db()
  return new Promise((ok, fehler) => {
    const t = d.transaction(STORE, 'readwrite')
    const s = t.objectStore(STORE)
    let neu: T
    const r = s.get(k)
    r.onsuccess = () => {
      try {
        neu = f(r.result)
        s.put(neu, k)
      } catch (e) {
        t.abort()
        fehler(e)
      }
    }
    t.oncomplete = () => ok(neu)
    t.onerror = () => fehler(t.error)
    t.onabort = () => fehler(t.error ?? new Error('abgebrochen'))
  })
}
