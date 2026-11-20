import { describe, expect, it } from 'vitest'
import { analysiere } from '../model/analyse'
import { zeichnePlan } from '../schematic/render'
import { steuerleitungen } from './fixtures'
import { parseYaml } from '../model/yaml'
import { BEISPIEL_YAML } from '../model/beispiel'

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
    // Endpunkte: Anfang an der Steuerbox (oben am Kasten), Ende an den Zielgeräten
    const xVon = (bmk: string) => Number(svg.match(new RegExp(`<text x="([\\d.-]+)" y="[\\d.-]+"[^>]*>${bmk}</text>`))![1])
    const ziele = ['-TB1', '-XD6', '-CC1', '-EG1', '-FB1'].map(xVon)
    for (const pk of kanal) {
      const [ax] = pk[0], [bx] = pk[pk.length - 1]
      // Beschriftung steht rechts neben dem Gerät: Anschluss liegt kurz links davon
      expect(Math.abs(ax - xVon('-KE2')) < 8 || Math.abs(bx - xVon('-KE2')) < 8).toBe(true)
      const andere = Math.abs(ax - xVon('-KE2')) < 8 ? bx : ax
      expect(ziele.some((z) => Math.abs(andere - z) < 8)).toBe(true)
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

describe('Leiterkennzeichnung (einpolig)', () => {
  it('jede Zuleitung trägt die Außenleiterzahl, auch bei Geräten mit Abgängen und in der Einspeisekette', () => {
    const p = parseYaml(BEISPIEL_YAML)
    const a = analysiere(p)
    const svg = zeichnePlan(a, { modus: 'einpolig', farbig: true, netz: p.netz, tabelle: true }).inhalt
    const dreiphasig = [...a.knoten.values()].filter((n) => n.eltern && !n.def.potential && !n.dc && n.leiter.filter((l) => l.startsWith('L')).length === 3)
    // u.a. FI mit Abgängen, Hybrid-Wechselrichter mit PV/Speicher, Zähler und SLS in der Einspeisekette
    for (const bmk of ['-FB1', '-TB1', '-PG1', '-FC1']) expect(dreiphasig.map((n) => n.bmk)).toContain(bmk)
    expect(svg.match(/>3<\/text>/g) ?? []).toHaveLength(dreiphasig.length)
  })
})

describe('Datenleitungen an Geräten mit Abgängen', () => {
  for (const modus of ['einpolig', 'allpolig'] as const) {
    it(`werden auf der Seite der Gegenstelle angeschlossen (${modus})`, () => {
      const p = parseYaml(BEISPIEL_YAML)
      p.datenverbindungen = [{ von: 'PG1', nach: 'TB1', art: 'Modbus RTU' }]
      const svg = zeichnePlan(analysiere(p), { modus, farbig: true, netz: p.netz, daten: p.datenverbindungen, tabelle: true }).inhalt
      const pfad = svg.match(new RegExp(`<path d="M ([^"]+)"[^>]*${STRICH}`))![1].split(' L ').map((pp) => pp.split(' ').map(Number))
      const xTB1 = Number(svg.match(/<text x="([\d.-]+)" y="[\d.-]+"[^>]*>-TB1<\/text>/)![1])
      // Ende am Wechselrichter: links vom Gerät, der Weg kommt von links und kreuzt das Gerät nicht
      const [ex] = pfad[0]
      expect(ex).toBeLessThan(xTB1 - 8)
      expect(Math.max(...pfad.map(([x]) => x))).toBeLessThan(xTB1 - 8)
    })
  }
})
