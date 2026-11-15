import { describe, expect, it } from 'vitest'
import { BEISPIEL_YAML } from '../model/beispiel'
import { parseYaml } from '../model/yaml'
import { analysiere } from '../model/analyse'
import { autoLayout } from '../model/ops'
import { blattTeilung, zeichnePlaene } from '../schematic/blaetter'
import { modul2 } from './fixtures'

describe('Blattaufteilung', () => {
  it('ohne zweiten Zähler bleibt es bei einem Blatt', () => {
    const p = parseYaml(BEISPIEL_YAML)
    expect(blattTeilung(analysiere(p), {})).toHaveLength(1)
  })
  it('zweiter Zählerstrang kommt auf Blatt 2, ungezählter Bereich bleibt auf Blatt 1', () => {
    const p = modul2()
    const t = blattTeilung(analysiere(p), {})
    expect(t).toHaveLength(2)
    const ort = t[0].bezug!.ort
    for (const id of ['XD1', 'WD1', 'FA1', 'FC2', 'KE1', 'KE2', 'FC1', 'PG1', 'PAS1']) expect(ort.get(id)?.blatt, id).toBe(1)
    for (const id of ['FC10', 'PG2', 'FB2', 'XD5', 'FC4', 'EG1']) expect(ort.get(id)?.blatt, id).toBe(2)
    expect(t[1].bezug!.zufuehrung).toMatchObject({ bmk: '-WD1', blatt: 1 })
  })
  it('zeichnet Verweise in beide Richtungen', () => {
    const p = modul2()
    for (const modus of ['einpolig', 'allpolig'] as const) {
      const [b1, b2] = zeichnePlaene(analysiere(p), { modus, farbig: true, netz: p.netz, daten: p.datenverbindungen, pa: p.potentialausgleich, tabelle: true })
      expect(b1.inhalt).toContain('-FC10 → Blatt 2')
      expect(b1.inhalt).toContain('LMN → -PG2 (Blatt 2)')
      expect(b1.inhalt).not.toContain('Zähler § 14a')
      expect(b2.inhalt).toContain('von -WD1 (Blatt 1)')
      expect(b2.inhalt).toContain('LMN → -KE1 (Blatt 1)')
      expect(b2.inhalt).toContain('Zähler § 14a')
    }
  })
  it('Startnummer verschiebt die Verweise (PDF mit beiden Plänen)', () => {
    const p = modul2()
    const [b3] = zeichnePlaene(analysiere(p), { modus: 'allpolig', farbig: true, netz: p.netz }, 3)
    expect(b3.inhalt).toContain('-FC10 → Blatt 4')
  })
  it('Editor-Anordnung hält SMGW und Steuerbox vor dem zweiten Zählerstrang', () => {
    const pos = autoLayout(modul2())
    expect(pos.KE1.x).toBeLessThan(pos.FC10.x)
    expect(pos.KE2.x).toBeLessThan(pos.FC10.x)
  })
})

describe('Blattaufteilung – Randfälle', () => {
  it('Unterzähler hinter dem Hauptzähler bleibt auf Blatt 1', () => {
    const p = parseYaml(BEISPIEL_YAML)
    // Kette läuft hinter dem Zähler über XD2 zum Trennschalter weiter, der Unterzähler zweigt an XD2 ab
    p.komponenten.push(
      { id: 'QB1', typ: 'trennschalter', quelle: 'XD2' },
      { id: 'EZ2', typ: 'verbraucher', quelle: 'QB1' },
      { id: 'FC12', typ: 'ls', quelle: 'XD2', pole: 3 },
      { id: 'PG3', typ: 'zaehler', name: 'Unterzähler Wallbox', quelle: 'FC12' },
    )
    expect(blattTeilung(analysiere(p), {})).toHaveLength(1)
  })
  it('Editor nimmt den Kettenzweig mit Zähler als Hauptstrang, auch wenn er nicht zuerst steht', () => {
    const p = modul2()
    // Zweig ohne Zähler vor den Hauptstrang setzen
    p.komponenten.splice(2, 0, { id: 'FC11', typ: 'sls', quelle: 'WD1' }, { id: 'EZ1', typ: 'verbraucher', quelle: 'FC11' })
    const pos = autoLayout(p)
    expect(pos.FC1.x).toBeLessThan(pos.FC11.x)
  })
  it('Verweistext vergrößert die Planbreite, damit nichts abgeschnitten wird', () => {
    const p = modul2()
    const [, b2] = zeichnePlaene(analysiere(p), { modus: 'einpolig', farbig: true, netz: p.netz, daten: p.datenverbindungen, tabelle: false })
    const x = Number(/<text x="([\d.]+)"[^>]*>LMN → -KE1/.exec(b2.inhalt)![1])
    expect(b2.breite).toBeGreaterThan(x + 15)
  })
})
