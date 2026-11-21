import { useSyncExternalStore } from 'react'
import { idbAendern, idbHolenStreng } from '../speicher/idb'
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
/** zählt Lese- und Schreibvorgänge; ein Leseergebnis gilt nur, wenn seitdem nichts Neueres kam */
let stand = 0

/** Stand aus IndexedDB übernehmen (beim Start und wenn ein anderer Tab etwas ändert).
 *  Bei Lesefehlern bleibt der letzte bekannte Stand erhalten. */
async function neuLaden() {
  const nr = ++stand
  try {
    const v = bereinigen(await idbHolenStreng<unknown>(SCHLUESSEL))
    if (nr !== stand) return
    aktuell = v
    melden()
  } catch { /* letzten Stand behalten */ }
}

const kanal = typeof BroadcastChannel === 'function' ? new BroadcastChannel(SCHLUESSEL) : undefined
if (kanal) kanal.onmessage = () => void neuLaden()
if (typeof indexedDB !== 'undefined') void neuLaden()

export const kabelWerteHolen = () => aktuell

/** Änderung auf den gespeicherten (nicht den zwischengespeicherten) Stand anwenden,
 *  atomar in IndexedDB. Wirft, wenn der Browser nicht speichern konnte; der
 *  angezeigte Stand ändert sich dann nicht. */
async function aendern(f: (alt: KabelWerte) => KabelWerte) {
  const nr = ++stand
  let neu: KabelWerte
  try {
    neu = await idbAendern(SCHLUESSEL, (alt) => f(bereinigen(alt)))
  } catch {
    throw new Error('Die Kabelwerte konnten im Browser nicht gespeichert werden (Speicher voll oder gesperrt).')
  }
  if (nr === stand) {
    aktuell = neu
    melden()
  } else void neuLaden()
  kanal?.postMessage('geaendert')
}

/** Eigenen Wert merken (Standardwerte und schon bekannte werden ignoriert). */
export function kabelWertMerken(feld: KabelFeld, wert: string) {
  const t = wert.trim()
  if (!t || KABEL_STANDARD[feld].includes(t) || aktuell[feld].includes(t)) return Promise.resolve()
  return aendern((alt) => (alt[feld].includes(t) ? alt : { ...alt, [feld]: [t, ...alt[feld]].slice(0, MAX) }))
}

export function kabelWertVergessen(feld: KabelFeld, wert: string) {
  return aendern((alt) => ({ ...alt, [feld]: alt[feld].filter((x) => x !== wert) }))
}

function abonnieren(h: () => void) {
  hoerer.add(h)
  return () => { hoerer.delete(h) }
}

export function useKabelWerte(): KabelWerte {
  return useSyncExternalStore(abonnieren, kabelWerteHolen, kabelWerteHolen)
}
