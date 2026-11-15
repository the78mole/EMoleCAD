/**
 * Weiches Einrasten im Node-Editor.
 * 1. an benachbarten Bausteinen (gleiche linke Kante bzw. gleiche Oberkante) – hat Vorrang
 * 2. am Raster der automatischen Anordnung (Spalten 210 px, Zeilen 130 px)
 * Gerastet wird nur, wenn die Position nahe genug liegt; sonst bleibt sie frei.
 */
export const RASTER_X = 210
export const RASTER_Y = 130

export interface Pos { x: number; y: number }
export interface Hilfslinie { art: 'x' | 'y'; wert: number; von: number; bis: number }

export function rasten(p: Pos, andere: Pos[], zoom = 1): { pos: Pos; linien: Hilfslinie[] } {
  const fangN = 10 / zoom   // Fangbereich Nachbarn (Bildschirm-px)
  const fangR = 14 / zoom   // Fangbereich Raster
  const linien: Hilfslinie[] = []

  const achse = (a: 'x' | 'y', schritt: number): number => {
    const v = p[a]
    let best: number | undefined, abst = fangN
    for (const o of andere) {
      const d = Math.abs(o[a] - v)
      if (d < abst) { abst = d; best = o[a] }
    }
    if (best !== undefined) {
      const b = best
      const quer = a === 'x' ? 'y' : 'x'
      const beteiligt = andere.filter((o) => Math.abs(o[a] - b) < 0.5).map((o) => o[quer]).concat(p[quer])
      linien.push({ art: a, wert: b, von: Math.min(...beteiligt), bis: Math.max(...beteiligt) })
      return b
    }
    const r = Math.round(v / schritt) * schritt
    return Math.abs(r - v) < fangR ? r : v
  }

  return { pos: { x: achse('x', RASTER_X), y: achse('y', RASTER_Y) }, linien }
}
