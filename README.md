# MoleCAD

Tool zur Erstellung von Elektro-Übersichtsplänen in einpoliger und allpoliger Darstellung.

Eine WebUI, die auf der einen Seite eine strukturierte Eingabe ermöglicht (YAML **oder** grafischer Node-Editor im Stil von Node-RED) und auf der anderen Seite daraus den Schaltplan erzeugt. Der Plan ist als PDF/SVG exportierbar und unterstützt auswählbare Blattvorlagen.

## Schnellstart

```bash
npm install
npm run dev          # Entwicklungsserver auf http://localhost:5173
npm test             # Unit-Tests (vitest)
npm run build        # statischer Build nach dist/
npm run build:single # eine einzige HTML-Datei nach dist-single/ (offline nutzbar)
```

Ohne Installation: `molecad.html` direkt im Browser öffnen.

## Bedienung

- **Grafischer Editor**: Bausteine aus der Bibliothek links auf die Fläche ziehen (oder doppelklicken – dann hängt der neue Baustein direkt an der ausgewählten Komponente). Verbindung vom unteren Anschluss (Abgang) zum oberen Anschluss (Einspeisung) ziehen. Klick auf einen Baustein öffnet die Eigenschaften. `Entf` löscht Bausteine oder Verbindungen.
- **YAML**: Dieselben Daten als Text. Änderungen werden sofort übernommen; bei Syntaxfehlern bleibt der letzte gültige Stand stehen.
- **Plan**: Umschalten einpolig/allpolig, Anordnung wählen („Einspeisung links, Spalten“ im HagerCAD-Stil mit Stromkreistabelle oder „Baum von oben“), Blattvorlage wählen (A3/A4 mit Schriftfeld, kompakt, ohne Rahmen), Export als SVG, PDF oder PDF mit beiden Plänen.
- Editor und Plan lassen sich über „Einklappen“ zur Seite klappen; der andere Bereich bekommt dann die volle Breite. Die schmale Leiste am Rand blendet ihn wieder ein.
- Der Stand wird automatisch im Browser (localStorage) gespeichert; „YAML speichern“/„Öffnen…“ für Dateien.

## YAML-Format

```yaml
projekt:            # Angaben fürs Schriftfeld
  titel: Einfamilienhaus Muster
  kunde: Familie Muster
  adresse: Musterweg 1
  ersteller: Elektro Maulwurf
  datum: 2026-11-15
  zeichnungsnummer: EFH-001
  revision: A
netz:
  form: TN-C-S      # TN-C-S | TN-S | TT
  spannung: 230/400 V
komponenten:
  - id: X1          # wird zum BMK "-X1"
    typ: hausanschluss
    params: { sicherung: 63, sicherungstyp: NH00 gG }
  - id: F3
    typ: ls
    quelle: F2      # vorgeschaltete Komponente (Baumstruktur)
    phase: L1       # bei 1-polig
    params: { charakteristik: B, nennstrom: 16 }
  - id: E1
    typ: verbraucher
    name: Licht EG
    quelle: F3
    kabel: { typ: NYM-J, querschnitt: "3x1,5", laenge: 12 }   # Zuleitung zu dieser Komponente
editor:             # optional: Positionen im grafischen Editor
  X1: [0, 0]
```

Felder je Komponente: `id`, `typ`, `name`, `quelle`, `pole` (1|3), `phase` (L1|L2|L3), `kabel`, `params`.
Ohne `pole` gilt der Standard des Typs; unter einer einphasigen Zuleitung wird automatisch einphasig angeschlossen.

### Typen (Bibliothek)

| typ | Bedeutung | wichtige params |
|---|---|---|
| `hausanschluss` | HAK mit Vorsicherung | sicherung, sicherungstyp, netzbetreiber |
| `zaehler` | Zähler | art (Bezug/Zweirichtung/Erzeugung/Unterzähler), zaehlernummer, messkonzept |
| `sls` | SLS-Schalter | nennstrom |
| `trennschalter` | Lasttrennschalter | nennstrom |
| `sicherung` | Schmelzsicherung | nennstrom, bauform |
| `rcd` | FI-Schutzschalter | nennstrom, fehlerstrom, rcdtyp |
| `ls` | Leitungsschutzschalter | charakteristik, nennstrom |
| `rcbo` | FI/LS | charakteristik, nennstrom, fehlerstrom, rcdtyp |
| `spd` | Überspannungsschutz | spdtyp |
| `wechselrichter` | PV-Wechselrichter | leistung, hersteller, hybrid |
| `pv_generator` | PV-Generator (DC) | leistung, module, strings |
| `speicher` | Batteriespeicher (DC, wenn unter Wechselrichter) | kapazitaet, leistung |
| `wallbox` | Wallbox | leistung, steuerbar |
| `waermepumpe` | Wärmepumpe | leistung, steuerbar |
| `verbraucher` | Verbraucher / Stromkreis | leistung |
| `steuerbox` | Steuerbox / Rundsteuerempfänger | art |
| `smgw` | Smart-Meter-Gateway | hersteller |
| `unterverteilung` | Unterverteilung | ort |

Neue Typen werden in `src/model/library.ts` ergänzt (Plansymbole in `src/schematic/render.ts`).

### Ungezählter Bereich (Vorzählerbereich)

Komponenten, deren `quelle` der Hausanschluss (oder ein anderes Gerät der Einspeisekette vor der Hauptverteilung) ist, werden im Plan
rechts neben der Einspeisung als paralleler Abgriff nach oben gezeichnet, z. B. Überspannungsschutz und ein LS 6 A für Steuerbox und SMGW:

```yaml
  - { id: F1,  typ: spd,   quelle: X1 }
  - { id: F11, typ: ls,    quelle: X1, phase: L1, params: { charakteristik: B, nennstrom: 6 } }
  - { id: K1,  typ: steuerbox, quelle: F11 }
  - { id: K2,  typ: smgw,      quelle: F11 }
```

Die Einspeisekette läuft über Zähler, SLS, Trennschalter oder Sicherung weiter; an der ersten anderen Verzweigung beginnt die Sammelschiene.

### Informationsverbindungen

Kommunikationsleitungen stehen getrennt von der Energieversorgung in `datenverbindungen` und werden im Plan violett strichpunktiert gezeichnet:

```yaml
datenverbindungen:
  - { von: K2, nach: P1, art: LMN }   # SMGW – Zähler
  - { von: K1, nach: K2, art: CLS }   # Steuerbox – SMGW
```

Im grafischen Editor haben kommunikationsfähige Bausteine (Zähler, SMGW, Steuerbox, Wechselrichter, Speicher, Wallbox, Wärmepumpe) violette Anschlüsse links/rechts. Eine Verbindung von rechts nach links erzeugt eine Datenverbindung; die Art (LMN, CLS, Modbus …) lässt sich in den Eigenschaften bearbeiten. Für SMGW–Zähler und SMGW–Steuerbox wird LMN bzw. CLS vorbelegt.

## Architektur

```
src/model/      Datenmodell, YAML-Ein-/Ausgabe, Analyse (Baum, Leiter, Prüfungen), Bibliothek
src/schematic/  SVG-Generator einpolig/allpolig (render.ts) und Blattvorlagen mit Schriftfeld (blatt.ts)
src/editor/     Node-Editor (React Flow): Bibliothek, Bausteine, Eigenschaften
src/ui/         YAML-Editor (CodeMirror), Planansicht, PDF/SVG-Export (jsPDF + svg2pdf.js)
```

Ein gemeinsames Datenmodell ist die einzige Wahrheit; YAML und Node-Editor sind zwei Ansichten darauf. Die Prüfung meldet u. a. fehlende Quellen, Kreise, doppelte IDs, Phasenkonflikte und Schieflast > 4,6 kVA.
