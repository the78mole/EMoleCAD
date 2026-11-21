import { useSyncExternalStore } from 'react'
import { idbHolen, idbLoeschenStreng, idbSchreibenStreng } from '../speicher/idb'
import { svgGroesse } from './svgGroesse'

/**
 * Firmen-/Ersteller-Logo für das Schriftfeld. App-weite Einstellung: liegt nur
 * im Browser (IndexedDB, getrennt vom localStorage-Entwurf des Projekts), nicht
 * im Projekt-YAML, und wird nirgends hochgeladen.
 */
export interface Logo {
  /** Bild als data:-URL (PNG, JPEG oder SVG) */
  daten: string
  /** Seitenverhältnis-Grundlage in px */
  breite: number
  hoehe: number
  /** ursprünglicher Dateiname, nur zur Anzeige */
  name: string
}

// Präfix `molecad.` wie die übrigen internen Schlüssel
const SCHLUESSEL = 'molecad.logo'
/** Rasterbilder werden auf diese Kantenlänge verkleinert (reicht für 300 dpi bei ~40 mm) */
const MAX_PX = 800
/** Dateien darüber gar nicht erst einlesen/dekodieren */
const MAX_DATEI = 10 * 1024 * 1024
/** Obergrenze der gespeicherten data:-URL (hält Blätter, SVG- und PDF-Export klein) */
const MAX_ZEICHEN = 1_500_000
export const LOGO_TYPEN = ['image/png', 'image/jpeg', 'image/svg+xml']

function istLogo(v: unknown): v is Logo {
  const l = v as Logo
  return !!l && typeof l.daten === 'string' && /^data:image\/(png|jpeg|svg\+xml)[;,]/.test(l.daten) && l.breite > 0 && l.hoehe > 0
}

let aktuell: Logo | undefined
const hoerer = new Set<() => void>()
const melden = () => hoerer.forEach((h) => h())

/** Stand aus IndexedDB übernehmen (beim Start und wenn ein anderer Tab das Logo ändert) */
async function neuLaden() {
  const v = await idbHolen<unknown>(SCHLUESSEL)
  aktuell = istLogo(v) ? v : undefined
  melden()
}

// Andere Tabs benachrichtigen; der Kanal lebt unabhängig davon, ob gerade jemand abonniert hat
const kanal = typeof BroadcastChannel === 'function' ? new BroadcastChannel(SCHLUESSEL) : undefined
if (kanal) kanal.onmessage = () => void neuLaden()
if (typeof indexedDB !== 'undefined') void neuLaden()

export const logoHolen = () => aktuell

/** Logo speichern (undefined = entfernen). Wirft, wenn der Browser es nicht speichern konnte;
 *  der angezeigte Stand ändert sich dann nicht. */
export async function logoSetzen(l: Logo | undefined) {
  try {
    if (l) await idbSchreibenStreng(SCHLUESSEL, l)
    else await idbLoeschenStreng(SCHLUESSEL)
  } catch {
    throw new Error(l ? 'Das Logo konnte im Browser nicht gespeichert werden (Speicher voll oder gesperrt).' : 'Das Logo konnte nicht entfernt werden.')
  }
  aktuell = l
  melden()
  kanal?.postMessage('geaendert')
}

function abonnieren(h: () => void) {
  hoerer.add(h)
  return () => { hoerer.delete(h) }
}

export function useLogo(): Logo | undefined {
  return useSyncExternalStore(abonnieren, logoHolen, logoHolen)
}

const alsDataUrl = (f: Blob) => new Promise<string>((ok, fehler) => {
  const r = new FileReader()
  r.onload = () => ok(r.result as string)
  r.onerror = () => fehler(r.error)
  r.readAsDataURL(f)
})

const bildLaden = (url: string) => new Promise<HTMLImageElement>((ok, fehler) => {
  const i = new Image()
  i.onload = () => ok(i)
  i.onerror = () => fehler(new Error('Das Bild konnte nicht gelesen werden.'))
  i.src = url
})

function base64(text: string) {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Datei einlesen: Rasterbilder verkleinern, SVG unverändert (bleibt im PDF vektoriell). */
export async function logoAusDatei(f: File): Promise<Logo> {
  const typ = f.type || (/\.svg$/i.test(f.name) ? 'image/svg+xml' : '')
  if (!LOGO_TYPEN.includes(typ)) throw new Error('Bitte ein PNG-, JPG- oder SVG-Bild wählen.')
  if (f.size > MAX_DATEI) throw new Error('Die Datei ist zu groß (max. 10 MB).')
  let logo: Logo
  if (typ === 'image/svg+xml') {
    const text = await f.text()
    const g = svgGroesse(text)
    if (!g) throw new Error('Die Datei ist kein gültiges SVG.')
    logo = { daten: `data:image/svg+xml;base64,${base64(text)}`, ...g, name: f.name }
  } else {
    const url = URL.createObjectURL(f)
    try {
      const img = await bildLaden(url)
      const k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight))
      const breite = Math.max(1, Math.round(img.naturalWidth * k)), hoehe = Math.max(1, Math.round(img.naturalHeight * k))
      let daten: string
      if (k < 1) {
        const c = document.createElement('canvas')
        c.width = breite
        c.height = hoehe
        c.getContext('2d')!.drawImage(img, 0, 0, breite, hoehe)
        daten = typ === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.9) : c.toDataURL('image/png')
      } else {
        daten = await alsDataUrl(f)
      }
      logo = { daten, breite, hoehe, name: f.name }
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  if (logo.daten.length > MAX_ZEICHEN) throw new Error('Das Logo ist zu groß (max. ca. 1 MB). Bitte ein kleineres Bild wählen.')
  return logo
}
