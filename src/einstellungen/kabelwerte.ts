import { useSyncExternalStore } from 'react'
import { idbHolen, idbSetzen } from '../speicher/idb'
import { KABEL_STANDARD, type KabelFeld } from '../model/kabel'

/**
 * Eigene Kabeltypen und Querschnitte, die im Eigenschaften-Panel eingegeben
 * wurden. App-weit (für alle Projekte), nur in diesem Browser (IndexedDB).
 */
export type KabelWerte = Record<KabelFeld, string[]>

// Präfix `molecad.` wie die übrigen internen Schlüssel
const SCHLUESSEL = 'molecad.kabelwerte'
/** Obergrenze je Liste, damit Tippfehler die Auswahl nicht endlos wachsen lassen */
const MAX = 50
const LEER: KabelWerte = { typ: [], querschnitt: [] }

const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, MAX) : [])
function bereinigen(v: unknown): KabelWerte {
  const o = (v ?? {}) as Partial<Record<KabelFeld, unknown>>
  return { typ: liste(o.typ), querschnitt: liste(o.querschnitt) }
}

let aktuell: KabelWerte = LEER
const hoerer = new Set<() => void>()
const melden = () => hoerer.forEach((h) => h())

async function neuLaden() {
  aktuell = bereinigen(await idbHolen<unknown>(SCHLUESSEL))
  melden()
}

const kanal = typeof BroadcastChannel === 'function' ? new BroadcastChannel(SCHLUESSEL) : undefined
if (kanal) kanal.onmessage = () => void neuLaden()
if (typeof indexedDB !== 'undefined') void neuLaden()

export const kabelWerteHolen = () => aktuell

async function speichern(neu: KabelWerte) {
  aktuell = neu
  melden()
  await idbSetzen(SCHLUESSEL, neu)
  kanal?.postMessage('geaendert')
}

/** Eigenen Wert merken (Standardwerte und schon bekannte werden ignoriert). */
export function kabelWertMerken(feld: KabelFeld, wert: string) {
  const t = wert.trim()
  if (!t || KABEL_STANDARD[feld].includes(t) || aktuell[feld].includes(t)) return Promise.resolve()
  return speichern({ ...aktuell, [feld]: [t, ...aktuell[feld]].slice(0, MAX) })
}

export function kabelWertVergessen(feld: KabelFeld, wert: string) {
  if (!aktuell[feld].includes(wert)) return Promise.resolve()
  return speichern({ ...aktuell, [feld]: aktuell[feld].filter((x) => x !== wert) })
}

function abonnieren(h: () => void) {
  hoerer.add(h)
  return () => { hoerer.delete(h) }
}

export function useKabelWerte(): KabelWerte {
  return useSyncExternalStore(abonnieren, kabelWerteHolen, kabelWerteHolen)
}
