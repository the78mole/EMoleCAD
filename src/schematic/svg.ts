/** Minimaler SVG-Baukasten. Einheiten: mm (Papiermaßstab 1:1 vor Skalierung). */
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Zeichen außerhalb von Latin-1 kann der PDF-Export mit den Standardschriften nicht darstellen:
 *  jsPDF schreibt den ganzen Text dann als UTF-16, was gesperrte Schrift mit „!’“ ergibt.
 *  Nur für den PDF-Export; SVG und Vorschau behalten den Originaltext. */
const ERSATZ: Record<string, string> = { '→': '->', '←': '<-', '…': '...', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '„': '"', '≥': '>=', '≤': '<=', '−': '-' }
// oxlint-disable-next-line no-control-regex -- Platzhalter bzw. Latin-1-Bereich bewusst
export const pdfText = (s: string) => s.replace(/[^\u0000-\u00ff]/g, (c) => ERSATZ[c] ?? '?')

const f = (v: number) => (Math.round(v * 100) / 100).toString()

export interface StrichOpt {
  farbe?: string
  breite?: number
  strich?: string
}

export interface TextOpt {
  groesse?: number
  anker?: 'start' | 'middle' | 'end'
  fett?: boolean
  drehung?: number
  farbe?: string
}

export class Svg {
  teile: string[] = []

  linie(x1: number, y1: number, x2: number, y2: number, o: StrichOpt = {}) {
    this.teile.push(
      `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${o.farbe ?? '#000'}" stroke-width="${f(o.breite ?? 0.35)}"${o.strich ? ` stroke-dasharray="${o.strich}"` : ''} stroke-linecap="round"/>`,
    )
  }

  pfad(d: string, o: StrichOpt & { fuellung?: string } = {}) {
    this.teile.push(
      `<path d="${d}" fill="${o.fuellung ?? 'none'}" stroke="${o.farbe ?? '#000'}" stroke-width="${f(o.breite ?? 0.35)}"${o.strich ? ` stroke-dasharray="${o.strich}"` : ''} stroke-linejoin="round"/>`,
    )
  }

  rechteck(x: number, y: number, w: number, h: number, o: StrichOpt & { fuellung?: string } = {}) {
    this.teile.push(
      `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${o.fuellung ?? '#fff'}" stroke="${o.farbe ?? '#000'}" stroke-width="${f(o.breite ?? 0.35)}"${o.strich ? ` stroke-dasharray="${o.strich}"` : ''}/>`,
    )
  }

  kreis(x: number, y: number, r: number, o: StrichOpt & { fuellung?: string } = {}) {
    this.teile.push(
      `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${o.fuellung ?? 'none'}" stroke="${o.farbe ?? '#000'}" stroke-width="${f(o.breite ?? 0.35)}"${o.strich ? ` stroke-dasharray="${o.strich}"` : ''}/>`,
    )
  }

  ellipse(x: number, y: number, rx: number, ry: number, o: StrichOpt = {}) {
    this.teile.push(
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="none" stroke="${o.farbe ?? '#000'}" stroke-width="${f(o.breite ?? 0.35)}"/>`,
    )
  }

  punkt(x: number, y: number, farbe = '#000', r = 0.6) {
    this.teile.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${farbe}" stroke="none"/>`)
  }

  text(x: number, y: number, s: string, o: TextOpt = {}) {
    if (!s) return
    const tr = o.drehung ? ` transform="rotate(${o.drehung} ${f(x)} ${f(y)})"` : ''
    this.teile.push(
      `<text x="${f(x)}" y="${f(y)}" font-family="Helvetica, Arial, sans-serif" font-size="${f(o.groesse ?? 2.5)}"${o.fett ? ' font-weight="bold"' : ''} text-anchor="${o.anker ?? 'start'}" fill="${o.farbe ?? '#000'}"${tr}>${esc(s)}</text>`,
    )
  }

  /** Bild (data:-URL), proportional eingepasst und zentriert im Rechteck */
  bild(x: number, y: number, w: number, h: number, href: string) {
    this.teile.push(`<image x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="xMidYMid meet" href="${esc(href)}"/>`)
  }

  roh(s: string) {
    this.teile.push(s)
  }

  gruppe(inhalt: Svg, transform: string) {
    this.teile.push(`<g transform="${transform}">${inhalt.toString()}</g>`)
  }

  toString() {
    return this.teile.join('\n')
  }
}

/** Wandelt den SVG-Text eines Blatts in ein DOM-Element, ohne innerHTML:
 *  Der XML-Parser führt keine Skripte aus und hängt nichts ans Dokument. */
export function svgElement(svg: string, dok: Document = document): SVGSVGElement {
  // In XML verbotene Steuerzeichen (z.B. aus eingefügtem Text) entfernen, sonst scheitert der Parser
  // oxlint-disable-next-line no-control-regex -- Steuerzeichen bewusst
  const xml = new DOMParser().parseFromString(svg.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, ''), 'image/svg+xml')
  const wurzel = xml.documentElement
  if (wurzel.nodeName !== 'svg' || xml.getElementsByTagName('parsererror').length) throw new Error('Ungültiges SVG')
  return dok.importNode(wurzel, true) as unknown as SVGSVGElement
}
