import { describe, expect, it } from 'vitest'
import { BEISPIEL_YAML } from '../model/beispiel'
import { parseYaml, toYaml, YamlFehler } from '../model/yaml'
import { analysiere } from '../model/analyse'
import { hinzufuegen, aktualisieren, entfernen, istVorfahr, neuNummerieren } from '../model/ops'
import { zeichnePlan } from '../schematic/render'

describe('YAML', () => {
  it('Beispiel lässt sich parsen und ohne Verlust zurückschreiben', () => {
    const p = parseYaml(BEISPIEL_YAML)
    expect(p.komponenten).toHaveLength(27)
    expect(parseYaml(toYaml(p))).toEqual(p)
  })
  it('Querschnitt mit Komma bleibt erhalten', () => {
    const p = parseYaml(BEISPIEL_YAML)
    expect(p.komponenten.find((k) => k.id === 'E2')!.kabel!.querschnitt).toBe('3x1,5')
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
    expect(a.knoten.get('E3')!.leiter).toEqual(['L2', 'N', 'PE'])
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
    expect(r.id).toBe('F11')
    p = aktualisieren(r.projekt, 'Q1', { ...r.projekt.komponenten.find((k) => k.id === 'Q1')!, id: 'Q9' })
    expect(p.komponenten.filter((k) => k.quelle === 'Q9').length).toBeGreaterThan(0)
    expect(istVorfahr(p, 'Q9', 'E1')).toBe(true)
    p = entfernen(p, ['Q9'])
    expect(p.komponenten.some((k) => k.quelle === 'Q9')).toBe(false)
  })
})

describe('Datenverbindungen', () => {
  it('werden gelesen, beim Umbenennen nachgezogen und beim Löschen entfernt', () => {
    let p = parseYaml(BEISPIEL_YAML)
    expect(p.datenverbindungen).toEqual([{ von: 'K1', nach: 'P1', art: 'LMN' }, { von: 'K2', nach: 'K1', art: 'CLS' }])
    p = aktualisieren(p, 'K1', { ...p.komponenten.find((k) => k.id === 'K1')!, id: 'K9' })
    expect(p.datenverbindungen!.every((d) => d.von !== 'K1' && d.nach !== 'K1')).toBe(true)
    p = entfernen(p, ['K9'])
    expect(p.datenverbindungen).toEqual([])
  })
  it('werden im Plan gezeichnet', () => {
    const p = parseYaml(BEISPIEL_YAML)
    const plan = zeichnePlan(analysiere(p), { modus: 'einpolig', farbig: true, netz: p.netz, daten: p.datenverbindungen })
    expect(plan.inhalt).toContain('LMN')
    expect(plan.inhalt).toContain('CLS')
  })
})

describe('Neu nummerieren', () => {
  it('vergibt Kennzeichen von links nach rechts in Baumreihenfolge', () => {
    let p = parseYaml(BEISPIEL_YAML)
    // Steuerbox im Editor links vom SMGW platzieren -> bekommt die kleinere Nummer
    p = { ...p, editor: { K1: { x: 500, y: 0 }, K2: { x: 100, y: 0 } } }
    const n = neuNummerieren(p)
    const typ = (id: string) => n.komponenten.find((k) => k.id === id)!.typ
    expect(typ('K1')).toBe('steuerbox')
    expect(typ('K2')).toBe('smgw')
    expect(n.datenverbindungen).toEqual([{ von: 'K2', nach: 'P1', art: 'LMN' }, { von: 'K1', nach: 'K2', art: 'CLS' }])
    expect(new Set(n.komponenten.map((k) => k.id)).size).toBe(n.komponenten.length)
    expect(analysiere(n).meldungen.filter((m) => m.stufe !== 'info')).toEqual([])
    // RCD vor seinen LS
    const ids = n.komponenten.filter((k) => k.typ === 'rcd' || k.quelle === n.komponenten.find((r) => r.typ === 'rcd')?.id).map((k) => k.id)
    expect(ids.length).toBeGreaterThan(1)
  })
  it('nummeriert zeilenweise von oben nach unten, dann von links nach rechts', () => {
    const p = parseYaml(BEISPIEL_YAML)
    const n = neuNummerieren({ ...p, editor: undefined })
    const typ = (id: string) => n.komponenten.find((k) => k.id === id)!.typ
    expect(typ('FA1')).toBe('spd')
    expect(typ('F1')).toBe('ls')
    // alle Geräte der oberen Verteilerreihe (RCDs, LS direkt an der HLAK) vor den LS darunter
    const nr = (k: { id: string }) => Number(k.id.slice(1))
    const oben = n.komponenten.filter((k) => k.quelle === 'X2').map(nr)
    const unten = n.komponenten.filter((k) => k.typ === 'ls' && k.quelle !== 'X2' && k.quelle !== 'W1').map(nr)
    expect(Math.max(...oben)).toBeLessThan(Math.min(...unten))
  })
})

describe('Festgeschriebene IDs', () => {
  it('bleiben beim Neu nummerieren erhalten und werden mitgezählt', () => {
    const p = parseYaml(BEISPIEL_YAML)
    // LS 6 A im Vorzählerbereich als F001 festschreiben
    const komponenten = p.komponenten.map((k) =>
      k.id === 'F1' ? { ...k, id: 'F001', fest: true } : k.quelle === 'F1' ? { ...k, quelle: 'F001' } : k)
    const n = neuNummerieren({ ...p, komponenten, editor: undefined })
    const f001 = n.komponenten.find((k) => k.id === 'F001')!
    expect(f001.fest).toBe(true)
    expect(f001.params?.nennstrom).toBe(6)
    expect(n.komponenten.filter((k) => k.quelle === 'F001')).toHaveLength(2)
    // die übrigen LS/RCD beginnen wieder bei F1
    expect(n.komponenten.find((k) => k.id === 'F1')!.typ).toBe('rcd')
    expect(parseYaml(toYaml(n))).toEqual(n)
  })
  it('werden nicht doppelt vergeben', () => {
    const p = parseYaml(`komponenten:
  - { id: X1, typ: hausanschluss }
  - { id: F2, typ: ls, quelle: X1, fest: true }
  - { id: F7, typ: ls, quelle: X1 }
  - { id: F8, typ: ls, quelle: X1 }`)
    const ids = neuNummerieren(p).komponenten.map((k) => k.id)
    expect(ids).toEqual(['X1', 'F2', 'F1', 'F3'])
  })
})

describe('Produkt', () => {
  it('Hersteller und Artikelnummer: YAML und Tabelle', () => {
    const p = parseYaml(`komponenten:
  - { id: X1, typ: hausanschluss }
  - { id: F1, typ: ls, quelle: X1 }
  - { id: E1, typ: verbraucher, quelle: F1, produkt: { hersteller: Testfirma, artikel: AB-123 } }
  - { id: T1, typ: wechselrichter, quelle: F1, params: { hersteller: AltTyp } }`)
    expect(p.komponenten[2].produkt).toEqual({ hersteller: 'Testfirma', artikel: 'AB-123' })
    expect(p.komponenten[3].params).toEqual({ modell: 'AltTyp' })
    expect(toYaml(p)).toContain('produkt: { hersteller: Testfirma, artikel: AB-123 }')
    const plan = zeichnePlan(analysiere(p), { modus: 'einpolig', farbig: true, netz: p.netz, tabelle: true })
    expect(plan.inhalt).toContain('Artikelnummer')
    expect(plan.inhalt).toContain('AB-123')
  })
})

describe('Plan', () => {
  it('erzeugt einpoligen und allpoligen Plan', () => {
    const p = parseYaml(BEISPIEL_YAML)
    const a = analysiere(p)
    for (const modus of ['einpolig', 'allpolig'] as const) {
      const plan = zeichnePlan(a, { modus, farbig: true, netz: p.netz })
      expect(plan.breite).toBeGreaterThan(100)
      expect(plan.inhalt).toContain('-F10')
      expect(plan.inhalt).not.toContain('NaN')
      expect(plan.inhalt).toContain('Stromkreis')
      const baum = zeichnePlan(a, { modus, farbig: true, netz: p.netz, anordnung: 'baum' })
      expect(baum.inhalt).not.toContain('Stromkreis')
      expect(baum.inhalt).not.toContain('NaN')
    }
  })
})
