import { describe, expect, it } from 'vitest'
import { svgGroesse } from '../einstellungen/svgGroesse'

describe('svgGroesse', () => {
  it('nimmt die viewBox, auch mit Leerraum und Kommas', () => {
    expect(svgGroesse('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="  0,0 200 100 "/>')).toEqual({ breite: 200, hoehe: 100 })
  })
  it('rechnet width/height in gemeinsame Einheit um', () => {
    expect(svgGroesse('<svg width="10cm" height="50mm"></svg>')).toEqual({ breite: 96 / 2.54 * 10, hoehe: 96 / 25.4 * 50 })
  })
  it('ohne Angaben: Browser-Standard 300×150', () => {
    expect(svgGroesse('<!-- <svg viewBox="0 0 1 9"> --><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toEqual({ breite: 300, hoehe: 150 })
    expect(svgGroesse('<svg width="100%" height="100%"/>')).toEqual({ breite: 300, hoehe: 150 })
  })
  it('kein SVG', () => {
    expect(svgGroesse('<html></html>')).toBeUndefined()
    expect(svgGroesse('<svgfoo/>')).toBeUndefined()
  })
})
