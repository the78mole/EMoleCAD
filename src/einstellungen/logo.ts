import { useSyncExternalStore } from 'react'

/**
 * Firmen-/Ersteller-Logo für das Schriftfeld. App-weite Einstellung: liegt nur
 * im Browser (localStorage), nicht im Projekt-YAML, und wird nirgends hochgeladen.
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
/** Obergrenze der gespeicherten data:-URL; localStorage fasst je Origin nur ~5 MB */
const MAX_ZEICHEN = 1_500_000
export const LOGO_TYPEN = ['image/png', 'image/jpeg', 'image/svg+xml']

function istLogo(v: unknown): v is Logo {
  const l = v as Logo
  return !!l && typeof l.daten === 'string' && /^data:image\/(png|jpeg|svg\+xml)[;,]/.test(l.daten) && l.breite > 0 && l.hoehe > 0
}

function lesen(): Logo | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? 'null')
    return istLogo(v) ? v : undefined
  } catch {
    return undefined
  }
}

let aktuell = lesen()
const hoerer = new Set<() => void>()
const melden = () => hoerer.forEach((h) => h())

export const logoHolen = () => aktuell

/** Logo speichern (undefined = entfernen). Wirft, wenn der Browser-Speicher voll ist. */
export function logoSetzen(l: Logo | undefined) {
  try {
    if (l) localStorage.setItem(SCHLUESSEL, JSON.stringify(l))
    else localStorage.removeItem(SCHLUESSEL)
  } catch {
    if (l) throw new Error('Das Logo passt nicht in den Browser-Speicher. Bitte ein kleineres Bild wählen.')
  }
  aktuell = l
  melden()
}

function abonnieren(h: () => void) {
  hoerer.add(h)
  // Änderung in einem anderen Tab übernehmen
  const ausAnderemTab = (e: StorageEvent) => { if (e.key === SCHLUESSEL) { aktuell = lesen(); melden() } }
  window.addEventListener('storage', ausAnderemTab)
  return () => { hoerer.delete(h); window.removeEventListener('storage', ausAnderemTab) }
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

/** Größe eines SVG aus width/height bzw. viewBox (Bilder ohne Angabe liefern im Browser 0 oder 300×150) */
export function svgGroesse(text: string): { breite: number; hoehe: number } | undefined {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const el = doc.documentElement
  if (el.nodeName !== 'svg') return undefined
  const vb = (el.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { breite: vb[2], hoehe: vb[3] }
  const w = parseFloat(el.getAttribute('width') ?? ''), h = parseFloat(el.getAttribute('height') ?? '')
  return w > 0 && h > 0 ? { breite: w, hoehe: h } : undefined
}

function base64(text: string) {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Datei einlesen: Rasterbilder verkleinern, SVG unverändert (bleibt im PDF vektoriell). */
export async function logoAusDatei(f: File): Promise<Logo> {
  const typ = f.type || (/\.svg$/i.test(f.name) ? 'image/svg+xml' : '')
  if (!LOGO_TYPEN.includes(typ)) throw new Error('Bitte ein PNG-, JPG- oder SVG-Bild wählen.')
  let logo: Logo
  if (typ === 'image/svg+xml') {
    const text = await f.text()
    const g = svgGroesse(text)
    if (!g) throw new Error('Die SVG-Datei ist ungültig oder hat weder viewBox noch width/height.')
    logo = { daten: `data:image/svg+xml;base64,${base64(text)}`, ...g, name: f.name }
  } else {
    const url = await alsDataUrl(f)
    const img = await bildLaden(url)
    const k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight))
    const breite = Math.max(1, Math.round(img.naturalWidth * k)), hoehe = Math.max(1, Math.round(img.naturalHeight * k))
    let daten = url
    if (k < 1) {
      const c = document.createElement('canvas')
      c.width = breite
      c.height = hoehe
      c.getContext('2d')!.drawImage(img, 0, 0, breite, hoehe)
      daten = typ === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.9) : c.toDataURL('image/png')
    }
    logo = { daten, breite, hoehe, name: f.name }
  }
  if (logo.daten.length > MAX_ZEICHEN) throw new Error('Das Logo ist zu groß (max. ca. 1 MB). Bitte ein kleineres Bild wählen.')
  return logo
}
