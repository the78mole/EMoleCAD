import { writeFileSync } from 'node:fs'
import { BEISPIEL_YAML } from '../src/model/beispiel'
import { parseYaml } from '../src/model/yaml'
import { analysiere } from '../src/model/analyse'
import { zeichnePlan } from '../src/schematic/render'
import { erzeugeBlatt, VORLAGEN } from '../src/schematic/blatt'
const out = process.argv[2] ?? '.'
const p = parseYaml(BEISPIEL_YAML)
const a = analysiere(p)
console.log(a.meldungen)
for (const modus of ['einpolig', 'allpolig'] as const) {
  const plan = zeichnePlan(a, { modus, farbig: true, netz: p.netz })
  const b = erzeugeBlatt(plan, p, modus, VORLAGEN[0])
  writeFileSync(`${out}/${modus}.svg`, b.svg)
}
