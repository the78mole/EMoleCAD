import { BEISPIEL_YAML } from '../model/beispiel'
import type { Projekt } from '../model/types'
import { parseYaml } from '../model/yaml'

/** Beispiel mit Modul 2: zweiter Zählerstrang für steuerbare Verbraucher */
export function modul2(): Projekt {
  const p = parseYaml(BEISPIEL_YAML)
  p.komponenten.push(
    { id: 'FC10', typ: 'sls', quelle: 'WD1', params: { nennstrom: 35 } },
    { id: 'PG2', typ: 'zaehler', name: 'Zähler § 14a Modul 2', quelle: 'FC10', params: { art: 'Bezug' } },
  )
  for (const k of p.komponenten) if (k.id === 'FB2' || k.id === 'FC4') k.quelle = 'PG2'
  p.datenverbindungen = [...(p.datenverbindungen ?? []), { von: 'KE1', nach: 'PG2', art: 'LMN' }]
  return p
}

/** Plan wie im Nutzer-Screenshot: zweiter Zweirichtungszähler in der Kette, Verteilerstrang
 *  hinter dem ersten Zähler und Steuerleitungen von der Steuerbox zu den § 14a-Geräten */
export function steuerleitungen(): Projekt {
  return parseYaml(`netz: { form: TN-C-S, spannung: 230/400 V }
komponenten:
  - { id: XD1, typ: hausanschluss, params: { sicherung: 63 } }
  - { id: WD1, typ: sammelschiene, quelle: XD1, name: Sammelschiene ungezählt }
  - { id: FA1, typ: spd, quelle: WD1 }
  - { id: FC2, typ: sls, quelle: WD1, params: { nennstrom: 35 } }
  - { id: FC3, typ: ls, quelle: WD1, params: { charakteristik: B, nennstrom: 6 } }
  - { id: KE1, typ: smgw, quelle: FC3 }
  - { id: KE2, typ: steuerbox, quelle: FC3, params: { art: FNN-Steuerbox } }
  - { id: FC1, typ: sls, quelle: WD1, params: { nennstrom: 50 } }
  - { id: PG1, typ: zaehler, quelle: FC1, params: { art: Zweirichtung } }
  - { id: XD2, typ: hlak, quelle: PG1, params: { querschnitt: "35" } }
  - { id: FB1, typ: rcd, quelle: XD2, name: RCD Allgemein, params: { nennstrom: 40, fehlerstrom: 30, rcdtyp: A } }
  - { id: FC6, typ: ls, quelle: FB1, phase: L1, params: { charakteristik: B, nennstrom: 16 } }
  - { id: XD4, typ: verbraucher, quelle: FC6, name: Steckdosen Küche, params: { verwendung: Steckdosen } }
  - { id: FC7, typ: ls, quelle: FB1, phase: L2, params: { charakteristik: B, nennstrom: 16 } }
  - { id: XD5, typ: verbraucher, quelle: FC7, name: Steckdosen Bad, params: { verwendung: Steckdosen } }
  - { id: FC8, typ: ls, quelle: FB1, pole: 3, params: { charakteristik: B, nennstrom: 16 } }
  - { id: EB1, typ: verbraucher, quelle: FC8, pole: 3, name: Herd, params: { verwendung: Heizung/Herd, leistung: 10 } }
  - { id: FC9, typ: ls, quelle: FB1, phase: L3, params: { charakteristik: B, nennstrom: 10 } }
  - { id: EA1, typ: verbraucher, quelle: FC9, name: Licht EG, params: { verwendung: Beleuchtung } }
  - { id: PG2, typ: zaehler, quelle: PG1, params: { art: Zweirichtung } }
  - { id: XD3, typ: hlak, quelle: PG2, params: { querschnitt: "35" } }
  - { id: FB2, typ: rcd, quelle: XD3, name: RCD Wallbox, params: { nennstrom: 40, fehlerstrom: 30, rcdtyp: A EV } }
  - { id: FC10, typ: ls, quelle: FB2, pole: 3, params: { charakteristik: C, nennstrom: 20 } }
  - { id: XD6, typ: wallbox, quelle: FC10, name: Wallbox Carport, params: { leistung: 11, steuerbar: true } }
  - { id: FC4, typ: ls, quelle: XD3, pole: 3, params: { charakteristik: B, nennstrom: 20 } }
  - { id: TB1, typ: wechselrichter, quelle: FC4, kabel: { typ: NYM-J, querschnitt: 5x4 }, params: { leistung: 10, modell: Hybrid-WR } }
  - { id: GC1, typ: pv_generator, quelle: TB1, name: PV-Dach Süd, params: { leistung: 9.9, module: 22 } }
  - { id: CC1, typ: speicher, quelle: TB1, params: { kapazitaet: 10 } }
  - { id: FC5, typ: ls, quelle: XD3, pole: 3, params: { charakteristik: C, nennstrom: 16 } }
  - { id: EG1, typ: waermepumpe, quelle: FC5, params: { leistung: 4, steuerbar: true } }
datenverbindungen:
  - { von: KE1, nach: PG1, art: LMN }
  - { von: KE2, nach: KE1, art: CLS }
  - { von: KE2, nach: TB1, art: Steuersignal }
  - { von: KE2, nach: XD6, art: Steuersignal }
  - { von: KE2, nach: CC1, art: Steuersignal }
  - { von: KE2, nach: EG1, art: Steuersignal }
  - { von: KE2, nach: FB1, art: Steuersignal }
`)
}

/** Verteilung hinter dem Zähler mit mehreren FI-Gruppen; `gruppen` = Stromkreise je FI */
export function verteilung(gruppen: number[]): Projekt {
  const k: string[] = [
    '  - { id: XD1, typ: hausanschluss, params: { sicherung: 63 } }',
    '  - { id: FC1, typ: sls, quelle: XD1, params: { nennstrom: 50 } }',
    '  - { id: PG1, typ: zaehler, quelle: FC1 }',
    '  - { id: QB1, typ: trennschalter, quelle: PG1 }',
    '  - { id: FA1, typ: spd, quelle: XD1 }',
  ]
  let nr = 1
  gruppen.forEach((anz, g) => {
    k.push(`  - { id: FB${g + 1}, typ: rcd, quelle: QB1 }`)
    for (let i = 0; i < anz; i++, nr++) k.push(`  - { id: FC${nr + 10}, typ: ls, quelle: FB${g + 1}, pole: 1 }`, `  - { id: EV${nr}, typ: verbraucher, quelle: FC${nr + 10} }`)
  })
  return parseYaml(`netz: { form: TN-C-S, spannung: 230/400 V }\nkomponenten:\n${k.join('\n')}\n`)
}
