import { describe, expect, it } from 'vitest'
import { BEISPIEL_YAML } from '../model/beispiel'
import { parseYaml } from '../model/yaml'
import { analysiere } from '../model/analyse'
import { autoLayout } from '../model/ops'
import { blattTeilung, zeichnePlaene } from '../schematic/blaetter'
import { modul2, verteilung } from './fixtures'

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

describe('Verweis-Stiche', () => {
  it('mehrere Verweise an einem Gerät liegen auf verschiedenen Höhen', () => {
    const p = modul2()
    p.datenverbindungen!.push({ von: 'KE2', nach: 'EG1', art: 'Steuersignal' }, { von: 'KE2', nach: 'XD5', art: 'Steuersignal' })
    for (const modus of ['einpolig', 'allpolig'] as const) {
      const [b1] = zeichnePlaene(analysiere(p), { modus, farbig: true, netz: p.netz, daten: p.datenverbindungen })
      const ys = [...b1.inhalt.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*>Steuersignal → /g)].map((m) => Number(m[1]))
      expect(ys).toHaveLength(2)
      expect(Math.abs(ys[0] - ys[1])).toBeGreaterThan(2)
    }
  })
})

describe('Folgeblätter', () => {
  /** Endverbraucher je Blatt */
  const verbraucher = (t: ReturnType<typeof blattTeilung>) =>
    t.map((b) => [...b.bezug!.ort].filter(([id, o]) => id.startsWith('EV') && o.blatt === b.bezug!.nr).length)

  it('ohne Grenze bleibt alles auf einem Blatt', () => {
    expect(blattTeilung(analysiere(verteilung([6, 6, 6, 6])), { maxAbgaenge: 0 })).toHaveLength(1)
    expect(blattTeilung(analysiere(verteilung([6, 6, 6, 6])), {})).toHaveLength(1)
  })
  it('bricht an ganzen FI-Gruppen um und hält die Grenze ein', () => {
    const t = blattTeilung(analysiere(verteilung([4, 4, 4, 4, 4])), { maxAbgaenge: 10 })
    expect(t.length).toBeGreaterThan(1)
    const ort = t[0].bezug!.ort
    for (let g = 1; g <= 5; g++) {
      // alle Stromkreise eines FI auf dem Blatt des FI
      const fi = ort.get(`FB${g}`)!.blatt
      for (let i = (g - 1) * 4 + 1; i <= g * 4; i++) expect(ort.get(`EV${i}`)!.blatt, `EV${i}`).toBe(fi)
    }
    // Einspeisung und ungezählter Bereich bleiben auf Blatt 1
    for (const id of ['XD1', 'FC1', 'PG1', 'QB1', 'FA1']) expect(ort.get(id)!.blatt, id).toBe(1)
    verbraucher(t).forEach((n) => expect(n).toBeLessThanOrEqual(10))
    expect(verbraucher(t).reduce((a, b) => a + b)).toBe(20)
    for (const b of t.slice(1)) {
      expect(b.bezug!.fortsetzung).toBe('QB1')
      expect(b.bezug!.zufuehrung).toMatchObject({ bmk: '-QB1', blatt: 1, leiter: '3/N/PE' })
    }
  })
  it('bricht innerhalb eines FI um, der allein nicht auf ein Blatt passt', () => {
    const t = blattTeilung(analysiere(verteilung([2, 14])), { maxAbgaenge: 6 })
    verbraucher(t).forEach((n) => expect(n).toBeLessThanOrEqual(6))
    expect(verbraucher(t).reduce((a, b) => a + b)).toBe(16)
    const ort = t[0].bezug!.ort
    const fi = ort.get('FB2')!.blatt
    const weiter = t.filter((b) => b.bezug!.fortsetzung === 'FB2')
    expect(weiter.length).toBeGreaterThan(0)
    for (const b of weiter) expect(b.bezug!.zufuehrung).toMatchObject({ bmk: '-FB2', blatt: fi })
  })
  it('zeichnet Verweis und Fortsetzung in beiden Plänen, jedes Gerät nur einmal', () => {
    const p = verteilung([4, 4, 4, 4, 4])
    for (const modus of ['einpolig', 'allpolig'] as const) {
      const b = zeichnePlaene(analysiere(p), { modus, farbig: true, netz: p.netz, maxAbgaenge: 10 })
      expect(b.length).toBeGreaterThan(1)
      expect(b[0].inhalt).toMatch(/-FB\d … -FB\d → Blatt 2|-FB\d → Blatt 2/)
      for (const s of b.slice(1)) {
        expect(s.inhalt).toContain('von -QB1 (Blatt 1)')
        // der Trennschalter selbst wird auf dem Folgeblatt nicht noch einmal gezeichnet
        expect(s.inhalt).not.toMatch(/>-QB1</)
      }
      for (let i = 1; i <= 20; i++) expect(b.filter((s) => s.inhalt.includes(`>-EV${i}<`)).length, `EV${i}`).toBe(1)
    }
  })
  it('Folgeblätter eines zweiten Zählerstrangs folgen dessen Blatt', () => {
    const p = modul2()
    for (let i = 0; i < 12; i++) p.komponenten.push({ id: `FX${i}`, typ: 'ls', quelle: 'FB1', pole: 1 }, { id: `EX${i}`, typ: 'verbraucher', quelle: `FX${i}` })
    const t = blattTeilung(analysiere(p), { maxAbgaenge: 8 })
    const ort = t[0].bezug!.ort
    // Zählerstrang Modul 2 steht direkt hinter den Folgeblättern des Hauptstrangs
    expect(ort.get('PG2')!.blatt).toBe(t.length)
    expect(t[t.length - 1].bezug!.zufuehrung).toMatchObject({ bmk: '-WD1', blatt: 1 })
  })
})
