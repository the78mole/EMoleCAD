export const BEISPIEL_YAML = `# MoleCAD – Beispielprojekt Einfamilienhaus
# Jede Komponente hängt über "quelle" an ihrer vorgeschalteten Komponente.
projekt:
  titel: Einfamilienhaus Muster
  kunde: Familie Muster
  adresse: Musterweg 1, 12345 Musterstadt
  ersteller: Elektro Maulwurf
  datum: 2026-11-15
  zeichnungsnummer: EFH-001
  revision: A
netz:
  form: TN-C-S
  spannung: 230/400 V
komponenten:
  - id: X1
    typ: hausanschluss
    name: HAK
    params: { sicherung: 63, sicherungstyp: NH00 gG, netzbetreiber: Stadtwerke }
  # Ungezählter Bereich: parallel zwischen HAK und Zähler
  - id: F1
    typ: spd
    name: Überspannungsschutz
    quelle: X1
    params: { spdtyp: 1+2 }
  - id: F11
    typ: ls
    name: Vorzählerbereich
    quelle: X1
    phase: L1
    params: { charakteristik: B, nennstrom: 6 }
  - id: K1
    typ: steuerbox
    name: Steuerbox
    quelle: F11
    params: { art: FNN-Steuerbox }
  - id: K2
    typ: smgw
    name: Smart-Meter-Gateway
    quelle: F11
  - id: P1
    typ: zaehler
    name: Zweirichtungszähler
    quelle: X1
    kabel: { typ: NYY-J, querschnitt: 5x16 }
    params: { art: Zweirichtung, zaehlernummer: 1EMH0012345678 }
  - id: Q1
    typ: sls
    quelle: P1
    params: { nennstrom: 50 }
  - id: F2
    typ: rcd
    name: RCD Allgemein
    quelle: Q1
    params: { nennstrom: 40, fehlerstrom: 30, rcdtyp: A }
  - id: F3
    typ: ls
    quelle: F2
    phase: L1
    params: { charakteristik: B, nennstrom: 10 }
  - id: E1
    typ: verbraucher
    name: Licht EG
    quelle: F3
    kabel: { typ: NYM-J, querschnitt: "3x1,5" }
  - id: F4
    typ: ls
    quelle: F2
    phase: L2
    params: { charakteristik: B, nennstrom: 16 }
  - id: E2
    typ: verbraucher
    name: Steckdosen Küche
    quelle: F4
    kabel: { typ: NYM-J, querschnitt: "3x2,5" }
    params: { leistung: 2 }
  - id: F5
    typ: ls
    quelle: F2
    phase: L3
    params: { charakteristik: B, nennstrom: 16 }
  - id: E3
    typ: verbraucher
    name: Steckdosen Bad
    quelle: F5
    kabel: { typ: NYM-J, querschnitt: "3x2,5" }
    params: { leistung: 2 }
  - id: F6
    typ: ls
    quelle: F2
    pole: 3
    params: { charakteristik: B, nennstrom: 16 }
  - id: E4
    typ: verbraucher
    name: Herd
    quelle: F6
    kabel: { typ: NYM-J, querschnitt: "5x2,5" }
    pole: 3
    params: { leistung: 10 }
  - id: F7
    typ: rcd
    name: RCD Wallbox
    quelle: Q1
    params: { nennstrom: 40, fehlerstrom: 30, rcdtyp: A EV }
  - id: F8
    typ: ls
    quelle: F7
    pole: 3
    params: { charakteristik: C, nennstrom: 20 }
  - id: E5
    typ: wallbox
    name: Wallbox Carport
    quelle: F8
    kabel: { typ: NYM-J, querschnitt: 5x6, laenge: 15 }
    params: { leistung: 11, steuerbar: true }
  - id: F9
    typ: ls
    quelle: Q1
    pole: 3
    params: { charakteristik: B, nennstrom: 20 }
  - id: T1
    typ: wechselrichter
    name: PV-Wechselrichter
    quelle: F9
    kabel: { typ: NYM-J, querschnitt: 5x4 }
    params: { leistung: 10, hersteller: Hybrid-WR, hybrid: true }
  - id: G1
    typ: pv_generator
    name: PV-Dach Süd
    quelle: T1
    kabel: { typ: H1Z2Z2-K, querschnitt: 1x6 }
    params: { leistung: 9.9, module: 22, strings: 2 }
  - id: G2
    typ: speicher
    name: Batteriespeicher
    quelle: T1
    params: { kapazitaet: 10, leistung: 5 }
  - id: F10
    typ: ls
    quelle: Q1
    pole: 3
    params: { charakteristik: C, nennstrom: 16 }
  - id: E6
    typ: waermepumpe
    name: Wärmepumpe
    quelle: F10
    kabel: { typ: NYM-J, querschnitt: "5x2,5" }
    params: { leistung: 4, steuerbar: true }
# Informationsverbindungen (strichpunktiert im Plan)
datenverbindungen:
  - { von: K2, nach: P1, art: LMN }
  - { von: K1, nach: K2, art: CLS }
`
