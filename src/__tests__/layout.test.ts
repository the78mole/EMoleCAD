import { describe, expect, it } from 'vitest'
import { analysiere } from '../model/analyse'
import { zeichnePlan } from '../schematic/render'
import { einfamilienhaus, steuerleitungen } from './fixtures'
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

/** Pfade der Informationsverbindungen als Punktlisten */
function datenPfade(svg: string): number[][][] {
  return [...svg.matchAll(new RegExp(`<path d="M ([^"]+)"[^>]*${STRICH}`, 'g'))].map((m) => m[1].split(' L ').map((pp) => pp.split(' ').map(Number)))
}
const xVon = (svg: string, bmk: string) => Number(svg.match(new RegExp(`<text x="([\\d.-]+)" y="[\\d.-]+"[^>]*>${bmk}</text>`))![1])

describe('Datenleitungen aus der Einspeisekette in die Verteilung (#33)', () => {
  for (const modus of ['einpolig', 'allpolig'] as const) {
    it(`laufen nicht quer durch die Schutzorgane, sondern über den Kanal (${modus})`, () => {
      const p = parseYaml(BEISPIEL_YAML)
      p.datenverbindungen = [{ von: 'PG1', nach: 'TB1', art: 'Modbus RTU' }]
      const svg = zeichnePlan(analysiere(p), { modus, farbig: true, netz: p.netz, daten: p.datenverbindungen, tabelle: true }).inhalt
      const [pfad] = datenPfade(svg)
      // Schutzorgane der Verteilung (ohne -FC3 direkt über dem Wechselrichter): Schaltzeichen links von der Beschriftung
      const schutz = ['-FB1', '-FB2', '-FC4', '-FC5', '-FC6', '-FC7', '-FC8', '-FC9'].map((b) => xVon(svg, b))
      const yVerbraucher = textY(svg, '-EA1')
      for (let i = 1; i < pfad.length; i++) {
        const [x0, y0] = pfad[i - 1], [x1, y1] = pfad[i]
        expect(Math.abs(x0 - x1) < 0.01 || Math.abs(y0 - y1) < 0.01).toBe(true)
        // waagerechte Stücke oberhalb der Endverbraucher kreuzen kein Schutzorgan
        if (Math.abs(y0 - y1) < 0.01 && y0 < yVerbraucher) {
          for (const x of schutz) expect(Math.max(x0, x1) < x - 12 || Math.min(x0, x1) > x).toBe(true)
        }
      }
      // durch den Kanal unter den Endverbrauchern
      expect(Math.max(...pfad.map(([, y]) => y))).toBeGreaterThan(yVerbraucher + 5)
      // Beschriftung nicht neben einem Schutzorgan
      expect(textY(svg, 'Modbus RTU')).toBeGreaterThan(yVerbraucher)
    })
  }

  it('Geräte der Kette unterhalb des ungezählten Bereichs laufen über diesen hinweg', () => {
    const p = einfamilienhaus()
    p.datenverbindungen = [...(p.datenverbindungen ?? []), { von: 'XD1', nach: 'CC1', art: 'Test' }]
    const svg = zeichnePlan(analysiere(p), { modus: 'einpolig', farbig: true, netz: p.netz, daten: p.datenverbindungen, tabelle: true }).inhalt
    const pfad = datenPfade(svg).find((pk) => pk.some(([x]) => Math.abs(x - xVon(svg, '-CC1')) < 10) && pk.some(([x]) => x < xVon(svg, '-KE1')))!
    const yKE = textY(svg, '-KE1')
    const xKE = xVon(svg, '-KE2') + 10
    // im Bereich von SMGW und Steuerbox nur oberhalb der Geräte
    for (let i = 1; i < pfad.length; i++) {
      const [x0, y0] = pfad[i - 1], [x1, y1] = pfad[i]
      if (Math.abs(y0 - y1) < 0.01 && Math.max(x0, x1) > xVon(svg, '-KE1') - 8 && Math.min(x0, x1) < xKE) expect(y0).toBeLessThan(yKE - 4)
    }
  })
})

describe('Potentialausgleich und Steuerleitungen (#33)', () => {
  for (const modus of ['einpolig', 'allpolig'] as const) {
    it(`liegen auf getrennten Spuren (${modus})`, () => {
      const p = einfamilienhaus()
      const a = analysiere(p)
      // Wechselrichter und Speicher dürfen an den Potentialausgleich
      expect(a.meldungen).toEqual([])
      const svg = zeichnePlan(a, { modus, farbig: true, netz: p.netz, daten: p.datenverbindungen, pa: p.potentialausgleich, tabelle: true }).inhalt
      const schiene = svg.match(/<rect x="[\d.-]+" y="([\d.-]+)" width="[\d.-]+" height="1.2" fill="#fff" stroke="#2e9e3e"/)
      const ySchiene = Number(schiene![1]) + 0.6
      const pfade = datenPfade(svg)
      const kanalUnten = Math.max(...pfade.flatMap((pk) => pk.map(([, y]) => y)))
      expect(ySchiene).toBeGreaterThan(kanalUnten + 3)
      // PA-Leitungen: keine waagerechten Stücke auf Höhe einer Steuerleitungsspur
      const spuren = new Set(pfade.flatMap((pk) => pk.slice(1).filter(([, y], i) => Math.abs(y - pk[i][1]) < 0.01).map(([, y]) => y)))
      const pa = [...svg.matchAll(/<path d="M ([\d.-]+) ([\d.-]+) H ([\d.-]+) V ([\d.-]+)" fill="none" stroke="#2e9e3e"/g)]
      expect(pa.length).toBeGreaterThan(0)
      for (const m of pa) for (const y of spuren) expect(Math.abs(Number(m[2]) - y)).toBeGreaterThan(0.5)
      // Wechselrichter mit Abgängen: eigene Senkrechte, nicht die des PV-Generators
      const xe = pa.map((m) => Number(m[3]))
      expect(new Set(xe).size).toBe(xe.length)
      // Netzangabe unter der Schiene
      expect(textY(svg, modus === 'einpolig' ? 'TN-C-S  3/N/PE ~50 Hz' : 'TN-C-S  230/400 V')).toBeGreaterThan(ySchiene + 2)
    })
  }
})
