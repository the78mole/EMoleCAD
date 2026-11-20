import { describe, expect, it } from 'vitest'
import { BEISPIEL_YAML } from '../model/beispiel'
import { parseYaml, toYaml, YamlFehler } from '../model/yaml'
import { paramOptionen, typDef, VERWENDUNG } from '../model/library'
import { analysiere } from '../model/analyse'
import { datenVerbinden, hinzufuegen, aktualisieren, entfernen, istVorfahr, neuNummerieren, paTrennen, paVerbinden } from '../model/ops'
import { zeichnePlan } from '../schematic/render'

describe('YAML', () => {
  it('Beispiel lässt sich parsen und ohne Verlust zurückschreiben', () => {
    const p = parseYaml(BEISPIEL_YAML)
    expect(p.komponenten).toHaveLength(28)
    expect(parseYaml(toYaml(p))).toEqual(p)
  })
  it('Querschnitt mit Komma bleibt erhalten', () => {
    const p = parseYaml(BEISPIEL_YAML)
    expect(p.komponenten.find((k) => k.id === 'EA1')!.kabel!.querschnitt).toBe('3x1,5')
  })
  it('meldet Syntaxfehler mit Zeile', () => {
    try { parseYaml('komponenten:\n  - id: X1\n   typ: [') ; expect.fail() } catch (e) {
      expect(e).toBeInstanceOf(YamlFehler)
    }
  })
  it('lehnt ungültige Pole ab', () => {
    expect(() => parseYaml('komponenten:\n  - { id: F1, typ: ls, pole: 5 }')).toThrow(/pole/)
  })
})

describe('Analyse', () => {
  it('Beispiel ist fehlerfrei und leitet Leiter ab', () => {
    const a = analysiere(parseYaml(BEISPIEL_YAML))
    expect(a.meldungen.filter((m) => m.stufe !== 'info')).toEqual([])
    expect(a.knoten.get('XD3')!.leiter).toEqual(['L2', 'N', 'PE'])
    expect(a.knoten.get('GC1')!.leiter).toEqual(['L+', 'L-'])
    expect(a.knoten.get('XD5')!.leiter).toHaveLength(5)
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
    const r = hinzufuegen(p, 'ls', { x: 0, y: 0 }, 'FC1')
    expect(r.id).toBe('FC10')
    p = aktualisieren(r.projekt, 'FC1', { ...r.projekt.komponenten.find((k) => k.id === 'FC1')!, id: 'Q9' })
    expect(p.komponenten.filter((k) => k.quelle === 'Q9').length).toBeGreaterThan(0)
    expect(istVorfahr(p, 'Q9', 'EG1')).toBe(true)
    p = entfernen(p, ['Q9'])
    expect(p.komponenten.some((k) => k.quelle === 'Q9')).toBe(false)
  })
})

describe('Datenverbindungen', () => {
  it('werden gelesen, beim Umbenennen nachgezogen und beim Löschen entfernt', () => {
    let p = parseYaml(BEISPIEL_YAML)
    expect(p.datenverbindungen).toEqual([{ von: 'KE1', nach: 'PG1', art: 'LMN' }, { von: 'KE2', nach: 'KE1', art: 'CLS' }])
    p = aktualisieren(p, 'KE1', { ...p.komponenten.find((k) => k.id === 'KE1')!, id: 'K9' })
    expect(p.datenverbindungen!.every((d) => d.von !== 'KE1' && d.nach !== 'KE1')).toBe(true)
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
    p = { ...p, editor: { KE1: { x: 500, y: 0 }, KE2: { x: 100, y: 0 } } }
    const n = neuNummerieren(p)
    const typ = (id: string) => n.komponenten.find((k) => k.id === id)!.typ
    expect(typ('KE1')).toBe('steuerbox')
    expect(typ('KE2')).toBe('smgw')
    expect(n.datenverbindungen).toEqual([{ von: 'KE2', nach: 'PG1', art: 'LMN' }, { von: 'KE1', nach: 'KE2', art: 'CLS' }])
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
    expect(typ('FC1')).toBe('sls')
    expect(typ('FC2')).toBe('ls')
    // alle Geräte der oberen Verteilerreihe (RCDs, LS direkt an der HLAK) vor den LS darunter
    const nr = (k: { id: string }) => Number(k.id.slice(2))
    const oben = n.komponenten.filter((k) => k.quelle === 'XD2').map(nr)
    const unten = n.komponenten.filter((k) => k.typ === 'ls' && k.quelle !== 'XD2' && k.quelle !== 'WD1').map(nr)
    expect(Math.max(...oben)).toBeLessThan(Math.min(...unten))
  })
})

describe('Festgeschriebene IDs', () => {
  it('bleiben beim Neu nummerieren erhalten und werden mitgezählt', () => {
    const p = parseYaml(BEISPIEL_YAML)
    // LS 6 A im Vorzählerbereich als FC001 festschreiben
    const komponenten = p.komponenten.map((k) =>
      k.id === 'FC2' ? { ...k, id: 'FC001', fest: true } : k.quelle === 'FC2' ? { ...k, quelle: 'FC001' } : k)
    const n = neuNummerieren({ ...p, komponenten, editor: undefined })
    const f001 = n.komponenten.find((k) => k.id === 'FC001')!
    expect(f001.fest).toBe(true)
    expect(f001.params?.nennstrom).toBe(6)
    expect(n.komponenten.filter((k) => k.quelle === 'FC001')).toHaveLength(2)
    // die übrigen Überstromschutzgeräte beginnen wieder bei FC1
    expect(n.komponenten.find((k) => k.id === 'FC1')!.typ).toBe('sls')
    expect(n.komponenten.find((k) => k.id === 'FC2')!.typ).toBe('ls')
    expect(parseYaml(toYaml(n))).toEqual(n)
  })
  it('werden nicht doppelt vergeben', () => {
    const p = parseYaml(`komponenten:
  - { id: X1, typ: hausanschluss }
  - { id: FC2, typ: ls, quelle: X1, fest: true }
  - { id: F7, typ: ls, quelle: X1 }
  - { id: F8, typ: ls, quelle: X1 }`)
    const ids = neuNummerieren(p).komponenten.map((k) => k.id)
    expect(ids).toEqual(['XD1', 'FC2', 'FC1', 'FC3'])
  })
})

describe('Kennbuchstaben IEC 81346-2', () => {
  it('Verbraucher je nach Verwendung', () => {
    let p = parseYaml('komponenten:\n  - { id: XD1, typ: hausanschluss }')
    for (const v of ['Beleuchtung', 'Heizung/Herd', undefined]) {
      const r = hinzufuegen(p, 'verbraucher', { x: 0, y: 0 }, 'XD1')
      p = v ? aktualisieren(r.projekt, r.id, { ...r.projekt.komponenten.find((k) => k.id === r.id)!, params: { verwendung: v } }) : r.projekt
    }
    expect(neuNummerieren(p).komponenten.map((k) => k.id).sort()).toEqual(['EA1', 'EB1', 'XD1', 'XD2'])
  })
})

describe('Verwendung mit Freitext', () => {
  it('Reserve und im Projekt verwendete eigene Texte erscheinen in der Auswahl', () => {
    const p = parseYaml(`komponenten:
  - { id: X1, typ: hausanschluss }
  - { id: E1, typ: verbraucher, quelle: X1, params: { verwendung: Sauna } }
  - { id: E2, typ: verbraucher, quelle: X1, params: { verwendung: Reserve } }
  - { id: E3, typ: verbraucher, quelle: X1, params: { verwendung: Aquarium } }
  - { id: E4, typ: verbraucher, quelle: X1, params: { verwendung: Sauna } }`)
    const pd = typDef('verbraucher').params.find((x) => x.key === 'verwendung')!
    const opt = paramOptionen(pd, 'verbraucher', p.komponenten)
    expect(opt).toContain('Reserve')
    expect(opt.slice(-2)).toEqual(['Aquarium', 'Sauna'])
    expect(opt.filter((o) => o === 'Sauna')).toHaveLength(1)
    expect(VERWENDUNG.Reserve).toBe('XD')
    const bmk = typDef('verbraucher').bmkAus!
    expect(bmk({ verwendung: 'constructor' })).toBe('XD')
    expect(bmk({ verwendung: 'Sauna' })).toBe('XD')
    expect(bmk({ verwendung: 'Beleuchtung' })).toBe('EA')
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
      expect(plan.inhalt).toContain('-FC9')
      expect(plan.inhalt).not.toContain('NaN')
      expect(plan.inhalt).toContain('Stromkreis')
      const baum = zeichnePlan(a, { modus, farbig: true, netz: p.netz, anordnung: 'baum' })
      expect(baum.inhalt).not.toContain('Stromkreis')
      expect(baum.inhalt).not.toContain('NaN')
    }
  })
})

describe('Potentialausgleich', () => {
  it('PAS steht außerhalb des Strompfads und ohne Meldungen', () => {
    const p = parseYaml(BEISPIEL_YAML)
    const a = analysiere(p)
    expect(a.potential.map((n) => n.k.id)).toEqual(['PAS1'])
    expect(a.wurzeln.some((n) => n.k.id === 'PAS1')).toBe(false)
    expect(a.meldungen.filter((m) => m.id === 'PAS1')).toEqual([])
  })
  it('Verbindungen folgen Umbenennen, Löschen und Neu nummerieren', () => {
    let p = parseYaml(BEISPIEL_YAML)
    expect(p.potentialausgleich).toHaveLength(3)
    p = aktualisieren(p, 'PAS1', { ...p.komponenten.find((k) => k.id === 'PAS1')!, id: 'PAS9' })
    expect(p.potentialausgleich!.every((d) => d.von === 'PAS9')).toBe(true)
    const paare = (q: typeof p) => q.potentialausgleich!.map((d) => `${d.von}-${d.nach}`)
    const n = neuNummerieren(p)
    expect(paare(n)).toEqual(['PAS1-XD1', 'PAS1-WD1', 'PAS1-FA1'])
    expect(n.komponenten.find((k) => k.id === 'PAS1')?.typ).toBe('pas') // Schiene selbst mit umbenannt
    expect(paVerbinden(p, 'FA1', 'PAS9')).toBe(p) // schon vorhanden (Richtung egal)
    expect(paare(paTrennen(p, 'WD1', 'PAS9'))).toEqual(['PAS9-XD1', 'PAS9-FA1'])
    // Löschen der Schiene entfernt nur ihre eigenen Verbindungen
    const mitDirekt = paVerbinden(p, 'XD1', 'FA1')
    expect(paare(entfernen(mitDirekt, ['PAS9']))).toEqual(['XD1-FA1'])
  })
  it('wird grün gezeichnet, SPD ohne eigenes Erdungssymbol', () => {
    const p = parseYaml(BEISPIEL_YAML)
    for (const modus of ['einpolig', 'allpolig'] as const) {
      const plan = zeichnePlan(analysiere(p), { modus, farbig: true, netz: p.netz, pa: p.potentialausgleich })
      expect(plan.inhalt).toContain('-PAS1')
      expect(plan.inhalt).toContain('16 mm²')
      expect(plan.inhalt).toContain('#2e9e3e')
      // drei Anschlusspunkte der Leitungen und nur noch ein Erder (an der PAS, nicht am SPD)
      expect(plan.inhalt.match(/<circle[^>]*r="0.45" fill="#2e9e3e" stroke="#2e9e3e"/g)?.length).toBe(3)
      // Erdungssymbol = waagerechte Linie mit 1,2 mm Länge (unterster Strich)
      const erden = (t: string) => [...t.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)].filter((m) => m[2] === m[4] && Math.abs(+m[3] - +m[1] - 1.2) < 0.01).length
      const ohne = zeichnePlan(analysiere(p), { modus, farbig: true, netz: p.netz })
      expect(erden(ohne.inhalt)).toBe(2) // SPD und unverbundene PAS
      expect(erden(plan.inhalt)).toBe(1) // nur PAS, SPD-Erde entfällt
    }
  })
  it('meldet Doppelte, ungeeignete Partner und PAS als Quelle', () => {
    const p = parseYaml(`komponenten:
  - { id: XD1, typ: hausanschluss }
  - { id: PAS1, typ: pas }
  - { id: FC1, typ: ls, quelle: PAS1 }
potentialausgleich:
  - { von: PAS1, nach: XD1 }
  - { von: XD1, nach: PAS1 }
  - { von: PAS1, nach: FC1 }
`)
    expect(p.potentialausgleich).toHaveLength(2)
    const texte = analysiere(p).meldungen.map((m) => m.text).join('\n')
    expect(texte).toMatch(/FC1.*nicht vorgesehen/)
    expect(texte).toMatch(/kann keine Quelle sein/)
    expect(texte).not.toMatch(/Kreis/)
  })
  it('zeichnet einen Plan nur mit PAS', () => {
    const p = parseYaml('komponenten:\n  - { id: PAS1, typ: pas }\n')
    expect(zeichnePlan(analysiere(p), { modus: 'einpolig', farbig: true, netz: p.netz }).inhalt).toContain('-PAS1')
  })
})

describe('Lasttrennschalter Polzahl', () => {
  const yaml = (extra: string) => `projekt: { titel: T }
netz: { form: TN-C-S }
komponenten:
  - { id: XD1, typ: hausanschluss }
  - { id: QB1, typ: trennschalter, quelle: XD1${extra} }
  - { id: FC1, typ: ls, quelle: QB1, pole: 3 }
`
  const FARBE = { L1: '#7a4a1e', L2: '#111111', L3: '#7d7d7d', N: '#1f6fd1' }
  // Trennerkontakte (Kreis am festen Kontakt) je Leiterfarbe
  const kontakte = (inhalt: string, farbe: string) => (inhalt.match(new RegExp(`<circle[^>]*stroke="${farbe}"`, 'g')) ?? []).length
  // Kennzeichnung voreilend: ein dünner Strich (0.3) am N-Schaltstück
  const marken = (inhalt: string) => (inhalt.match(new RegExp(`<line[^>]*stroke="${FARBE.N}" stroke-width="0.3"`, 'g')) ?? []).length
  const plan = (p: ReturnType<typeof parseYaml>) => zeichnePlan(analysiere(p), { modus: 'allpolig', farbig: true, netz: p.netz }).inhalt

  it('ist standardmäßig 3-polig, N wird nicht geschaltet', () => {
    const inhalt = plan(parseYaml(yaml('')))
    for (const le of ['L1', 'L2', 'L3'] as const) expect(kontakte(inhalt, FARBE[le])).toBe(1)
    expect(kontakte(inhalt, FARBE.N)).toBe(0)
  })
  it('4-polig schaltet den N mit, ohne Kennzeichnung', () => {
    const p = parseYaml(yaml(', pole: 4, params: { nennstrom: 63 }'))
    expect(parseYaml(toYaml(p))).toEqual(p)
    const inhalt = plan(p)
    for (const le of ['L1', 'L2', 'L3', 'N'] as const) expect(kontakte(inhalt, FARBE[le])).toBe(1)
    expect(marken(inhalt)).toBe(0)
    expect(inhalt).toContain('>63A 4-polig<')
    expect(inhalt).not.toContain('>voreilend<')
  })
  it('4-polig voreilend kennzeichnet den N-Kontakt', () => {
    const p = parseYaml(yaml(', pole: 4, voreilend: true, params: { nennstrom: 63 }'))
    expect(p.komponenten[1]).toMatchObject({ pole: 4, voreilend: true })
    expect(parseYaml(toYaml(p))).toEqual(p)
    const inhalt = plan(p)
    expect(kontakte(inhalt, FARBE.N)).toBe(1)
    expect(marken(inhalt)).toBe(1)
    expect(inhalt).toContain('>63A 4-polig<')
    expect(inhalt).toContain('>voreilend<')
    expect(inhalt).not.toContain('nacheilend')
  })
  it('liest alte Dateien mit params.allpolig als 4-polig voreilend', () => {
    const p = parseYaml(yaml(', params: { nennstrom: 63, allpolig: true }'))
    expect(p.komponenten[1]).toMatchObject({ pole: 4, voreilend: true, params: { nennstrom: 63 } })
    expect(p.komponenten[1].params).not.toHaveProperty('allpolig')
    const aus = parseYaml(yaml(', params: { allpolig: "false" }'))
    expect(aus.komponenten[1].pole).toBeUndefined()
    expect(aus.komponenten[1].params).toBeUndefined()
    expect(() => parseYaml(yaml(', params: { allpolig: vielleicht }'))).toThrow(YamlFehler)
  })
  it('warnt bei "voreilend" ohne 2-/4-polig', () => {
    const p = parseYaml(yaml(', voreilend: true'))
    expect(analysiere(p).meldungen.some((m) => m.id === 'QB1' && m.stufe === 'warnung' && m.text.includes('voreilend'))).toBe(true)
  })
  it('warnt, wenn ein Gerät den N nicht schalten kann', () => {
    const p = parseYaml(yaml('').replace('typ: ls, quelle: QB1, pole: 3', 'typ: ls, quelle: QB1, pole: 4'))
    expect(analysiere(p).meldungen.some((m) => m.id === 'FC1' && m.text.includes('N nicht schalten'))).toBe(true)
  })
})

describe('Lasttrennschalter Datenanschluss', () => {
  it('kann vom Wechselrichter gesteuert werden (Steuersignal)', () => {
    const p = parseYaml(`projekt: { titel: T }
netz: { form: TN-C-S }
komponenten:
  - { id: XD1, typ: hausanschluss }
  - { id: QB1, typ: trennschalter, quelle: XD1, pole: 4, voreilend: true }
  - { id: TB1, typ: wechselrichter, quelle: QB1 }
`)
    const q = datenVerbinden(p, 'TB1', 'QB1')
    expect(q.datenverbindungen).toEqual([{ von: 'TB1', nach: 'QB1', art: 'Steuersignal' }])
    const a = analysiere(q)
    expect(a.meldungen.filter((m) => m.text.includes('Datenverbindung'))).toEqual([])
    const plan = zeichnePlan(a, { modus: 'einpolig', farbig: true, netz: q.netz, daten: q.datenverbindungen })
    expect(plan.inhalt).toContain('Steuersignal')
  })
  it('hat einen Datenanschluss in der Bibliothek', () => {
    expect(typDef('trennschalter').daten).toBe(true)
  })
  it('führt die Datenleitung rechts an der Beschriftung der Einspeisekette vorbei', () => {
    const p = parseYaml(`projekt: { titel: T }
netz: { form: TN-C-S }
komponenten:
  - { id: XD1, typ: hausanschluss }
  - { id: QB1, typ: trennschalter, quelle: XD1, name: Fronius Backup Controller }
  - { id: PG1, typ: zaehler, quelle: QB1 }
  - { id: FC1, typ: ls, quelle: PG1 }
  - { id: TB1, typ: wechselrichter, quelle: PG1 }
datenverbindungen:
  - { von: TB1, nach: QB1, art: Steuersignal }
`)
    const inhalt = zeichnePlan(analysiere(p), { modus: 'einpolig', farbig: true, netz: p.netz, daten: p.datenverbindungen }).inhalt
    // rechtes Ende der Namenszeilen von QB1 (Schätzung wie im Renderer: ca. 1 mm je Zeichen)
    const zeilen = [...inhalt.matchAll(/<text x="([\d.]+)"[^>]*>(Fronius Backup|Controller)<\/text>/g)]
    expect(zeilen.length).toBe(2)
    const textEnde = Math.max(...zeilen.map((m) => Number(m[1]) + m[2].length))
    // Datenleitung: Pfad mit Strichpunktmuster, alle Knickpunkte rechts der Beschriftung (außer dem Anschluss an QB1)
    const pfad = [...inhalt.matchAll(/<path d="([^"]+)"[^>]*stroke-dasharray="1.6 0.6 0.3 0.6"/g)].map((m) => m[1])
    expect(pfad.length).toBe(1)
    const xs = [...pfad[0].matchAll(/[ML] ([\d.]+) /g)].map((m) => Number(m[1]))
    const senkrechte = xs.slice(1, -1)
    expect(Math.min(...senkrechte)).toBeGreaterThan(textEnde)
  })
})
