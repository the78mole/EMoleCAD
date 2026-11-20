import {
  Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, ViewportPortal, NodeChangeset, useReactFlow,
  type Connection, type Edge, type EdgeChangeset, type IsValidConnection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Analyse } from '../model/analyse'
import { typDef } from '../model/library'
import { handleIds, seitenWahl } from './seiten'
import { autoLayout, neuNummerieren, datenTrennen, datenVerbinden, entfernen, hinzufuegen, istVorfahr, paTrennen, paVerbinden, setzeQuelle } from '../model/ops'
import type { Projekt } from '../model/types'
import { Bibliothek } from './Bibliothek'
import { Eigenschaften } from './Eigenschaften'
import { KomponentenNode, type KomponentenNodeTyp } from './KomponentenNode'
import { BusKante } from './BusKante'
import { rasten, type Hilfslinie } from './raster'
import { aktualisieren } from '../model/ops'

const nodeTypes = { komponente: KomponentenNode }
const edgeTypes = { bus: BusKante }

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
  const nodesRef = useRef(nodes)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  const [linien, setLinien] = useState<Hilfslinie[]>([])
  const altRef = useRef(false)
  const gerastet = useRef(new Map<string, { x: number; y: number }>())
  useEffect(() => {
    const t = (e: KeyboardEvent) => { altRef.current = e.altKey }
    window.addEventListener('keydown', t)
    window.addEventListener('keyup', t)
    return () => { window.removeEventListener('keydown', t); window.removeEventListener('keyup', t) }
  }, [])
  // React Flow braucht lokalen Knotenzustand (Ziehen); bei Modelländerungen wird er aus dem Projekt neu abgeleitet
  // oxlint-disable-next-line react/set-state-in-effect -- bewusste Synchronisation Modell -> kontrollierter React-Flow-Zustand
  useEffect(() => setNodes(sollNodes), [sollNodes])

  const grundKanten = useMemo<Edge[]>(() => {
    const posVon = (id: string) => (projekt.editor?.[id] ?? autoPos[id] ?? { x: 0, y: 0 }).x
    const kinderVon = new Map<string, string[]>()
    for (const k of projekt.komponenten) if (k.quelle) kinderVon.set(k.quelle, [...(kinderVon.get(k.quelle) ?? []), k.id])
    return projekt.komponenten
        .filter((k) => k.quelle && projekt.komponenten.some((q) => q.id === k.quelle))
        .map((k) => {
          const kn = analyse.knoten.get(k.id)
          const geschwister = kinderVon.get(k.quelle!) ?? []
          const xs = [posVon(k.quelle!), ...geschwister.map(posVon)]
          const x = posVon(k.id)
          const e: Edge = {
            id: `${k.quelle}->${k.id}`,
            source: k.quelle!,
            target: k.id,
            sourceHandle: 'strom-out',
            targetHandle: 'strom-in',
            type: 'bus',
            data: {
              label: kn ? (kn.dc ? 'DC' : kn.pole === 3 ? '3/N/PE' : `${kn.phase}/N/PE`) : undefined,
              geschwister: geschwister.length,
              ende: x <= Math.min(...xs) || x >= Math.max(...xs),
            },
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
        )
        .concat(
          (projekt.potentialausgleich ?? [])
            .filter((d) => projekt.komponenten.some((k) => k.id === d.von) && projekt.komponenten.some((k) => k.id === d.nach))
            .map((d): Edge => ({
              id: `pa:${d.von}->${d.nach}`,
              source: d.von,
              target: d.nach,
              sourceHandle: typDef(projekt.komponenten.find((k) => k.id === d.von)!.typ).pa ? 'pa-out' : undefined,
              targetHandle: typDef(projekt.komponenten.find((k) => k.id === d.nach)!.typ).pa ? 'pa-in' : undefined,
              type: 'smoothstep',
              label: d.querschnitt ? `${d.querschnitt} mm²` : undefined,
              className: 'kante-pa',
            })),
        )
  }, [projekt, analyse, autoPos])

  // Hilfsleitungen (PE, Daten) setzen an der Seite an, die zum Gegenüber zeigt – live auch beim Ziehen
  const edges = useMemo<Edge[]>(() => {
    const box = new Map(nodes.map((n) => [n.id, { x: n.position.x, w: n.measured?.width ?? 170 }]))
    return grundKanten.map((e) => {
      const art = e.id.startsWith('pa:') ? 'pa' : e.id.startsWith('daten:') ? 'daten' : undefined
      const a = box.get(e.source), b = box.get(e.target)
      if (!art || !a || !b) return e
      const h = handleIds(art, seitenWahl(a, b))
      return { ...e, sourceHandle: e.sourceHandle ? h.sourceHandle : undefined, targetHandle: e.targetHandle ? h.targetHandle : undefined }
    })
  }, [grundKanten, nodes])

  // Ref, damit Callbacks immer den aktuellen Stand sehen
  const pRef = useRef(projekt)
  useEffect(() => { pRef.current = projekt }, [projekt])

  const onNodesChange = useCallback((changeset: NodeChangeset<KomponentenNodeTyp>) => {
    const changes = changeset.toArray()
    const loeschen = changes.filter((c) => c.type === 'remove').map((c) => c.id)
    if (loeschen.length) {
      // sofort übernehmen, damit das gleichzeitige Entfernen der Kanten auf dem neuen Stand aufsetzt
      pRef.current = entfernen(pRef.current, loeschen)
      onChange(pRef.current)
      setAuswahl(null)
      return
    }
    for (const c of changes) if (c.type === 'select' && c.selected) setAuswahl(c.id)
    // Einrasten beim Ziehen (Alt gedrückt halten = frei schieben)
    const zug = changes.filter((c): c is Extract<typeof c, { type: 'position' }> => c.type === 'position' && !!c.dragging && !!c.position)
    if (zug.length && !altRef.current) {
      const bewegt = new Set(zug.map((c) => c.id))
      const andere = nodesRef.current.filter((n) => !bewegt.has(n.id)).map((n) => n.position)
      const { pos, linien } = rasten(zug[0].position!, andere, rf.getZoom())
      const dx = pos.x - zug[0].position!.x, dy = pos.y - zug[0].position!.y
      for (const c of zug) {
        c.position = { x: c.position!.x + dx, y: c.position!.y + dy }
        gerastet.current.set(c.id, c.position)
      }
      setLinien(linien)
    } else if (zug.length) {
      for (const c of zug) gerastet.current.delete(c.id)
    }
    const geaendert = new NodeChangeset(changes)
    setNodes((ns) => geaendert.applyTo(ns))
  }, [onChange, rf])

  const onEdgesChange = useCallback((changes: EdgeChangeset<Edge>) => {
    let p = pRef.current
    for (const c of changes) {
      if (c.type !== 'remove') continue
      if (c.id.startsWith('daten:')) {
        const [von, nach] = c.id.slice(6).split('->')
        p = datenTrennen(p, von, nach)
      } else if (c.id.startsWith('pa:')) {
        const [von, nach] = c.id.slice(3).split('->')
        p = paTrennen(p, von, nach)
      } else p = setzeQuelle(p, c.id.split('->')[1], undefined)
    }
    if (p !== pRef.current) onChange(p)
  }, [onChange])

  const isValidConnection: IsValidConnection = useCallback((c) => {
    if (!c.source || !c.target || c.source === c.target) return false
    if (c.sourceHandle === 'daten-out' || c.targetHandle === 'daten-in') return c.sourceHandle === 'daten-out' && c.targetHandle === 'daten-in'
    if (c.sourceHandle === 'pa-out' || c.targetHandle === 'pa-in') return c.sourceHandle === 'pa-out' && c.targetHandle === 'pa-in'
    const ziel = pRef.current.komponenten.find((k) => k.id === c.target)
    if (!ziel || typDef(ziel.typ).wurzel) return false
    return !istVorfahr(pRef.current, c.target, c.source)
  }, [])

  const onConnect = useCallback((c: Connection) => {
    if (c.sourceHandle === 'daten-out') onChange(datenVerbinden(pRef.current, c.source, c.target))
    else if (c.sourceHandle === 'pa-out') onChange(paVerbinden(pRef.current, c.source, c.target))
    else onChange(setzeQuelle(pRef.current, c.target, c.source))
  }, [onChange])

  const onNodeDragStop = useCallback((_: unknown, __: unknown, bewegt: KomponentenNodeTyp[]) => {
    const p = pRef.current
    const editor = { ...autoLayout(p), ...(p.editor ?? {}) }
    setLinien([])
    for (const n of bewegt) {
      const pos = gerastet.current.get(n.id) ?? n.position
      editor[n.id] = { x: Math.round(pos.x), y: Math.round(pos.y) }
    }
    gerastet.current.clear()
    onChange({ ...p, editor })
  }, [onChange])

  const neu = useCallback((typ: string, pos?: { x: number; y: number }) => {
    const p = pRef.current
    // Neue Komponente automatisch an die Auswahl hängen, wenn das passt
    const sel = auswahl ? p.komponenten.find((k) => k.id === auswahl) : undefined
    const quelle = sel && typDef(sel.typ).kinder && !typDef(typ).wurzel && !typDef(typ).potential ? sel.id : undefined
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
    const roh = rf.screenToFlowPosition({ x: e.clientX - 80, y: e.clientY - 20 })
    const pos = e.altKey ? roh : rasten(roh, nodesRef.current.map((n) => n.position), rf.getZoom()).pos
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
      t = setTimeout(() => rf.fitView({ padding: '6.5%', duration: 200 }), 120)
    })
    ro.observe(el)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [rf])

  const anordnen = () => {
    onChange({ ...pRef.current, editor: autoLayout(pRef.current) })
    setTimeout(() => rf.fitView({ padding: '6.5%', duration: 300 }), 50)
  }

  return (
    <div className="node-editor">
      <Bibliothek onHinzufuegen={(t) => neu(t)} />
      <div className="flaeche" ref={huelle} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => setAuswahl(null)}
          deleteKeyCode={['Delete', 'Backspace']}
          fitView
          fitViewOptions={{ padding: '6.5%' }}
          forceColorMode="light"
          minZoom={0.15}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <ViewportPortal>
            {linien.map((l, i) => (
              <div
                key={i}
                className="hilfslinie"
                style={l.art === 'x'
                  ? { left: l.wert + 85, top: l.von - 20, width: 0, height: l.bis - l.von + 120 }
                  : { left: l.von - 20, top: l.wert, height: 0, width: l.bis - l.von + 210 }}
              />
            ))}
          </ViewportPortal>
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
