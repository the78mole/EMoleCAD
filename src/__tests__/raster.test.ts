import { describe, expect, it } from 'vitest'
import { rasten } from '../editor/raster'

describe('Einrasten', () => {
  it('rastet am Nachbarn vor dem Raster und liefert Hilfslinie', () => {
    const r = rasten({ x: 427, y: 300 }, [{ x: 420, y: 0 }])
    expect(r.pos.x).toBe(420)
    expect(r.linien).toEqual([{ art: 'x', wert: 420, von: 0, bis: 300 }])
  })
  it('rastet am Raster, wenn kein Nachbar nahe ist', () => {
    expect(rasten({ x: 205, y: 268 }, []).pos).toEqual({ x: 210, y: 260 })
  })
  it('bleibt frei, wenn nichts in Reichweite ist', () => {
    expect(rasten({ x: 300, y: 200 }, [{ x: 0, y: 0 }]).pos).toEqual({ x: 300, y: 200 })
  })
  it('Fangbereich skaliert mit dem Zoom', () => {
    expect(rasten({ x: 230, y: 0 }, [], 0.5).pos.x).toBe(210)
    expect(rasten({ x: 230, y: 0 }, [], 2).pos.x).toBe(230)
  })
})
