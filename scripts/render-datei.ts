// Rendert ein Projekt-YAML als einpoligen und allpoligen Plan (A3): npm run render-datei -- projekt.yaml [ausgabeordner]
import { readFileSync, writeFileSync } from 'node:fs'
import { parseYaml } from '../src/model/yaml'
import { analysiere } from '../src/model/analyse'
import { zeichnePlan } from '../src/schematic/render'
import { erzeugeBlatt, VORLAGEN } from '../src/schematic/blatt'
const [datei, out = '.'] = process.argv.slice(2)
const p = parseYaml(readFileSync(datei, 'utf8'))
const a = analysiere(p)
console.log(a.meldungen)
for (const modus of ['einpolig', 'allpolig'] as const) {
  const plan = zeichnePlan(a, { modus, farbig: true, netz: p.netz, daten: p.datenverbindungen, pa: p.potentialausgleich, tabelle: true })
  const b = erzeugeBlatt(plan, p, modus, VORLAGEN[0])
  writeFileSync(`${out}/${modus}.svg`, b.svg)
}
