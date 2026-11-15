import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react'

export type BusKanteTyp = Edge<{ label?: string; geschwister: number; ende?: boolean }, 'bus'>

/** Abstand des Busses unter dem Ausgang der übergeordneten Komponente */
const BUS = 22

/**
 * Orthogonale Verbindung über einen gemeinsamen Bus: alle Abgänge einer Komponente
 * laufen auf derselben Höhe knapp unter ihr zusammen, von dort geht je ein Stich
 * senkrecht zur untergeordneten Komponente. Die Leiterangabe steht direkt darüber.
 */
export function BusKante({ id, sourceX, sourceY, targetX, targetY, data, markerEnd, style, interactionWidth }: EdgeProps<BusKanteTyp>) {
  const busY = targetY > sourceY + BUS + 12 ? sourceY + BUS : (sourceY + targetY) / 2
  const pfad = Math.abs(targetX - sourceX) < 0.5
    ? `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
    : `M ${sourceX} ${sourceY} L ${sourceX} ${busY} L ${targetX} ${busY} L ${targetX} ${targetY}`
  const bus = (data?.geschwister ?? 1) > 1
  return (
    <>
      <BaseEdge id={id} path={pfad} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />
      {bus && <circle className="bus-punkt" cx={sourceX} cy={busY} r={3} />}
      {bus && !data?.ende && Math.abs(targetX - sourceX) >= 0.5 && <circle className="bus-punkt" cx={targetX} cy={busY} r={3} />}
      {data?.label && (
        <EdgeLabelRenderer>
          <div className="bus-label nodrag nopan" style={{ transform: `translate(-50%, -100%) translate(${targetX}px, ${targetY - 3}px)` }}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
