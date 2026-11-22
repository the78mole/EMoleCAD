# EMoleCAD

[![CI](https://github.com/the78mole/EMoleCAD/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/the78mole/EMoleCAD/actions/workflows/ci.yml)
[![Pages](https://github.com/the78mole/EMoleCAD/actions/workflows/pages.yml/badge.svg)](https://the78mole.github.io/EMoleCAD/)
[![CodeQL](https://github.com/the78mole/EMoleCAD/actions/workflows/codeql.yml/badge.svg)](https://github.com/the78mole/EMoleCAD/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/the78mole/EMoleCAD/badge)](https://scorecard.dev/viewer/?uri=github.com/the78mole/EMoleCAD)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/16739/badge)](https://www.bestpractices.dev/projects/16739)
[![Security Policy](https://img.shields.io/badge/Security-Policy-brightgreen?logo=github)](SECURITY.md)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue)](LICENSE)

**Direkt im Browser starten: <https://the78mole.github.io/EMoleCAD/>** · Offline-Version als
Einzeldatei: [emolecad.html](https://the78mole.github.io/EMoleCAD/emolecad.html) (herunterladen und
in Chrome/Edge öffnen, dann wird direkt in die geöffnete Datei gespeichert).

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

Ohne Installation: `emolecad.html` direkt im Browser öffnen.

## Bedienung

- **Grafischer Editor**: Bausteine aus der Bibliothek links auf die Fläche ziehen (oder doppelklicken – dann hängt der neue Baustein direkt an der ausgewählten Komponente). Verbindung vom unteren Anschluss (Abgang) zum oberen Anschluss (Einspeisung) ziehen. Klick auf einen Baustein öffnet die Eigenschaften. `Entf` löscht Bausteine oder Verbindungen.
- **YAML**: Dieselben Daten als Text. Änderungen werden sofort übernommen; bei Syntaxfehlern bleibt der letzte gültige Stand stehen.
- **Plan**: Umschalten einpolig/allpolig, Anordnung wählen („Einspeisung links, Spalten“ im HagerCAD-Stil mit Stromkreistabelle oder „Baum von oben“), Blattvorlage wählen (A3/A4 mit Schriftfeld, kompakt, ohne Rahmen), Export als SVG, PDF oder PDF mit beiden Plänen.
- **Neu nummerieren** (im grafischen Editor) vergibt die Kennzeichen je Kennbuchstaben (FC1, FC2, …) in Lesereihenfolge der Bausteine im Editor: Zeile für Zeile von oben nach unten, innerhalb einer Zeile von links nach rechts. Quellen und Datenverbindungen werden mit umbenannt. Komponenten mit Häkchen „ID festschreiben“ (im YAML `fest: true`, im Editor mit 🔒 markiert) behalten ihre ID; diese IDs werden auch nicht an andere vergeben. Beispiel: `FC001` festgeschrieben, die übrigen Überstromschutzgeräte zählen trotzdem ab `FC1`.
- Die Reihenfolge der Spalten im Plan folgt der Anordnung im grafischen Editor (links nach rechts); ohne Editorpositionen gilt die Reihenfolge im YAML.
- **Einstellungen** (⚙ oben rechts): Logo (PNG, JPG oder SVG) für das Schriftfeld hinterlegen oder entfernen. Es erscheint auf jedem Blatt neben dem Schriftfeld (beim kompakten Schriftfeld vor dem Titel) und in SVG- und PDF-Export; SVG-Logos bleiben im PDF vektoriell. Das Logo gilt für alle Projekte und liegt nur im Browser (IndexedDB, getrennt vom Projektentwurf), es wird nirgends hochgeladen und steht nicht im Projekt-YAML.
- Editor und Plan lassen sich über „Einklappen“ zur Seite klappen; der andere Bereich bekommt dann die volle Breite. Die schmale Leiste am Rand blendet ihn wieder ein.
- Beim Ziehen rasten Bausteine weich ein: zuerst an benachbarten Bausteinen (gleiche linke Kante oder Oberkante, mit roter Hilfslinie), sonst am Raster der automatischen Anordnung (Spalten 210 px, Zeilen 130 px). Mit gedrückter `Alt`-Taste lässt sich frei schieben.
- Im grafischen Editor laufen alle Abgänge einer Komponente über einen gemeinsamen Bus; die Leiterangabe (z. B. `L1/N/PE`) steht direkt über der angeschlossenen Komponente.

## Speichern

Menü **Datei** (oben rechts) und Knopf **Speichern**:

- **Öffnen…** (`Strg+O`), **Speichern** (`Strg+S`), **Speichern unter…** (`Strg+Umschalt+S`), **Zuletzt verwendet**.
- In Chrome, Edge und Opera wird wie bei draw.io direkt in die geöffnete Datei zurückgeschrieben (File System Access API). Die Datei bleibt auch nach einem Neuladen verbunden; der Browser fragt beim ersten Speichern ggf. noch einmal nach der Berechtigung.
- In Firefox und Safari gibt es kein direktes Zurückschreiben: Speichern lädt die YAML-Datei herunter.
- Ungespeicherte Änderungen werden mit ● neben dem Dateinamen markiert, beim Schließen des Tabs gibt es eine Warnung. Zusätzlich liegt immer ein Entwurf im Browser (localStorage), sodass nach einem Absturz nichts verloren geht.
- Speicherorte sind austauschbar (`src/speicher/`): jeder Ort implementiert `oeffnen`, `laden`, `speichern`, `speichernUnter`. Lokal ist umgesetzt; GitHub, Nextcloud (WebDAV) und Google Drive werden dort als weitere Speicherorte angehängt.

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
  - id: XD1         # wird zum BMK "-XD1"
    typ: hausanschluss
    params: { sicherung: 63, sicherungstyp: NH00 gG }
  - id: FC5
    typ: ls
    quelle: FB1     # vorgeschaltete Komponente (Baumstruktur)
    phase: L1       # bei 1-polig
    params: { charakteristik: B, nennstrom: 16 }
    produkt: { hersteller: Musterfirma, artikel: LS-B16-1P }   # verwendetes Produkt (Tabelle)
  - id: EA1
    typ: verbraucher
    name: Licht EG
    quelle: FC5
    params: { verwendung: Beleuchtung }   # bestimmt die Kennbuchstaben (EA)
    kabel: { typ: NYM-J, querschnitt: "3x1,5", laenge: 12 }   # Zuleitung zu dieser Komponente
editor:             # optional: Positionen im grafischen Editor
  XD1: [0, 0]
```

Felder je Komponente: `id`, `fest` (ID festschreiben), `typ`, `name`, `quelle`, `pole` (1|3, beim Lasttrennschalter auch 2|4 mit geschaltetem N), `voreilend` (N-Kontakt voreilend, nur bei 2|4), `phase` (L1|L2|L3), `kabel`, `produkt` (`hersteller`, `artikel`), `params`.
Ohne `pole` gilt der Standard des Typs; unter einer einphasigen Zuleitung wird automatisch einphasig angeschlossen.

### Typen (Bibliothek)

| typ | Bedeutung | Kennbuchstaben | wichtige params |
|---|---|---|---|
| `hausanschluss` | HAK mit Vorsicherung | XD | sicherung, sicherungstyp, netzbetreiber |
| `hlak` | Hauptleiteranschlussklemme (Einspeisekette) | XD | querschnitt, nennstrom |
| `zaehler` | Zähler | PG | art (Bezug/Zweirichtung/Erzeugung/Unterzähler), zaehlernummer, messkonzept |
| `sls` | SLS-Schalter | FC | nennstrom |
| `trennschalter` | Lasttrennschalter | QB | nennstrom; Datenanschluss (z. B. Steuerung durch Hybrid-Wechselrichter); Polzahl 1/2/3/4, auch 4-polig voreilend (z. B. Netztrennung für Ersatzstrom) |
| `sicherung` | Schmelzsicherung | FC | nennstrom, bauform |
| `rcd` | FI-Schutzschalter | FB | nennstrom, fehlerstrom, rcdtyp |
| `ls` | Leitungsschutzschalter | FC | charakteristik, nennstrom |
| `rcbo` | FI/LS | FB | charakteristik, nennstrom, fehlerstrom, rcdtyp |
| `spd` | Überspannungsschutz | FA | spdtyp |
| `wechselrichter` | PV-Wechselrichter | TB | leistung, modell, hybrid |
| `pv_generator` | PV-Generator (DC) | GC | leistung, module, strings |
| `speicher` | Batteriespeicher (DC, wenn unter Wechselrichter) | CC | kapazitaet, leistung |
| `wallbox` | Wallbox | XD | leistung, steuerbar |
| `waermepumpe` | Wärmepumpe | EG | leistung, steuerbar |
| `verbraucher` | Verbraucher / Stromkreis | je Verwendung: XD Steckdosen, EA Beleuchtung, EB Heizung/Herd, Backofen, Waschmaschine, Wäschetrockner, Spülmaschine, Elektrogerät, EC Kühl-/Gefriergerät, MA Motor, XD Reserve; eigener Freitext möglich (im Projekt verwendete Texte erscheinen in der Auswahl, Kennbuchstaben dann XD) | verwendung, leistung |
| `steuerbox` | Steuerbox / Rundsteuerempfänger | KE | art |
| `smgw` | Smart-Meter-Gateway | KE | modell |
| `sammelschiene` | Sammelschiene (Abgänge hängen daran) | WD | nennstrom, querschnitt |
| `unterverteilung` | Unterverteilung | UC | ort |
| `pas` | Potentialausgleichsschiene (ohne Quelle, siehe Potentialausgleich) | PAS | erder, querschnitt |

Die Kennbuchstaben (Klasse + Unterklasse) folgen DIN EN IEC 81346-2:2019. Verbraucher werden im einpoligen Plan mit dem Schaltzeichen ihrer Verwendung nach DIN EN 60617 gezeichnet (Steckdose, Leuchte, Herd, Backofen, Kühl-/Gefriergerät, Wasch-/Spülmaschine, Wäschetrockner, Motor, Reserve als offenes Leitungsende, sonst Elektrogerät „E“). Neue Typen werden in `src/model/library.ts` ergänzt (Plansymbole in `src/schematic/render.ts`).

### Ungezählter Bereich (Vorzählerbereich)

Komponenten, deren `quelle` der Hausanschluss (oder ein anderes Gerät der Einspeisekette vor der Hauptverteilung) ist, werden im Plan
rechts neben der Einspeisung als paralleler Abgriff nach oben gezeichnet, z. B. Überspannungsschutz und ein LS 6 A für Steuerbox und SMGW:

```yaml
  - { id: WD1, typ: sammelschiene, quelle: XD1 }
  - { id: FA1, typ: spd,   quelle: WD1 }
  - { id: FC1, typ: sls,   quelle: WD1 }   # weiter zum Zähler PG1, danach HLAK XD2
  - { id: FC2, typ: ls,    quelle: WD1, phase: L1, params: { charakteristik: B, nennstrom: 6 } }
  - { id: KE1, typ: smgw,      quelle: FC2 }
  - { id: KE2, typ: steuerbox, quelle: FC2 }
```

Die Einspeisekette läuft über Sammelschiene, SLS, Zähler, HLAK, SLS, Trennschalter oder Sicherung weiter; an der ersten anderen Verzweigung beginnt die Sammelschiene.

Abzweige hinter dem (ersten) Zähler, etwa eine zweite HLAK mit eigener Verteilung, werden dagegen wie die
Hauptverteilung von oben nach unten aufgebaut: Eine Steigleitung führt vom Abgriff hoch, darunter folgen die
Schutzorgane, die Endverbraucher stehen immer in der untersten Zeile direkt über der Stromkreistabelle.

### Steuerleitungen

Datenverbindungen zwischen dem ungezählten Bereich (SMGW, Steuerbox) und Geräten der Verteilung (Wechselrichter,
Wallbox, Speicher, Wärmepumpe, Unterverteilung, …) laufen über einen Kanal unter den Endverbrauchern: Jede Leitung
hat dort eine eigene Spur. Endverbraucher werden von unten angefahren, Geräte mit Abgängen über eine eigene Gasse
rechts neben ihrem Teilbaum. Verbindungen innerhalb des ungezählten Bereichs und zum Zähler (LMN, CLS) bleiben kurz und direkt.

### Mehrere Zähler (z. B. § 14a Modul 2)

Zweigt vor dem Hauptzähler ein weiterer Zählerstrang ab (etwa ein eigener Zähler für steuerbare Verbraucher), kommt dieser
auf ein eigenes Blatt. Auf Blatt 1 endet der Abgang in einem Verweispfeil mit der Blattangabe der Gegenstelle, also
des Zuführungspfeils auf Blatt 2 (z. B. `S.2-D1`, daneben `-FC10`). Blatt 2 beginnt mit `von -WD1 S.1-C3`, dem Verweis
zurück auf den Abgangspfeil. Datenverbindungen und Potentialausgleich zwischen den Blättern
werden als Stich mit Verweis gezeichnet (`LMN: -KE1  S.1-B2`, das Planquadrat des Stichs auf Blatt 1). Der ungezählte Bereich mit SPD, SMGW und Steuerbox bleibt dabei auf Blatt 1 beisammen.

### Folgeblätter

Stehen auf einem Blatt mehr Stromkreise als eingestellt (Auswahl „Stromkreise/Blatt“ in der Planleiste; *auto* = 16 bei A3,
10 bei A4, unbegrenzt ohne Rahmen), geht der Plan auf einem Folgeblatt weiter. Umgebrochen wird an ganzen Teilbäumen,
üblicherweise einem FI mit seinen Stromkreisen; passt ein Teilbaum allein nicht auf ein Blatt, wird innerhalb davon
umgebrochen (z. B. zwischen den LS eines großen FI). Auf dem abgebenden Blatt endet der Abgang in einem Verweispfeil
(z. B. `S.2-C1`, daneben `-FB21 ... -FB57`) auf den Zuführungspfeil des Folgeblatts. Das Folgeblatt beginnt mit
`von -QB1 S.1-D8`, dem Verweis zurück auf den Abgangspfeil. Einpoliger und allpoliger Plan
werden gleich aufgeteilt.

Querverweise nennen Seite und Planquadrat der Gegenstelle: `S.3-B1` heißt Blatt 3, Zeile B, Spalte 1 der Randeinteilung
(Spalten 1, 2, … oben und unten, Zeilen A, B, … links und rechts). Gegenstelle ist die Stelle, an der die Leitung auf dem
anderen Blatt weitergeht: Der Abgangspfeil verweist auf den Zuführungspfeil des Folgeblatts, dieser zurück auf den
Abgangspfeil; Stiche von Daten- und Potentialausgleichsleitungen verweisen auf den Stich derselben Verbindung. Bei der
Vorlage ohne Rahmen steht nur die Seite (`S.3`).

```yaml
  - { id: FC10, typ: sls,     quelle: WD1, params: { nennstrom: 35 } }
  - { id: PG2,  typ: zaehler, quelle: FC10, name: Zähler § 14a Modul 2 }
  - { id: FC4,  typ: ls,      quelle: PG2, pole: 3 }
datenverbindungen:
  - { von: KE1, nach: PG2, art: LMN }
```

### Informationsverbindungen

Kommunikationsleitungen stehen getrennt von der Energieversorgung in `datenverbindungen` und werden im Plan violett strichpunktiert gezeichnet:

```yaml
datenverbindungen:
  - { von: KE1, nach: PG1, art: LMN }   # SMGW – Zähler
  - { von: KE2, nach: KE1, art: CLS }   # Steuerbox – SMGW
```

Im grafischen Editor haben kommunikationsfähige Bausteine (Zähler, Lasttrennschalter, SMGW, Steuerbox, Wechselrichter, Speicher, Wallbox, Wärmepumpe) violette Anschlüsse links/rechts. Eine Verbindung von rechts nach links erzeugt eine Datenverbindung; die Art (LMN, CLS, Modbus …) lässt sich in den Eigenschaften bearbeiten. Für SMGW–Zähler und SMGW–Steuerbox wird LMN bzw. CLS vorbelegt, für Wechselrichter–Lasttrennschalter Steuersignal.

### Potentialausgleich

Die Potentialausgleichsschiene (`typ: pas`, Kürzel PAS, bewusst abweichend von IEC 81346-2) hat keine Quelle. Ihre Verbindungen stehen getrennt vom Strompfad in `potentialausgleich` und werden im Plan grün mit Querschnitt gezeichnet. Am SPD ersetzt die Verbindung das Erdungssymbol.

```yaml
komponenten:
  - { id: PAS1, typ: pas, params: { erder: Fundamenterder, querschnitt: 16 } }
potentialausgleich:
  - { von: PAS1, nach: XD1, querschnitt: 16 }   # HAK
  - { von: PAS1, nach: WD1, querschnitt: 16 }   # Sammelschiene
  - { von: PAS1, nach: FA1, querschnitt: 16 }   # Überspannungsschutz
```

Im Editor haben anschließbare Bausteine (HAK, Sammelschiene, SPD, Unterverteilung, PV-Generator, Wechselrichter, Speicher, PAS) grüne runde Anschlüsse unten links/rechts.

## Architektur

```
src/model/      Datenmodell, YAML-Ein-/Ausgabe, Analyse (Baum, Leiter, Prüfungen), Bibliothek
src/schematic/  SVG-Generator einpolig/allpolig (render.ts) und Blattvorlagen mit Schriftfeld (blatt.ts)
src/editor/     Node-Editor (React Flow): Bibliothek, Bausteine, Eigenschaften
src/speicher/   Speicherorte (lokal; Schnittstelle für GitHub, Nextcloud, Google Drive)
src/ui/         Datei-Menü, YAML-Editor (CodeMirror), Planansicht, PDF/SVG-Export (jsPDF + svg2pdf.js)
```

Ein gemeinsames Datenmodell ist die einzige Wahrheit; YAML und Node-Editor sind zwei Ansichten darauf. Die Prüfung meldet u. a. fehlende Quellen, Kreise, doppelte IDs, Phasenkonflikte und Schieflast > 4,6 kVA.

## Lizenz und Mitwirken

EMoleCAD steht unter der [MIT-Lizenz](LICENSE). Beiträge sind willkommen, siehe
[CONTRIBUTING.md](CONTRIBUTING.md) und [Verhaltenskodex](CODE_OF_CONDUCT.md). Sicherheitslücken
bitte vertraulich melden, siehe [SECURITY.md](SECURITY.md).

EMoleCAD ist ein Hilfsmittel zum Zeichnen. Die erzeugten Pläne ersetzen keine Planung und Prüfung
durch eine Elektrofachkraft und keine Abstimmung mit dem Netzbetreiber.
