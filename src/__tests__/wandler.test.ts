import { describe, expect, it } from 'vitest'
import { analysiere } from '../model/analyse'
import { BEISPIEL_WANDLER_YAML } from '../model/beispielWandler'
import { klemmenText } from '../model/library'
import { datenVerbinden, datenSetzen } from '../model/ops'
import { parseYaml, toYaml } from '../model/yaml'
import { einspeiseKette, zeichnePlan, zuege } from '../schematic/render'
import { zeichnePlaene } from '../schematic/blaetter'

const projekt = () => parseYaml(BEISPIEL_WANDLER_YAML)

describe('Wandlermessung', () => {
  it('Beispiel ist ohne Warnungen', () => {
    const a = analysiere(projekt())
    expect(a.meldungen.filter((m) => m.stufe !== 'info')).toEqual([])
    expect(a.hilfs.map((h) => h.k.id)).toEqual(['XT1', 'XD2', 'XD3'])
    // Klemmleisten gehören nicht zum Strompfad
    expect(a.wurzeln.map((w) => w.k.id)).toEqual(['XD1'])
  })

  it('Wandler, Zähler, Schalter und Schütz bilden die Einspeisekette', () => {
    const a = analysiere(projekt())
    expect(einspeiseKette(a.knoten.get('XD1')!).map((k) => k.k.id)).toEqual(['XD1', 'BE2', 'PG1', 'QB1', 'BE1', 'QA1', 'WD1'])
  })

  it('fasst Verbindungen über Klemmleisten zu einem Zug zusammen', () => {
    const p = projekt()
    const z = zuege(p.datenverbindungen!, analysiere(p))
    const fw = z.find((d) => d.von === 'BE1' && d.nach === 'TF1' && d.typ === 'wandler')!
    expect(fw.klemmen!.map((k) => k.k.id)).toEqual(['XD2', 'XD3'])
    expect(fw.kabel).toBe('Ölflex Classic 110 7G1,5')
    expect(fw.klemmeNach).toBe('I-L1, I-L2, I-L3')
    const abr = z.find((d) => d.von === 'BE2')!
    expect(abr.nach).toBe('PG1')
    expect(abr.klemmen!.map((k) => k.k.id)).toEqual(['XT1'])
    // keine Verbindung endet an einer Klemmleiste
    expect(z.every((d) => !d.von.startsWith('X') && !d.nach.startsWith('X'))).toBe(true)
  })

  it('Klemmenangaben aus den benannten Anschlüssen des Messumformers', () => {
    const p = { anschluesse: 'UH:17/18, I-L1:1/3, I-L2:4/6, out1:20/21' }
    expect(klemmenText('out1', p)).toBe('out1 20/21')
    expect(klemmenText('I-L1, I-L2', p)).toBe('1/3, 4/6')
    expect(klemmenText('X9', p)).toBe('X9')
  })

  for (const modus of ['einpolig', 'allpolig'] as const) {
    it(`zeichnet Wandler, Klemmleisten, Kabel und Schrank (${modus})`, () => {
      const p = projekt()
      const svg = zeichnePlan(analysiere(p), { modus, farbig: true, netz: p.netz, daten: p.datenverbindungen, tabelle: true }).inhalt
      expect(svg).not.toContain('NaN')
      expect(svg).toContain('>k/l  Ölflex Classic 110 7G1,5<')
      for (const t of ['-BE1', '-BE2', '-QA1', '-TF1', '-KE1', '-XT1', '-XD2', '-XD3', 'Messumformerschrank', '1/3, 4/6, 7/9', '2, 5, 8, 11', 'out1 20/21', '17/18', 'kWh', 'U-Pfad: 3x 10 A'])
        expect(svg, t).toContain(`>${t}`)
      // Leitungsarten mit eigener Farbe
      expect(svg).toContain('stroke="#c2410c"')
      expect(svg).toContain('stroke="#0277bd"')
      expect(svg).toContain('stroke="#b45309"')
      // Klemmleisten stehen nicht als eigene Spalte in der Stromkreistabelle
      for (const x of ['-XT1', '-XD2', '-XD3']) expect(svg.split(`>${x}<`).length - 1, x).toBe(1)
    })
  }

  it('Mehrblattplan mit Klemmleisten', () => {
    const p = projekt()
    const plaene = zeichnePlaene(analysiere(p), { modus: 'einpolig', farbig: true, netz: p.netz, daten: p.datenverbindungen, tabelle: true, maxAbgaenge: 2 })
    expect(plaene.length).toBeGreaterThan(1)
    for (const pl of plaene) expect(pl.inhalt).not.toContain('NaN')
  })

  it('YAML behält Leitungsart, Kabel und Anschlussklemmen', () => {
    const p = projekt()
    const q = parseYaml(toYaml(p))
    expect(q.datenverbindungen).toEqual(p.datenverbindungen)
    expect(q.komponenten.find((k) => k.id === 'BE2')!.params!.klasse).toBe('0,5S')
    expect(() => parseYaml('datenverbindungen:\n  - { von: A, nach: B, typ: quatsch }')).toThrow(/typ/)
  })

  it('Editor: Leitungsart wird beim Verbinden vorgeschlagen und lässt sich ändern', () => {
    let p = parseYaml(`komponenten:
  - { id: BE1, typ: stromwandler }
  - { id: PG1, typ: zaehler, params: { messart: halbindirekt } }
  - { id: TF1, typ: messumformer }
  - { id: KE1, typ: fernwirk }`)
    p = datenVerbinden(p, 'BE1', 'PG1')
    p = datenVerbinden(p, 'TF1', 'KE1')
    expect(p.datenverbindungen).toEqual([{ von: 'BE1', nach: 'PG1', typ: 'wandler' }, { von: 'TF1', nach: 'KE1', typ: 'analog', art: '4...20 mA' }])
    p = datenSetzen(p, 'TF1', 'KE1', { klemmeVon: 'out2', kabel: 'LiYCY 2x0,75' })
    expect(p.datenverbindungen![1]).toEqual({ von: 'TF1', nach: 'KE1', typ: 'analog', art: '4...20 mA', klemmeVon: 'out2', kabel: 'LiYCY 2x0,75' })
    p = datenSetzen(p, 'TF1', 'KE1', { typ: 'daten', kabel: '' })
    expect(p.datenverbindungen![1]).toEqual({ von: 'TF1', nach: 'KE1', art: '4...20 mA', klemmeVon: 'out2' })
  })

  it('meldet Klemmleisten ohne Weiterführung und Wandlerzähler ohne Wandler', () => {
    const a = analysiere(parseYaml(`komponenten:
  - { id: XD1, typ: hausanschluss }
  - { id: PG1, typ: zaehler, quelle: XD1, params: { messart: halbindirekt } }
  - { id: XD9, typ: klemmleiste }
datenverbindungen:
  - { von: PG1, nach: XD9 }`))
    expect(a.meldungen.map((m) => m.text).join('\n')).toMatch(/XD9: Klemmleiste hat 1 Verbindung/)
    expect(a.meldungen.map((m) => m.text).join('\n')).toMatch(/PG1: Wandlerzähler ohne Wandler-Messleitung/)
  })
})
