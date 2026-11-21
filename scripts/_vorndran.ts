import { readFileSync, writeFileSync } from 'node:fs'
import { parseYaml } from '../src/model/yaml'
import { analysiere } from '../src/model/analyse'
import { zeichnePlaene } from '../src/schematic/blaetter'
import { erzeugeBlatt, VORLAGEN } from '../src/schematic/blatt'
const p = parseYaml(readFileSync(process.argv[2], 'utf8'))
const a = analysiere(p)
const v = VORLAGEN[0]
const plaene: { m: 'einpolig' | 'allpolig'; plan: any }[] = []
for (const m of ['einpolig', 'allpolig'] as const)
  for (const plan of zeichnePlaene(a, { modus: m, farbig: true, netz: p.netz, tabelle: true, maxAbgaenge: Number(process.argv[4] ?? 16), daten: p.datenverbindungen, pa: p.potentialausgleich }, plaene.length + 1, v)) plaene.push({ m, plan })
plaene.forEach(({ m, plan }, i) => {
  writeFileSync(`${process.argv[3]}/blatt${i + 1}-${m}.svg`, erzeugeBlatt(plan, p, m, v, i + 1, plaene.length, true).svg)
  console.log(i + 1, m, [...plan.inhalt.matchAll(/>([^<]*S\.\d+[^<]*)</g)].map((x: any) => x[1]).join(' | '))
})
