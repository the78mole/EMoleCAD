# Beiträge zu EMoleCAD

Beiträge sind willkommen: Fehlerberichte, Ideen, neue Bausteine für die Bibliothek, Symbole,
Blattvorlagen oder Code.

*An English summary follows the German text.*

## Lizenz und Herkunft (DCO)

EMoleCAD steht unter der [MIT-Lizenz](LICENSE). Mit einem Beitrag erklärst Du Dich damit
einverstanden, dass er unter derselben Lizenz veröffentlicht wird.

Jeder Commit trägt eine `Signed-off-by`-Zeile (`git commit -s`). Damit bestätigst Du das
[Developer Certificate of Origin 1.1](https://developercertificate.org/): Du hast das Recht,
den Beitrag unter der Projektlizenz einzureichen.

## Entwicklung

```bash
npm ci
npm run dev          # Entwicklungsserver
npm test             # Unit-Tests (vitest)
npm run lint         # oxlint
npm run build        # Typprüfung und Build für GitHub Pages
npm run build:single # einzelne, offline nutzbare HTML-Datei
```

Vor einem Pull Request sollten `npm run lint`, `npm test` und `npm run build` grün sein; die
CI prüft dasselbe.

### Konventionen

- Bedienoberfläche, Fehlermeldungen und Code-Bezeichner sind deutsch.
- Ein Datenmodell (`src/model/`) ist die einzige Wahrheit; YAML und grafischer Editor sind
  Ansichten darauf. Neue Felder brauchen YAML-Ein- und -Ausgabe und einen Roundtrip-Test.
- Kennbuchstaben folgen DIN EN IEC 81346-2:2019 (siehe README).
- Neue Abhängigkeiten nur, wenn es nicht vernünftig ohne geht. Renovate hält sie aktuell.
- Commit-Nachrichten im Stil `feat: …`, `fix: …`, `docs: …`.

## English summary

Contributions are welcome under the MIT license. Every commit needs a `Signed-off-by` line
(`git commit -s`, Developer Certificate of Origin 1.1). Run `npm ci`, then `npm run lint`,
`npm test` and `npm run build` before opening a pull request. UI texts and identifiers are
German. Report security issues privately as described in [SECURITY.md](SECURITY.md).
