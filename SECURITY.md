# Sicherheitsrichtlinie

*An English summary follows the German text. The German version is authoritative.*

## Unterstützte Versionen

EMoleCAD wird von einer Person in der Freizeit gepflegt. Sicherheitskorrekturen gibt es nur
für den jeweils neuesten Stand:

| Bestandteil | Unterstützt |
|---|---|
| `main` und die daraus gebaute Seite auf GitHub Pages | ja |
| die Einzeldatei `emolecad.html` aus dem neuesten Pages-Stand | ja |
| ältere Stände und lokal gespeicherte Kopien | nein, bitte aktualisieren |

## Eine Lücke melden

Bitte **keine öffentlichen Issues, Discussions oder Pull Requests** für Sicherheitslücken.

Melde sie vertraulich über
[„Report a vulnerability“](https://github.com/the78mole/EMoleCAD/security/advisories/new)
(GitHub Private Vulnerability Reporting). Hilfreich sind:

- betroffener Bestandteil (Editor, YAML-Import, Plan/PDF-Export, Speichern, Workflow) und Commit,
- Beschreibung und Auswirkung der Lücke,
- Schritte zum Nachvollziehen, gern mit einer minimalen YAML-Datei,
- falls bekannt, ein Vorschlag zur Behebung.

## Was Du erwarten kannst

- Eine Eingangsbestätigung innerhalb von **7 Tagen**.
- Eine erste Einschätzung innerhalb von **14 Tagen**.
- Eine Korrektur so schnell, wie es ein Ein-Personen-Projekt erlaubt; Ziel sind 60 Tage bei
  kritischen und hohen Schweregraden. Den Stand erfährst Du im Advisory.
- Nach der Korrektur wird das Advisory veröffentlicht. Du wirst darin als Melder genannt, es
  sei denn, Du möchtest anonym bleiben.

Es gibt kein Bug-Bounty-Programm.

## Geltungsbereich

Gemeint ist der Code in diesem Repository: die Web-Anwendung (läuft vollständig im Browser,
ohne Server), die Einzeldatei-Variante, die GitHub-Actions-Workflows und die Pages-Seite.

Nicht gemeint sind

- bereits öffentlich dokumentierte Advisories zu Abhängigkeiten (CVE, GHSA). Ein Hinweis darauf
  darf als normales Issue kommen, ohne Angaben dazu, wie es sich in EMoleCAD ausnutzen lässt;
- fachliche Fehler in erzeugten Schaltplänen. Diese bitte als normales Issue melden. EMoleCAD
  ersetzt keine Prüfung durch eine Elektrofachkraft;
- eigene Installationen oder Kopien Dritter.

---

## English summary

Only `main` and the current GitHub Pages build receive security fixes. Please do not report
vulnerabilities publicly; use
[GitHub private vulnerability reporting](https://github.com/the78mole/EMoleCAD/security/advisories/new).
This is a one-person project: expect an acknowledgement within 7 days and a first assessment
within 14 days. Reporters are credited in the published advisory unless they ask to stay
anonymous. There is no bug bounty. Already public advisories for dependencies may be filed as a
normal issue without project-specific exploit details. Errors in generated schematics are not
security issues; please open a normal issue.
