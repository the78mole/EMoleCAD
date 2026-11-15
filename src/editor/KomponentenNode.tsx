import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { Knoten } from '../model/analyse'
import type { TypDef } from '../model/library'
import type { Komponente } from '../model/types'
import { TypIcon } from './TypIcon'

export type KomponentenNodeData = {
  k: Komponente
  def: TypDef
  knoten?: Knoten
  meldung?: 'fehler' | 'warnung'
}
export type KomponentenNodeTyp = Node<KomponentenNodeData, 'komponente'>

export function KomponentenNode({ data, selected }: NodeProps<KomponentenNodeTyp>) {
  const { k, def, knoten, meldung } = data
  const kurz = def.kurz?.(k.params ?? {}) ?? ''
  const leiter = knoten ? (knoten.dc ? 'DC' : knoten.pole === 3 ? '3~' : knoten.phase ?? '1~') : ''
  return (
    <div className={`kn ${selected ? 'sel' : ''} ${meldung ?? ''}`} style={{ ['--farbe' as string]: def.farbe }}>
      {!def.wurzel && <Handle type="target" id="strom-in" position={Position.Top} />}
      {def.daten && <Handle type="target" id="daten-in" position={Position.Left} className="daten-handle" title="Datenverbindung (Eingang)" />}
      {def.daten && <Handle type="source" id="daten-out" position={Position.Right} className="daten-handle" title="Datenverbindung ziehen" />}
      <div className="kn-kopf">
        <TypIcon art={def.symbol} />
        <span>{def.label}</span>
        {leiter && <span className="kn-leiter">{leiter}</span>}
      </div>
      <div className="kn-rumpf">
        <div className="kn-bmk">{knoten?.bmk ?? k.id}{k.fest && <span className="kn-fest" title="ID festgeschrieben"> 🔒</span>}</div>
        {k.name && <div className="kn-name">{k.name}</div>}
        {kurz.trim() && <div className="kn-kurz">{kurz}</div>}
      </div>
      {def.kinder && <Handle type="source" id="strom-out" position={Position.Bottom} />}
    </div>
  )
}
