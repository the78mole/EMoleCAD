import { describe, expect, it } from 'vitest'
import { handleIds, seitenWahl } from '../editor/seiten'

describe('Anschlussseite der Hilfsleitungen', () => {
  const w = 170
  it('nebeneinander: Anschlüsse zeigen zueinander', () => {
    expect(seitenWahl({ x: 0, w }, { x: 300, w })).toEqual({ von: 'r', nach: 'l' })
    expect(seitenWahl({ x: 300, w }, { x: 0, w })).toEqual({ von: 'l', nach: 'r' })
  })
  it('übereinander: beide Enden auf derselben Seite', () => {
    expect(seitenWahl({ x: 0, w }, { x: 40, w })).toEqual({ von: 'r', nach: 'r' })
    expect(seitenWahl({ x: 40, w }, { x: 0, w })).toEqual({ von: 'l', nach: 'l' })
  })
  it('Handle-IDs je Seite', () => {
    expect(handleIds('pa', { von: 'r', nach: 'l' })).toEqual({ sourceHandle: 'pa-out', targetHandle: 'pa-in' })
    expect(handleIds('daten', { von: 'l', nach: 'r' })).toEqual({ sourceHandle: 'daten-out-l', targetHandle: 'daten-in-r' })
  })
})
