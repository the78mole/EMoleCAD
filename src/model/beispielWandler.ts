/** Beispiel PV-Anlage mit halbindirekter Messung (Wandlerzähler) und Fernwirktechnik des Netzbetreibers:
 *  Netz → Wandler Abrechnung → Zähler → Handschalter → Wandler Fernwirk → Motorschütz → Sammelschiene → Wechselrichter.
 *  Der Messumformer sitzt in einem eigenen kleinen Schrank; die Wandlersignale laufen über Reihenklemmen
 *  und ein 7-adriges Kabel dorthin. */
export const BEISPIEL_WANDLER_YAML = `# EMoleCAD – Beispiel PV-Anlage mit Wandlermessung und Fernwirktechnik
projekt:
  titel: PV-Anlage mit Wandlermessung
  kunde: Muster Solar GmbH
  ersteller: Elektro Maulwurf
  datum: 2026-11-22
  zeichnungsnummer: PV-WM-001
  revision: A
netz:
  form: TN-C-S
  spannung: 230/400 V
komponenten:
  - { id: XD1, typ: hausanschluss, name: Netzanschluss, params: { sicherung: 500, sicherungstyp: NH3 gG, netzbetreiber: Netzbetreiber } }
  # Abrechnungsmessung: Wandlersatz und Wandlerzähler (halbindirekt)
  - { id: BE2, typ: stromwandler, name: Wandler Abrechnung, quelle: XD1, params: { uebersetzung: 500/5 A, klasse: "0,5S", buerde: "5", zweck: Abrechnung } }
  - { id: PG1, typ: zaehler, name: Wandlerzähler, quelle: BE2, params: { art: Zweirichtung, messart: halbindirekt, spannungspfad: 3x 10 A } }
  - { id: QB1, typ: trennschalter, name: Handschalter, quelle: PG1, params: { nennstrom: 630 } }
  # Messung für die Fernwirktechnik: eigener Wandlersatz zwischen Handschalter und Motorschütz
  - { id: BE1, typ: stromwandler, name: Wandler Fernwirk, quelle: QB1, params: { uebersetzung: 500/5 A, klasse: "1", buerde: "5", zweck: Fernwirktechnik } }
  - { id: QA1, typ: schuetz, name: Motorschütz NB, quelle: BE1, params: { nennstrom: 630, antrieb: Motor, steuerspannung: 230 V AC } }
  - { id: WD1, typ: sammelschiene, name: Sammelschiene PV, quelle: QA1, params: { nennstrom: 630, querschnitt: 40x10 } }
  - { id: FC1, typ: sicherung, quelle: WD1, params: { nennstrom: 160, bauform: NH00 } }
  - { id: TB1, typ: wechselrichter, name: Wechselrichter 1, quelle: FC1, kabel: { typ: NYY-J, querschnitt: 5x70 }, params: { leistung: 100 } }
  - { id: FC2, typ: sicherung, quelle: WD1, params: { nennstrom: 160, bauform: NH00 } }
  - { id: TB2, typ: wechselrichter, name: Wechselrichter 2, quelle: FC2, kabel: { typ: NYY-J, querschnitt: 5x70 }, params: { leistung: 100 } }
  # Hilfsspannung für Messumformer und Fernwirktechnik
  - { id: FC3, typ: ls, name: Hilfsspannung, quelle: WD1, phase: L1, params: { charakteristik: B, nennstrom: 6 } }
  - id: TF1
    typ: messumformer
    name: Messumformer Fernwirk
    quelle: FC3
    produkt: { hersteller: Müller+Ziegler, artikel: Multi-E4-S1-MU }
    params:
      modell: Multi-E4-S1-MU
      eingang: 5 A
      ausgang: 4...20 mA
      # Klemmen laut Typenschild: Name:Klemmen, UH = Hilfsspannung 60-265 V AC/DC
      anschluesse: "UH:17/18, U-L1:2, U-L2:5, U-L3:8, U-N:11, I-L1:1/3, I-L2:4/6, I-L3:7/9, out1:20/21, out2:23/24, out3:26/27, out4:29/30, G1:12/13, G2:14/15"
      ort: Messumformerschrank
  - { id: KE1, typ: fernwirk, name: Fernwirktechnik NB, quelle: FC3, params: { betreiber: Netzbetreiber } }
  # Klemmleisten: Prüfklemmleiste am Wandlerzähler, Reihenklemmen in beiden Schränken
  - { id: XT1, typ: klemmleiste, name: Prüfklemmleiste, params: { art: Prüfklemmleiste, klemmen: 10 } }
  - { id: XD2, typ: klemmleiste, name: Wandlerklemmen Zählerschrank, params: { art: Trennklemmen, klemmen: 7, belegung: "1S1, 1S2, 2S1, 2S2, 3S1, 3S2, PE" } }
  - { id: XD3, typ: klemmleiste, name: Wandlerklemmen Messumformer, params: { art: Reihenklemmen, klemmen: 7, belegung: "1S1, 1S2, 2S1, 2S2, 3S1, 3S2, PE", ort: Messumformerschrank } }
datenverbindungen:
  # Abrechnung: Wandler -> Prüfklemmleiste -> Zähler
  - { von: BE2, nach: XT1, typ: wandler, art: k/l }
  - { von: XT1, nach: PG1, typ: wandler }
  # Fernwirk: Wandler -> Reihenklemmen -> 7-adriges Kabel -> Reihenklemmen -> Messumformer
  - { von: BE1, nach: XD2, typ: wandler, art: k/l }
  - { von: XD2, nach: XD3, typ: wandler, kabel: "Ölflex Classic 110 7G1,5" }
  - { von: XD3, nach: TF1, typ: wandler, klemmeNach: "I-L1, I-L2, I-L3" }
  # Messspannung des Messumformers
  - { von: BE1, nach: TF1, typ: spannung, art: "L1-L3, N", klemmeNach: "U-L1, U-L2, U-L3, U-N" }
  # Analogausgang 4...20 mA zur Fernwirktechnik des Netzbetreibers
  - { von: TF1, nach: KE1, typ: analog, art: 4...20 mA, klemmeVon: out1 }
  - { von: KE1, nach: QA1, art: Steuersignal }
`
