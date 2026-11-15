import { describe, expect, it } from 'vitest'
import { BEISPIEL_YAML } from '../model/beispiel'
import { parseYaml, toYaml, YamlFehler } from '../model/yaml'
import { analysiere } from '../model/analyse'
import { hinzufuegen, aktualisieren, entfernen, istVorfahr } from '../model/ops'
import { zeichnePlan } from '../schematic/render'

describe('YAML', () => {
  it('Beispiel lässt sich parsen und ohne Verlust zurückschreiben', () => {
    const p = parseYaml(BEISPIEL_YAML)
    expect(p.komponenten).toHaveLength(24)
    expect(parseYaml(toYaml(p))).toEqual(p)
  })
  it('Querschnitt mit Komma bleibt erhalten', () => {
    const p = parseYaml(BEISPIEL_YAML)
    expect(p.komponenten.find((k) => k.id === 'E1')!.kabel!.querschnitt).toBe('3x1,5')
  })
  it('meldet Syntaxfehler mit Zeile', () => {
    try { parseYaml('komponenten:\n  - id: X1\n   typ: [') ; expect.fail() } catch (e) {
      expect(e).toBeInstanceOf(YamlFehler)
    }
  })
  it('lehnt ungültige Pole ab', () => {
    expect(() => parseYaml('komponenten:\n  - { id: F1, typ: ls, pole: 2 }')).toThrow(/pole/)
  })
})

describe('Analyse', () => {
  it('Beispiel ist fehlerfrei und leitet Leiter ab', () => {
    const a = analysiere(parseYaml(BEISPIEL_YAML))
    expect(a.meldungen.filter((m) => m.stufe !== 'info')).toEqual([])
    expect(a.knoten.get('E2')!.leiter).toEqual(['L2', 'N', 'PE'])
    expect(a.knoten.get('G1')!.leiter).toEqual(['L+', 'L-'])
    expect(a.knoten.get('E5')!.leiter).toHaveLength(5)
  })
  it('erkennt Kreise und fehlende Quellen', () => {
    const a = analysiere(parseYaml(`komponenten:
  - { id: A, typ: ls, quelle: B }
  - { id: B, typ: ls, quelle: A }
  - { id: C, typ: ls, quelle: XYZ }`))
    expect(a.meldungen.some((m) => m.text.includes('Kreis'))).toBe(true)
    expect(a.meldungen.some((m) => m.text.includes('existiert nicht'))).toBe(true)
  })
  it('warnt bei 3-polig unter 1-polig', () => {
    const a = analysiere(parseYaml(`komponenten:
  - { id: X1, typ: hausanschluss }
  - { id: F1, typ: ls, quelle: X1, phase: L2 }
  - { id: E1, typ: wallbox, quelle: F1 }`))
    expect(a.knoten.get('E1')!.leiter).toEqual(['L2', 'N', 'PE'])
    expect(a.meldungen.some((m) => m.id === 'E1')).toBe(true)
  })
})

describe('Operationen', () => {
  it('hinzufügen, umbenennen, löschen', () => {
    let p = parseYaml(BEISPIEL_YAML)
    const r = hinzufuegen(p, 'ls', { x: 0, y: 0 }, 'Q1')
    expect(r.id).toBe('F12')
    p = aktualisieren(r.projekt, 'Q1', { ...r.projekt.komponenten.find((k) => k.id === 'Q1')!, id: 'Q9' })
    expect(p.komponenten.filter((k) => k.quelle === 'Q9').length).toBeGreaterThan(3)
    expect(istVorfahr(p, 'Q9', 'E1')).toBe(true)
    p = entfernen(p, ['Q9'])
    expect(p.komponenten.some((k) => k.quelle === 'Q9')).toBe(false)
  })
})

describe('Plan', () => {
  it('erzeugt einpoligen und allpoligen Plan', () => {
    const p = parseYaml(BEISPIEL_YAML)
    const a = analysiere(p)
    for (const modus of ['einpolig', 'allpolig'] as const) {
      const plan = zeichnePlan(a, { modus, farbig: true, netz: p.netz })
      expect(plan.breite).toBeGreaterThan(100)
      expect(plan.inhalt).toContain('-F11')
      expect(plan.inhalt).not.toContain('NaN')
      expect(plan.inhalt).toContain('Stromkreis')
      const baum = zeichnePlan(a, { modus, farbig: true, netz: p.netz, anordnung: 'baum' })
      expect(baum.inhalt).not.toContain('Stromkreis')
      expect(baum.inhalt).not.toContain('NaN')
    }
  })
})
