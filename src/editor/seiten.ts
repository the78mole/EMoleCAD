/** Seite eines Knotens, an der eine Hilfsleitung (PE, Daten) ansetzt. */
export type Seite = 'l' | 'r'

/**
 * Wählt für eine Hilfsleitung zwischen zwei Knoten die günstigsten Seiten:
 * liegen die Knoten nebeneinander, zeigen die Anschlüsse zueinander;
 * überlappen sie horizontal, gehen beide Enden zur selben Seite (kürzester Bogen).
 */
export function seitenWahl(a: { x: number; w: number }, b: { x: number; w: number }): { von: Seite; nach: Seite } {
  if (b.x >= a.x + a.w) return { von: 'r', nach: 'l' }
  if (b.x + b.w <= a.x) return { von: 'l', nach: 'r' }
  const s: Seite = b.x + b.w / 2 >= a.x + a.w / 2 ? 'r' : 'l'
  return { von: s, nach: s }
}

/** Handle-IDs je Leitungsart und Seite (sichtbare Handles plus verdeckte Gegenstücke). */
export function handleIds(art: 'pa' | 'daten', s: { von: Seite; nach: Seite }) {
  return {
    sourceHandle: s.von === 'r' ? `${art}-out` : `${art}-out-l`,
    targetHandle: s.nach === 'l' ? `${art}-in` : `${art}-in-r`,
  }
}
