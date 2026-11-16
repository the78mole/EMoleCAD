import { describe, expect, it } from 'vitest'
import { analysiere } from '../model/analyse'
import { zeichnePlan } from '../schematic/render'
import { steuerleitungen } from './fixtures'

/** y-Position einer Beschriftung im Plan */
function textY(svg: string, text: string): number {
  const m = svg.match(new RegExp(`<text x="[\\d.-]+" y="([\\d.-]+)"[^>]*>${text}</text>`))
  if (!m) throw new Error(`Text ${text} fehlt`)
  return Number(m[1])
}

const STRICH = 'stroke-dasharray="1.6 0.6 0.3 0.6"'

describe('Abgänge hinter dem Zähler', () => {
  for (const modus of ['einpolig', 'allpolig'] as const) {
    it(`werden nach unten aufgebaut, Endverbraucher stehen in einer Zeile (${modus})`, () => {
      const p = steuerleitungen()
      const svg = zeichnePlan(analysiere(p), { modus, farbig: true, netz: p.netz, daten: p.datenverbindungen, tabelle: true }).inhalt
      // Schutzorgane oben, Verbraucher unten
      expect(textY(svg, '-XD2')).toBeLessThan(textY(svg, '-FB1'))
      expect(textY(svg, '-FB1')).toBeLessThan(textY(svg, '-FC6'))
      expect(textY(svg, '-FC6')).toBeLessThan(textY(svg, '-XD4'))
      // alle Endverbraucher in der untersten Zeile direkt über der Tabelle
      const y = textY(svg, '-XD4')
      for (const bmk of ['-XD5', '-EB1', '-EA1', '-XD6', '-GC1', '-CC1', '-EG1']) expect(textY(svg, bmk), bmk).toBe(y)
      expect(textY(svg, 'Stromkreis')).toBeGreaterThan(y)
    })
  }
})

describe('Steuerleitungen', () => {
  it('laufen rechtwinklig über einen Kanal unter den Endverbrauchern', () => {
    const p = steuerleitungen()
    const svg = zeichnePlan(analysiere(p), { modus: 'einpolig', farbig: true, netz: p.netz, daten: p.datenverbindungen, tabelle: true }).inhalt
    const pfade = [...svg.matchAll(new RegExp(`<path d="M ([^"]+)"[^>]*${STRICH}`, 'g'))].map((m) => m[1].split(' L ').map((pp) => pp.split(' ').map(Number)))
    const unten = textY(svg, '-XD4')
    const tabelle = textY(svg, 'Stromkreis')
    // fünf Steuersignal-Leitungen der Steuerbox über den Kanal
    const kanal = pfade.filter((pk) => pk.some(([, y]) => y > unten + 5 && y < tabelle))
    expect(kanal).toHaveLength(5)
    for (const pk of kanal) {
      for (let i = 1; i < pk.length; i++) {
        const [x0, y0] = pk[i - 1], [x1, y1] = pk[i]
        expect(Math.abs(x0 - x1) < 0.01 || Math.abs(y0 - y1) < 0.01).toBe(true)
      }
    }
    // jede Leitung hat ihre eigene Spur
    const spuren = kanal.map((pk) => Math.max(...pk.map(([, y]) => y)))
    expect(new Set(spuren).size).toBe(5)
  })
})

describe('Verbraucher-Schaltzeichen', () => {
  it('Steckdose, Leuchte und Herd nach DIN EN 60617', () => {
    const p = steuerleitungen()
    const svg = zeichnePlan(analysiere(p), { modus: 'einpolig', farbig: true, netz: p.netz, tabelle: true }).inhalt
    expect(svg.match(/A 3 3 0 0 1/g)?.length).toBe(2) // zwei Steckdosen
    expect(svg).toContain('r="1"') // Kochstellen des Herds
  })
})
