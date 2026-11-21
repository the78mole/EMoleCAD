/** Seitenverhältnis-Grundlage eines SVG ohne DOM: Attribute des <svg>-Starttags auslesen. */

/** Umrechnung absoluter CSS-Einheiten in px (96 dpi) */
const EINHEIT: Record<string, number> = { '': 1, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16 }
/** Standardgröße, die Browser für ein SVG ohne Angaben verwenden */
export const SVG_STANDARD = { breite: 300, hoehe: 150 }

function attribut(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)
  return m ? (m[1] ?? m[2]) : undefined
}

function laenge(wert: string | undefined): number | undefined {
  const m = /^\s*([+]?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(wert ?? '')
  if (!m) return undefined
  const k = EINHEIT[m[2].toLowerCase()]
  const v = Number(m[1]) * (k ?? NaN)
  return v > 0 && isFinite(v) ? v : undefined
}

/** Größe aus viewBox, sonst width/height (Einheiten umgerechnet), sonst Browser-Standard 300×150.
 *  undefined, wenn kein <svg>-Element gefunden wird. */
export function svgGroesse(text: string): { breite: number; hoehe: number } | undefined {
  // erstes <svg>-Starttag außerhalb von Kommentaren suchen (Kommentare werden übersprungen, nicht entfernt)
  let tag: string | undefined
  for (const m of text.matchAll(/<!--[\s\S]*?(?:-->|$)|<svg(?=[\s>/])[^>]*>/gi)) {
    if (!m[0].startsWith('<!--')) { tag = m[0]; break }
  }
  if (!tag) return undefined
  const vb = (attribut(tag, 'viewBox') ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number)
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { breite: vb[2], hoehe: vb[3] }
  const w = laenge(attribut(tag, 'width')), h = laenge(attribut(tag, 'height'))
  return w && h ? { breite: w, hoehe: h } : { ...SVG_STANDARD }
}
