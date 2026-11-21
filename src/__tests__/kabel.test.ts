import { describe, expect, it } from 'vitest'
import { KABEL_STANDARD, kabelOptionen } from '../model/kabel'
import { parseYaml } from '../model/yaml'
import { BEISPIEL_YAML } from '../model/beispiel'

describe('Auswahl für Kabeltyp und Querschnitt', () => {
  it('ohne eigene Werte nur die Standardwerte', () => {
    expect(kabelOptionen('typ', [])).toEqual(KABEL_STANDARD.typ)
    expect(kabelOptionen('querschnitt', [])).toEqual(['3G1,5', '5G1,5', '5G2,5', '5G4', '5G6', '5G16'])
  })
  it('gespeicherte und im Projekt verwendete Werte hinten, sortiert, ohne Doppelte', () => {
    const komponenten = [{ kabel: { typ: 'NYY-J' } }, { kabel: { typ: 'NYM-J' } }, { kabel: { typ: 'H1Z2Z2-K' } }, {}]
    expect(kabelOptionen('typ', komponenten, ['NYY-J', 'Cat7', ' '])).toEqual([...KABEL_STANDARD.typ, 'Cat7', 'H1Z2Z2-K', 'NYY-J'])
  })
  it('Projektwerte mit Leerzeichen bleiben unverändert wählbar', () => {
    expect(kabelOptionen('typ', [{ kabel: { typ: 'NYY-J ' } }])).toContain('NYY-J ')
  })
  it('bestehende YAML-Werte bleiben auswählbar', () => {
    const p = parseYaml(BEISPIEL_YAML)
    const q = kabelOptionen('querschnitt', p.komponenten)
    expect(q).toContain('5x2,5')
    expect(q).toContain('5x16')
  })
})
