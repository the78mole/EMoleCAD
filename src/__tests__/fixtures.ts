import { BEISPIEL_YAML } from '../model/beispiel'
import type { Projekt } from '../model/types'
import { parseYaml } from '../model/yaml'

/** Beispiel mit Modul 2: zweiter Zählerstrang für steuerbare Verbraucher */
export function modul2(): Projekt {
  const p = parseYaml(BEISPIEL_YAML)
  p.komponenten.push(
    { id: 'FC10', typ: 'sls', quelle: 'WD1', params: { nennstrom: 35 } },
    { id: 'PG2', typ: 'zaehler', name: 'Zähler § 14a Modul 2', quelle: 'FC10', params: { art: 'Bezug' } },
  )
  for (const k of p.komponenten) if (k.id === 'FB2' || k.id === 'FC4') k.quelle = 'PG2'
  p.datenverbindungen = [...(p.datenverbindungen ?? []), { von: 'KE1', nach: 'PG2', art: 'LMN' }]
  return p
}
