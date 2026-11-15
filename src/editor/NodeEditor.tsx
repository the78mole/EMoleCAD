import {
  Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow,
  type Connection, type Edge, type NodeChange, type EdgeChange, type IsValidConnection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Analyse } from '../model/analyse'
import { typDef } from '../model/library'
import { autoLayout, neuNummerieren, datenTrennen, datenVerbinden, entfernen, hinzufuegen, istVorfahr, setzeQuelle } from '../model/ops'
import type { Projekt } from '../model/types'
import { Bibliothek } from './Bibliothek'
import { Eigenschaften } from './Eigenschaften'
import { KomponentenNode, type KomponentenNodeTyp } from './KomponentenNode'
import { aktualisieren } from '../model/ops'

const nodeTypes = { komponente: KomponentenNode }

interface Props {
  projekt: Projekt
  analyse: Analyse
  onChange: (p: Projekt) => void
}

function Innen({ projekt, analyse, onChange }: Props) {
  const rf = useReactFlow()
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const huelle = useRef<HTMLDivElement>(null)

  const autoPos = useMemo(() => autoLayout(projekt), [projekt])
  const sollNodes = useMemo<KomponentenNodeTyp[]>(() => {
    const stufe = new Map<string, 'fehler' | 'warnung'>()
    for (const m of analyse.meldungen) if (m.id && m.stufe !== 'info' && stufe.get(m.id) !== 'fehler') stufe.set(m.id, m.stufe as 'fehler' | 'warnung')
    return projekt.komponenten.map((k) => ({
      id: k.id,
      type: 'komponente',
      position: projekt.editor?.[k.id] ?? autoPos[k.id] ?? { x: 0, y: 0 },
      selected: k.id === auswahl,
      data: { k, def: typDef(k.typ), knoten: analyse.knoten.get(k.id), meldung: stufe.get(k.id) },
    }))
  }, [projekt, analyse, autoPos, auswahl])
  const [nodes, setNodes] = useState<KomponentenNodeTyp[]>(sollNodes)
  useEffect(() => setNodes(sollNodes), [sollNodes])

  const edges = useMemo<Edge[]>(
    () =>
      projekt.komponenten
        .filter((k) => k.quelle && projekt.komponenten.some((q) => q.id === k.quelle))
        .map((k) => {
          const kn = analyse.knoten.get(k.id)
          const e: Edge = {
            id: `${k.quelle}->${k.id}`,
            source: k.quelle!,
            target: k.id,
            sourceHandle: 'strom-out',
            targetHandle: 'strom-in',
            type: 'smoothstep',
            label: kn ? (kn.dc ? 'DC' : kn.pole === 3 ? '3/N/PE' : `${kn.phase}/N/PE`) : undefined,
            className: kn?.dc ? 'kante-dc' : kn?.pole === 3 ? 'kante-3' : 'kante-1',
          }
          return e
        })
        .concat(
          (projekt.datenverbindungen ?? [])
            .filter((d) => projekt.komponenten.some((k) => k.id === d.von) && projekt.komponenten.some((k) => k.id === d.nach))
            .map((d): Edge => ({
              id: `daten:${d.von}->${d.nach}`,
              source: d.von,
              target: d.nach,
              sourceHandle: typDef(projekt.komponenten.find((k) => k.id === d.von)!.typ).daten ? 'daten-out' : undefined,
              targetHandle: typDef(projekt.komponenten.find((k) => k.id === d.nach)!.typ).daten ? 'daten-in' : undefined,
              type: 'default',
              label: d.art,
              className: 'kante-daten',
            })),
        ),
    [projekt, analyse],
  )

  // Ref, damit Callbacks immer den aktuellen Stand sehen
  const pRef = useRef(projekt)
  pRef.current = projekt

  const onNodesChange = useCallback((changes: NodeChange<KomponentenNodeTyp>[]) => {
    const loeschen = changes.filter((c) => c.type === 'remove').map((c) => c.id)
    if (loeschen.length) {
      onChange(entfernen(pRef.current, loeschen))
      setAuswahl(null)
      return
    }
    for (const c of changes) if (c.type === 'select' && c.selected) setAuswahl(c.id)
    setNodes((ns) => applyNodeChanges(changes, ns))
  }, [onChange])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    let p = pRef.current
    for (const c of changes) {
      if (c.type !== 'remove') continue
      if (c.id.startsWith('daten:')) {
        const [von, nach] = c.id.slice(6).split('->')
        p = datenTrennen(p, von, nach)
      } else p = setzeQuelle(p, c.id.split('->')[1], undefined)
    }
    if (p !== pRef.current) onChange(p)
  }, [onChange])

  const isValidConnection: IsValidConnection = useCallback((c) => {
    if (!c.source || !c.target || c.source === c.target) return false
    if (c.sourceHandle === 'daten-out' || c.targetHandle === 'daten-in') return c.sourceHandle === 'daten-out' && c.targetHandle === 'daten-in'
    const ziel = pRef.current.komponenten.find((k) => k.id === c.target)
    if (!ziel || typDef(ziel.typ).wurzel) return false
    return !istVorfahr(pRef.current, c.target, c.source)
  }, [])

  const onConnect = useCallback((c: Connection) => {
    if (c.sourceHandle === 'daten-out') onChange(datenVerbinden(pRef.current, c.source, c.target))
    else onChange(setzeQuelle(pRef.current, c.target, c.source))
  }, [onChange])

  const onNodeDragStop = useCallback((_: unknown, __: unknown, bewegt: KomponentenNodeTyp[]) => {
    const p = pRef.current
    const editor = { ...autoLayout(p), ...(p.editor ?? {}) }
    for (const n of bewegt) editor[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
    onChange({ ...p, editor })
  }, [onChange])

  const neu = useCallback((typ: string, pos?: { x: number; y: number }) => {
    const p = pRef.current
    // Neue Komponente automatisch an die Auswahl hängen, wenn das passt
    const sel = auswahl ? p.komponenten.find((k) => k.id === auswahl) : undefined
    const quelle = sel && typDef(sel.typ).kinder && !typDef(typ).wurzel ? sel.id : undefined
    let position = pos
    if (!position) {
      const basis = sel ? (p.editor?.[sel.id] ?? autoLayout(p)[sel.id]) : undefined
      position = basis ? { x: basis.x + 40, y: basis.y + 130 } : rf.screenToFlowPosition({ x: (huelle.current?.getBoundingClientRect().left ?? 0) + 200, y: (huelle.current?.getBoundingClientRect().top ?? 0) + 120 })
    }
    const fest = { ...autoLayout(p), ...(p.editor ?? {}) }
    const r = hinzufuegen({ ...p, editor: fest }, typ, position, pos ? undefined : quelle)
    onChange(r.projekt)
    setAuswahl(r.id)
  }, [auswahl, onChange, rf])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const typ = e.dataTransfer.getData('application/molecad')
    if (!typ) return
    const pos = rf.screenToFlowPosition({ x: e.clientX - 80, y: e.clientY - 20 })
    neu(typ, pos)
  }, [neu, rf])

  // Nach Ein-/Ausklappen bzw. Größenänderung neu einpassen
  useEffect(() => {
    const el = huelle.current
    if (!el) return
    let breite = el.clientWidth
    let t: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - breite) < 80) return
      breite = el.clientWidth
      clearTimeout(t)
      t = setTimeout(() => rf.fitView({ padding: 0.15, duration: 200 }), 120)
    })
    ro.observe(el)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [rf])

  const anordnen = () => {
    onChange({ ...pRef.current, editor: autoLayout(pRef.current) })
    setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 50)
  }

  return (
    <div className="node-editor">
      <Bibliothek onHinzufuegen={(t) => neu(t)} />
      <div className="flaeche" ref={huelle} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => setAuswahl(null)}
          deleteKeyCode={['Delete', 'Backspace']}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.15}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls />
          <MiniMap pannable zoomable nodeColor={(n) => (n.data as KomponentenNodeTyp['data']).def.farbe} />
        </ReactFlow>
        <div className="flaeche-werkzeug">
          <button onClick={() => { onChange(neuNummerieren(pRef.current)); setAuswahl(null) }} title="Kennzeichen (F1, F2, …) von links nach rechts neu vergeben">Neu nummerieren</button>
          <button onClick={anordnen} title="Knoten als Baum anordnen">Automatisch anordnen</button>
        </div>
      </div>
      {auswahl && projekt.komponenten.some((k) => k.id === auswahl) && (
        <Eigenschaften
          projekt={projekt}
          analyse={analyse}
          id={auswahl}
          onAendern={(alt, k) => {
            onChange(aktualisieren(pRef.current, alt, k))
            if (k.id !== alt) setAuswahl(k.id)
          }}
          onProjekt={onChange}
          onLoeschen={(id) => { onChange(entfernen(pRef.current, [id])); setAuswahl(null) }}
          onSchliessen={() => setAuswahl(null)}
        />
      )}
    </div>
  )
}

export function NodeEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <Innen {...props} />
    </ReactFlowProvider>
  )
}
