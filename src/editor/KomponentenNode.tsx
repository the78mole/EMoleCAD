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
      {!def.wurzel && <Handle type="target" position={Position.Top} />}
      <div className="kn-kopf">
        <TypIcon art={def.symbol} />
        <span>{def.label}</span>
        {leiter && <span className="kn-leiter">{leiter}</span>}
      </div>
      <div className="kn-rumpf">
        <div className="kn-bmk">{knoten?.bmk ?? k.id}</div>
        {k.name && <div className="kn-name">{k.name}</div>}
        {kurz.trim() && <div className="kn-kurz">{kurz}</div>}
      </div>
      {def.kinder && <Handle type="source" position={Position.Bottom} />}
    </div>
  )
}
