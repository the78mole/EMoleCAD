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
  - id: XD1
    typ: hausanschluss
    name: HAK
    params: { sicherung: 63, sicherungstyp: NH00 gG, netzbetreiber: Stadtwerke }
  # Ungezählter Bereich: Sammelschiene direkt nach dem HAK
  - id: WD1
    typ: sammelschiene
    name: Sammelschiene ungezählt
    quelle: XD1
    kabel: { typ: NYY-J, querschnitt: 5x16 }
    params: { nennstrom: 63, querschnitt: 12x5 }
  # Potentialausgleichsschiene: nur über "potentialausgleich" verbunden, keine Quelle
  - id: XE1
    typ: pas
    params: { erder: Fundamenterder, querschnitt: 16 }
  - id: FA1
    typ: spd
    name: Überspannungsschutz
    quelle: WD1
    params: { spdtyp: 1+2 }
  - id: FC2
    typ: ls
    name: Vorzählerbereich
    quelle: WD1
    phase: L1
    params: { charakteristik: B, nennstrom: 6 }
  - id: KE1
    typ: smgw
    name: Smart-Meter-Gateway
    quelle: FC2
  - id: KE2
    typ: steuerbox
    name: Steuerbox
    quelle: FC2
    params: { art: FNN-Steuerbox }
  # Gezählter Bereich: SLS -> Zähler -> HLAK -> Verteilung
  - id: FC1
    typ: sls
    quelle: WD1
    params: { nennstrom: 50 }
  - id: PG1
    typ: zaehler
    name: Zweirichtungszähler
    quelle: FC1
    params: { art: Zweirichtung, zaehlernummer: 1EMH0012345678 }
  - id: XD2
    typ: hlak
    quelle: PG1
    params: { querschnitt: "35", nennstrom: 63 }
  - id: FB1
    typ: rcd
    name: RCD Allgemein
    quelle: XD2
    params: { nennstrom: 40, fehlerstrom: 30, rcdtyp: A }
  - id: FC5
    typ: ls
    quelle: FB1
    phase: L1
    params: { charakteristik: B, nennstrom: 10 }
  - id: EA1
    typ: verbraucher
    name: Licht EG
    quelle: FC5
    kabel: { typ: NYM-J, querschnitt: "3x1,5" }
    params: { verwendung: Beleuchtung }
  - id: FC6
    typ: ls
    quelle: FB1
    phase: L2
    params: { charakteristik: B, nennstrom: 16 }
  - id: XD3
    typ: verbraucher
    name: Steckdosen Küche
    quelle: FC6
    kabel: { typ: NYM-J, querschnitt: "3x2,5" }
    params: { verwendung: Steckdosen, leistung: 2 }
  - id: FC7
    typ: ls
    quelle: FB1
    phase: L3
    params: { charakteristik: B, nennstrom: 16 }
  - id: XD4
    typ: verbraucher
    name: Steckdosen Bad
    quelle: FC7
    kabel: { typ: NYM-J, querschnitt: "3x2,5" }
    params: { verwendung: Steckdosen, leistung: 2 }
  - id: FC8
    typ: ls
    quelle: FB1
    pole: 3
    params: { charakteristik: B, nennstrom: 16 }
  - id: EB1
    typ: verbraucher
    name: Herd
    quelle: FC8
    kabel: { typ: NYM-J, querschnitt: "5x2,5" }
    pole: 3
    params: { verwendung: Heizung/Herd, leistung: 10 }
  - id: FB2
    typ: rcd
    name: RCD Wallbox
    quelle: XD2
    params: { nennstrom: 40, fehlerstrom: 30, rcdtyp: A EV }
  - id: FC9
    typ: ls
    quelle: FB2
    pole: 3
    params: { charakteristik: C, nennstrom: 20 }
  - id: XD5
    typ: wallbox
    name: Wallbox Carport
    quelle: FC9
    kabel: { typ: NYM-J, querschnitt: 5x6, laenge: 15 }
    params: { leistung: 11, steuerbar: true }
  - id: FC3
    typ: ls
    quelle: XD2
    pole: 3
    params: { charakteristik: B, nennstrom: 20 }
  - id: TB1
    typ: wechselrichter
    name: PV-Wechselrichter
    quelle: FC3
    kabel: { typ: NYM-J, querschnitt: 5x4 }
    params: { leistung: 10, modell: Hybrid-WR, hybrid: true }
  - id: GC1
    typ: pv_generator
    name: PV-Dach Süd
    quelle: TB1
    kabel: { typ: H1Z2Z2-K, querschnitt: 1x6 }
    params: { leistung: 9.9, module: 22, strings: 2 }
  - id: CC1
    typ: speicher
    name: Batteriespeicher
    quelle: TB1
    params: { kapazitaet: 10, leistung: 5 }
  - id: FC4
    typ: ls
    quelle: XD2
    pole: 3
    params: { charakteristik: C, nennstrom: 16 }
  - id: EG1
    typ: waermepumpe
    name: Wärmepumpe
    quelle: FC4
    kabel: { typ: NYM-J, querschnitt: "5x2,5" }
    params: { leistung: 4, steuerbar: true }
# Informationsverbindungen (strichpunktiert im Plan)
datenverbindungen:
  - { von: KE1, nach: PG1, art: LMN }
  - { von: KE2, nach: KE1, art: CLS }
# Potentialausgleich (eigene Verkabelung, grün im Plan)
potentialausgleich:
  - { von: XE1, nach: XD1, querschnitt: 16 }
  - { von: XE1, nach: WD1, querschnitt: 16 }
  - { von: XE1, nach: FA1, querschnitt: 16 }
`
