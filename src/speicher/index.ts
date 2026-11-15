import { lokal } from './lokal'
import type { DateiRef, Speicherort } from './types'

/** Registrierte Speicherorte. GitHub, Nextcloud, Google Drive folgen hier. */
export const SPEICHERORTE: Speicherort[] = [lokal]
export const speicherort = (id: string) => SPEICHERORTE.find((s) => s.id === id) ?? lokal

const ZULETZT = 'molecad.zuletzt'
const AKTUELL = 'molecad.datei'

export function zuletzt(): DateiRef[] {
  try { return JSON.parse(localStorage.getItem(ZULETZT) ?? '[]') } catch { return [] }
}
export function merkeZuletzt(ref: DateiRef) {
  const liste = [ref, ...zuletzt().filter((r) => !(r.ort === ref.ort && r.name === ref.name))].slice(0, 8)
  try { localStorage.setItem(ZULETZT, JSON.stringify(liste)) } catch { /* egal */ }
}
export function aktuelleDatei(): DateiRef | undefined {
  try { return JSON.parse(localStorage.getItem(AKTUELL) ?? 'null') ?? undefined } catch { return undefined }
}
export function setzeAktuelleDatei(ref: DateiRef | undefined) {
  try { if (ref) localStorage.setItem(AKTUELL, JSON.stringify(ref)); else localStorage.removeItem(AKTUELL) } catch { /* egal */ }
}
export type { DateiRef, Speicherort } from './types'
