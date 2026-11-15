import type { Projekt } from '../model/types'
import type { Plan, Modus } from './render'
import { Svg, esc } from './svg'

export interface Vorlage {
  id: string
  label: string
  /** Blattgröße in mm; 0 = an Inhalt anpassen */
  breite: number
  hoehe: number
  rahmen: boolean
  schriftfeld: 'iso' | 'kompakt' | 'keins'
}

export const VORLAGEN: Vorlage[] = [
  { id: 'a3', label: 'DIN A3 quer, Schriftfeld', breite: 420, hoehe: 297, rahmen: true, schriftfeld: 'iso' },
  { id: 'a4', label: 'DIN A4 quer, Schriftfeld', breite: 297, hoehe: 210, rahmen: true, schriftfeld: 'iso' },
  { id: 'a3k', label: 'DIN A3 quer, kompakt', breite: 420, hoehe: 297, rahmen: true, schriftfeld: 'kompakt' },
  { id: 'a4k', label: 'DIN A4 quer, kompakt', breite: 297, hoehe: 210, rahmen: true, schriftfeld: 'kompakt' },
  { id: 'frei', label: 'Ohne Rahmen (Bildschirm)', breite: 0, hoehe: 0, rahmen: false, schriftfeld: 'keins' },
]

export interface Blatt {
  svg: string
  breite: number
  hoehe: number
}

const TITEL: Record<Modus, string> = {
  einpolig: 'Übersichtsschaltplan (einpolig)',
  allpolig: 'Stromlaufplan (allpolig)',
}

export function erzeugeBlatt(plan: Plan, p: Projekt, modus: Modus, v: Vorlage, blattNr = 1, blattGesamt = 1, farbig = true): Blatt {
  if (v.breite === 0) {
    const w = plan.breite + 10, h = plan.hoehe + 10
    return {
      breite: w, hoehe: h,
      svg: huelle(w, h, `<rect width="${w}" height="${h}" fill="#fff"/><g transform="translate(5 5)">${plan.inhalt}</g>`),
    }
  }
  const W = v.breite, H = v.hoehe
  const s = new Svg()
  s.rechteck(0, 0, W, H, { farbe: 'none', fuellung: '#fff' })
  // Rahmen: 20 mm Heftrand links, sonst 10 mm
  const L = 20, R = 10, O = 10, U = 10
  s.rechteck(L, O, W - L - R, H - O - U, { breite: 0.7, fuellung: 'none' })
  // Planquadrate
  const spalten = Math.round((W - L - R) / 50), zeilen = Math.round((H - O - U) / 50)
  const sw = (W - L - R) / spalten, zh = (H - O - U) / zeilen
  for (let i = 0; i < spalten; i++) {
    const x = L + i * sw
    if (i > 0) { s.linie(x, O, x, O + 3, { breite: 0.25 }); s.linie(x, H - U - 3, x, H - U, { breite: 0.25 }) }
    s.text(x + sw / 2, O - 2.5, String(i + 1), { groesse: 2.5, anker: 'middle' })
    s.text(x + sw / 2, H - U + 4.5, String(i + 1), { groesse: 2.5, anker: 'middle' })
  }
  for (let j = 0; j < zeilen; j++) {
    const y = O + j * zh
    const b = String.fromCharCode(65 + j)
    if (j > 0) { s.linie(L, y, L + 3, y, { breite: 0.25 }); s.linie(W - R - 3, y, W - R, y, { breite: 0.25 }) }
    s.text(L - 3, y + zh / 2 + 1, b, { groesse: 2.5, anker: 'middle' })
    s.text(W - R + 4, y + zh / 2 + 1, b, { groesse: 2.5, anker: 'middle' })
  }

  const info = p.projekt
  let sfHoehe = 0
  if (v.schriftfeld === 'iso') {
    sfHoehe = 36
    const sfB = 180
    const x0 = W - R - sfB, y0 = H - U - sfHoehe
    s.rechteck(x0, y0, sfB, sfHoehe, { breite: 0.7 })
    const feld = (x: number, y: number, w: number, h: number, titel: string, wert: string, gr = 3, fett = false) => {
      s.rechteck(x, y, w, h, { breite: 0.25, fuellung: 'none' })
      s.text(x + 1.2, y + 2.6, titel, { groesse: 1.8, farbe: '#555' })
      s.text(x + 1.2, y + h - 1.8, wert, { groesse: gr, fett })
    }
    feld(x0, y0, 110, 12, 'Projekt', info.titel ?? '', 3.6, true)
    feld(x0 + 110, y0, 70, 12, 'Kunde', info.kunde ?? '', 2.8)
    feld(x0, y0 + 12, 110, 12, 'Zeichnung', TITEL[modus], 3.6, true)
    feld(x0 + 110, y0 + 12, 70, 12, 'Anlagenadresse', info.adresse ?? '', 2.4)
    feld(x0, y0 + 24, 45, 12, 'Erstellt', info.ersteller ?? '', 2.6)
    feld(x0 + 45, y0 + 24, 25, 12, 'Datum', info.datum ?? '', 2.6)
    feld(x0 + 70, y0 + 24, 40, 12, 'Zeichnungsnummer', info.zeichnungsnummer ?? '', 2.6)
    feld(x0 + 110, y0 + 24, 20, 12, 'Rev.', info.revision ?? '', 2.6)
    feld(x0 + 130, y0 + 24, 25, 12, 'Netz', `${p.netz.form}`, 2.6)
    feld(x0 + 155, y0 + 24, 25, 12, 'Blatt', `${blattNr} / ${blattGesamt}`, 2.6)
    s.text(x0 - 2, H - U - 1.5, 'erstellt mit MoleCAD', { groesse: 1.8, anker: 'end', farbe: '#999' })
  } else if (v.schriftfeld === 'kompakt') {
    sfHoehe = 10
    const y0 = H - U - sfHoehe
    s.linie(L, y0, W - R, y0, { breite: 0.5 })
    s.text(L + 3, y0 + 6.5, `${info.titel ?? ''}  –  ${TITEL[modus]}`, { groesse: 3.2, fett: true })
    s.text(W - R - 3, y0 + 6.5, `${info.ersteller ?? ''}  ${info.datum ?? ''}   ${p.netz.form}   Blatt ${blattNr}/${blattGesamt}`, { groesse: 2.6, anker: 'end' })
  }

  if (modus === 'allpolig' && farbig) {
    // Leiterlegende links unten
    const lx = L + 4, ly = H - U - sfHoehe - 6
    const farben: [string, string][] = [['L1', '#7a4a1e'], ['L2', '#111111'], ['L3', '#7d7d7d'], ['N', '#1f6fd1'], ['PE', '#2e9e3e'], ['L+', '#c62828'], ['L-', '#1f3fa8']]
    farben.forEach(([n, f], i) => {
      s.linie(lx + i * 14, ly, lx + i * 14 + 6, ly, { farbe: f, breite: 0.6 })
      s.text(lx + i * 14 + 7, ly + 0.8, n, { groesse: 2 })
    })
  }

  // Zeichenfläche
  const ax = L + 5, ay = O + 5
  const aw = W - L - R - 10
  const ah = H - O - U - 10 - sfHoehe - (modus === 'allpolig' ? 6 : 0)
  const massstab = Math.min(aw / plan.breite, ah / plan.hoehe, 1.5)
  const dx = ax // linksbündig
  const dy = ay
  s.roh(`<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${massstab.toFixed(4)})">${plan.inhalt}</g>`)
  return { breite: W, hoehe: H, svg: huelle(W, H, s.toString()) }
}

function huelle(w: number, h: number, inhalt: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${inhalt}</svg>`
}

export { esc }
