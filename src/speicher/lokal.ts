import { herunterladen } from '../ui/export'
import { idbHolen, idbSetzen } from './idb'
import type { DateiRef, GeoeffneteDatei, Speicherort } from './types'

/* File System Access API (Chrome, Edge, Opera). Firefox/Safari: Fallback mit Upload/Download. */
interface Handle {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>
}
type W = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<Handle[]>
  showSaveFilePicker?: (o: unknown) => Promise<Handle>
}
const w = window as W
/** In einem fremden iframe (z. B. Vorschau) verweigert der Browser die Dateiauswahl. */
function eingebettet() {
  try { return window.self !== window.top } catch { return true }
}
export const fsApi = typeof w.showOpenFilePicker === 'function' && typeof w.showSaveFilePicker === 'function' && !eingebettet()

const TYPEN = [{ description: 'MoleCAD-Projekt (YAML)', accept: { 'text/yaml': ['.yaml', '.yml'] } }]
const abbruch = (e: unknown) => (e as Error)?.name === 'AbortError'
/** Picker vom Browser blockiert (iframe, Berechtigungsrichtlinie) → auf Upload/Download ausweichen */
const blockiert = (e: unknown) => ['SecurityError', 'NotAllowedError'].includes((e as Error)?.name)

async function erlaubt(h: Handle) {
  if (!h.queryPermission) return true
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted'
}

async function merke(h: Handle): Promise<DateiRef> {
  const schluessel = `handle:${Date.now()}:${h.name}`
  await idbSetzen(schluessel, h)
  return { ort: 'lokal', name: h.name, schluessel }
}

async function handle(ref: DateiRef): Promise<Handle | undefined> {
  return ref.schluessel.startsWith('handle:') ? idbHolen<Handle>(ref.schluessel) : undefined
}

function dateiWaehlen(): Promise<File | undefined> {
  return new Promise((ok) => {
    const i = document.createElement('input')
    i.type = 'file'
    i.accept = '.yaml,.yml,text/yaml'
    i.onchange = () => ok(i.files?.[0])
    i.oncancel = () => ok(undefined)
    i.click()
  })
}

export const lokal: Speicherort = {
  id: 'lokal',
  label: 'Dieses Gerät',
  zurueckschreiben: fsApi,

  async oeffnen(): Promise<GeoeffneteDatei | undefined> {
    if (fsApi) {
      try {
        const [h] = await w.showOpenFilePicker!({ types: TYPEN, multiple: false })
        return { ref: await merke(h), text: await (await h.getFile()).text() }
      } catch (e) {
        if (abbruch(e)) return undefined
        if (!blockiert(e)) throw e
      }
    }
    const f = await dateiWaehlen()
    return f ? { ref: { ort: 'lokal', name: f.name, schluessel: `name:${f.name}` }, text: await f.text() } : undefined
  },

  async laden(ref) {
    const h = await handle(ref)
    if (!h) throw new Error(`${ref.name} kann ohne Dateizugriff nicht erneut geöffnet werden. Bitte über „Öffnen…“ wählen.`)
    if (!(await erlaubt(h))) throw new Error(`Kein Zugriff auf ${ref.name}`)
    return { ref, text: await (await h.getFile()).text() }
  },

  async speichern(ref, text) {
    const h = await handle(ref)
    if (!h) {
      herunterladen(text, ref.name, 'text/yaml')
      return ref
    }
    if (!(await erlaubt(h))) throw new Error(`Kein Schreibzugriff auf ${ref.name}`)
    const s = await h.createWritable()
    await s.write(text)
    await s.close()
    return ref
  },

  async speichernUnter(vorschlag, text) {
    if (fsApi) {
      try {
        const h = await w.showSaveFilePicker!({ suggestedName: vorschlag, types: TYPEN })
        const ref = await merke(h)
        await this.speichern(ref, text)
        return ref
      } catch (e) {
        if (abbruch(e)) return undefined
        if (!blockiert(e)) throw e
      }
    }
    herunterladen(text, vorschlag, 'text/yaml')
    return { ort: 'lokal', name: vorschlag, schluessel: `name:${vorschlag}` }
  },
}
