import { describe, expect, it } from 'vitest'
import { BEISPIEL_YAML } from '../model/beispiel'
import { parseYaml } from '../model/yaml'
import { analysiere } from '../model/analyse'
import { erzeugeBlatt, VORLAGEN } from '../schematic/blatt'
import { zeichnePlan } from '../schematic/render'

const p = parseYaml(BEISPIEL_YAML)
const plan = zeichnePlan(analysiere(p), { modus: 'einpolig', farbig: true, netz: p.netz })
const logo = { daten: 'data:image/png;base64,iVBORw0KGgo=', breite: 200, hoehe: 100 }
const vorlage = (id: string) => VORLAGEN.find((v) => v.id === id)!

describe('Logo im Schriftfeld', () => {
  it('ohne Logo kein Bild im Blatt', () => {
    expect(erzeugeBlatt(plan, p, 'einpolig', vorlage('a3')).svg).not.toContain('<image')
  })
  it('ISO-Schriftfeld: eigenes Logofeld links neben dem Schriftfeld', () => {
    const svg = erzeugeBlatt(plan, p, 'einpolig', vorlage('a3'), 1, 1, true, logo).svg
    // A3: Schriftfeld x0 = 420 - 10 - 180 = 230, Logofeld 40 mm davor, Bild mit 2 mm Rand
    expect(svg).toContain(`<image x="192" y="253" width="36" height="32" preserveAspectRatio="xMidYMid meet" href="${logo.daten}"/>`)
    expect(svg).toMatch(/<text x="188"[^>]*>erstellt mit EMoleCAD/)
  })
  it('kompaktes Schriftfeld: Logo vor dem Titel, Breite nach Seitenverhältnis', () => {
    const svg = erzeugeBlatt(plan, p, 'einpolig', vorlage('a4k'), 1, 1, true, logo).svg
    expect(svg).toContain('<image x="22" y="191" width="16" height="8"')
    expect(svg).toMatch(/<text x="41" y="196.5"[^>]*font-weight="bold"/)
  })
  it('Vorlage ohne Rahmen zeigt kein Logo', () => {
    expect(erzeugeBlatt(plan, p, 'einpolig', vorlage('frei'), 1, 1, true, logo).svg).not.toContain('<image')
  })
})

describe('kompaktes Schriftfeld mit langem Titel', () => {
  it('kürzt den Titel vor den Angaben rechts', () => {
    const lang = { ...p, projekt: { ...p.projekt, titel: 'Sehr langer Projekttitel '.repeat(10) } }
    const svg = erzeugeBlatt(plan, lang, 'einpolig', vorlage('a4k'), 1, 1, true, logo).svg
    const titel = /<text x="41"[^>]*>([^<]*)<\/text>/.exec(svg)![1]
    expect(titel.endsWith('…')).toBe(true)
    expect(titel.length).toBeLessThan(lang.projekt.titel.length)
  })
})
