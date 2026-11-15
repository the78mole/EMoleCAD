import type { Analyse, Knoten, LeiterName } from '../model/analyse'
import type { SymbolArt } from '../model/library'
import type { Projekt } from '../model/types'
import { Svg } from './svg'

export type Modus = 'einpolig' | 'allpolig'

export interface PlanOptionen {
  modus: Modus
  farbig: boolean
  netz: Projekt['netz']
}

export interface Plan {
  inhalt: string
  breite: number
  hoehe: number
}

const D = 4 // Leiterabstand allpolig
const SYM_H = 14
const OBEN = 16 // Platz für Einspeisungsbeschriftung
const BESCHRIFTUNG_UNTEN = 42

const LEITERFARBE: Record<LeiterName, string> = {
  L1: '#7a4a1e', L2: '#111111', L3: '#7d7d7d', N: '#1f6fd1', PE: '#2e9e3e', 'L+': '#c62828', 'L-': '#1f3fa8',
}

interface Lage {
  n: Knoten
  x: number
  zeile: number
  symTop: number
  symBot: number
  aus: LeiterName[]
  busY: Partial<Record<LeiterName, number>>
}

const istPhase = (l: LeiterName) => l === 'L1' || l === 'L2' || l === 'L3'

function ausgaenge(n: Knoten): LeiterName[] {
  if (n.def.durchgang) return n.leiter
  if (n.kinder.some((c) => c.dc)) return ['L+', 'L-']
  return n.leiter
}

export function zeichnePlan(a: Analyse, o: PlanOptionen): Plan {
  const svg = new Svg()
  const allp = o.modus === 'allpolig'
  const H = allp ? 42 : 32
  const farbe = (l: LeiterName) => (allp && o.farbig ? LEITERFARBE[l] : '#000')

  const alle = [...a.knoten.values()]
  if (!alle.length) {
    svg.text(10, 20, 'Keine Komponenten vorhanden', { groesse: 4, farbe: '#888' })
    return { inhalt: svg.toString(), breite: 120, hoehe: 40 }
  }
  const maxZeile = Math.max(...alle.map((n) => n.tiefe))
  const eigeneBreite = (n: Knoten) => (allp ? Math.max(30, n.leiter.length * D + 24) : 26)

  const lagen = new Map<Knoten, Lage>()
  const platziere = (n: Knoten, x0: number): number => {
    const zeile = n.kinder.length ? n.tiefe : maxZeile
    const symTop = OBEN + zeile * H + 7
    const l: Lage = { n, x: 0, zeile, symTop, symBot: symTop + SYM_H, aus: ausgaenge(n), busY: {} }
    lagen.set(n, l)
    const eigen = eigeneBreite(n)
    if (!n.kinder.length) {
      l.x = x0 + eigen / 2
      return eigen
    }
    let x = x0
    for (const c of n.kinder) x += platziere(c, x)
    let summe = x - x0
    if (summe < eigen) {
      const verschiebe = (eigen - summe) / 2
      const schiebe = (k: Knoten) => {
        lagen.get(k)!.x += verschiebe
        k.kinder.forEach(schiebe)
      }
      n.kinder.forEach(schiebe)
      summe = eigen
    }
    const erst = lagen.get(n.kinder[0])!.x
    const letzt = lagen.get(n.kinder[n.kinder.length - 1])!.x
    l.x = n.kinder.length === 1 ? erst : (erst + letzt) / 2
    return summe
  }
  let x = 6
  for (const w of a.wurzeln) x += platziere(w, x) + 6
  const breite = x
  const hoehe = OBEN + (maxZeile + 1) * H + BESCHRIFTUNG_UNTEN

  const cx = (l: Lage, leiter: LeiterName, liste: LeiterName[] = l.n.leiter) => {
    if (!allp) return l.x
    const i = liste.indexOf(leiter)
    return l.x + (i - (liste.length - 1) / 2) * D
  }

  // --- Sammelschienen / Verbindungen zwischen Eltern und Kindern ---
  for (const l of lagen.values()) {
    const kinder = l.n.kinder.map((k) => lagen.get(k)!)
    if (!kinder.length) continue
    const ausListe = allp ? l.aus : (['L1'] as LeiterName[])
    const benutzt = ausListe.filter((le) => !allp || kinder.some((k) => k.n.leiter.includes(le)))
    benutzt.forEach((le, i) => {
      const y = l.symBot + 4 + (allp ? i * 2.6 : 0)
      l.busY[le] = y
      const punkte: { x: number; hoch: boolean; runter: boolean }[] = [{ x: cx(l, le, ausListe), hoch: true, runter: false }]
      for (const k of kinder) {
        if (allp && !k.n.leiter.includes(le)) continue
        const kx = allp ? cx(k, le) : k.x
        const p = punkte.find((pp) => Math.abs(pp.x - kx) < 0.01)
        if (p) p.runter = true
        else punkte.push({ x: kx, hoch: false, runter: true })
      }
      const xs = punkte.map((p) => p.x)
      const min = Math.min(...xs), max = Math.max(...xs)
      const fa = farbe(le)
      svg.linie(cx(l, le, ausListe), l.symBot, cx(l, le, ausListe), y, { farbe: fa })
      if (max - min > 0.01) svg.linie(min, y, max, y, { farbe: fa })
      for (const p of punkte) {
        const grad = (p.hoch ? 1 : 0) + (p.runter ? 1 : 0) + (p.x > min + 0.01 ? 1 : 0) + (p.x < max - 0.01 ? 1 : 0)
        if (grad >= 3) svg.punkt(p.x, y, fa)
      }
    })
  }

  // --- Komponenten ---
  for (const l of lagen.values()) {
    const n = l.n
    const eltern = n.eltern ? lagen.get(n.eltern) : undefined
    // Zuleitungen
    for (const le of allp ? n.leiter : (['L1'] as LeiterName[])) {
      const xx = cx(l, le)
      let yStart: number
      if (eltern) yStart = eltern.busY[allp ? le : 'L1'] ?? l.symTop - 4
      else yStart = OBEN - 2
      if (!eltern && allp && le === 'PE' && o.netz.form !== 'TN-S') continue // PE entsteht im HAK bzw. am Erder
      svg.linie(xx, yStart, xx, l.symTop, { farbe: farbe(le) })
    }
    if (!eltern) einspeisung(svg, l, cx, o, allp, farbe)
    else if (!allp) leiterZahl(svg, l, eltern)
    if (allp) symbolAllpolig(svg, l, cx, farbe, o)
    else symbolEinpolig(svg, l)
    beschriftung(svg, l, allp, cx)
  }

  return { inhalt: svg.toString(), breite, hoehe }
}

function leiterZahl(svg: Svg, l: Lage, eltern: Lage) {
  const n = l.n
  if (n.kinder.length && eltern.n.leiter.length === n.leiter.length) return
  const y = l.symTop - 2.5
  svg.linie(l.x - 1.1, y + 1.1, l.x + 1.1, y - 1.1)
  svg.text(l.x - 1.4, y + 0.4, n.dc ? '2' : String(n.leiter.length), { groesse: 1.8, anker: 'end' })
}

function einspeisung(svg: Svg, l: Lage, cx: (l: Lage, le: LeiterName) => number, o: PlanOptionen, allp: boolean, farbe: (l: LeiterName) => string) {
  const netz = o.netz
  const y = OBEN - 4
  if (!allp) {
    svg.text(l.x, y - 4, `${netz.form}  3/N/PE ~50 Hz`, { groesse: 2.4, anker: 'middle', fett: true })
    if (netz.spannung) svg.text(l.x, y - 0.5, netz.spannung, { groesse: 2.2, anker: 'middle' })
    return
  }
  for (const le of l.n.leiter) {
    if (le === 'PE' && netz.form !== 'TN-S') continue
    const label = le === 'N' && netz.form === 'TN-C-S' ? 'PEN' : le
    svg.text(cx(l, le) + 0.7, y, label, { groesse: 1.8, drehung: -90, farbe: farbe(le) })
  }
  svg.text(l.x, y - 9.5, `${netz.form}${netz.spannung ? '  ' + netz.spannung : ''}`, { groesse: 2.4, anker: 'middle', fett: true })
  const xpe = cx(l, 'PE'), xn = cx(l, 'N')
  if (netz.form === 'TN-C-S') {
    // PEN-Aufteilung im HAK
    const ys = l.symBot - 2
    svg.linie(xn, ys, xpe, ys, { farbe: farbe('PE') })
    svg.linie(xpe, ys, xpe, l.symBot, { farbe: farbe('PE') })
    svg.punkt(xn, ys, farbe('PE'))
  } else if (netz.form === 'TT') {
    const ye = l.symTop + 4
    svg.linie(xpe, ye, xpe, l.symBot, { farbe: farbe('PE') })
    erde(svg, xpe, ye, farbe('PE'), true)
    svg.text(xpe + 2.5, ye - 1.5, 'Anlagenerder', { groesse: 1.6 })
  }
}

function erde(svg: Svg, x: number, y: number, fa = '#000', oben = false) {
  const s = oben ? -1 : 1
  svg.linie(x - 2, y, x + 2, y, { farbe: fa })
  svg.linie(x - 1.3, y + s * 0.8, x + 1.3, y + s * 0.8, { farbe: fa })
  svg.linie(x - 0.6, y + s * 1.6, x + 0.6, y + s * 1.6, { farbe: fa })
}

// ---------- Symbolbausteine ----------

function schalter(svg: Svg, x: number, y0: number, y1: number, o: { kreuz?: boolean; kreis?: boolean; farbe?: string; dx?: number }) {
  const fa = o.farbe ?? '#000'
  const ya = y0 + 3.5, yb = y1 - 3.5
  const dx = o.dx ?? 2.6
  svg.linie(x, y0, x, ya, { farbe: fa })
  svg.linie(x, yb, x, y1, { farbe: fa })
  svg.linie(x, yb, x - dx, ya + 0.6, { farbe: fa })
  if (o.kreuz) {
    svg.linie(x - 0.8, ya - 0.8, x + 0.8, ya + 0.8, { farbe: fa })
    svg.linie(x - 0.8, ya + 0.8, x + 0.8, ya - 0.8, { farbe: fa })
  }
  if (o.kreis) svg.kreis(x, ya - 0.6, 0.6, { farbe: fa, fuellung: '#fff' })
  return { mitteX: x - dx / 2, mitteY: (ya + yb) / 2 }
}

function sicherung(svg: Svg, x: number, y0: number, y1: number, fa = '#000') {
  svg.linie(x, y0, x, y1, { farbe: fa })
  svg.rechteck(x - 1.1, y0 + 3, 2.2, y1 - y0 - 6, { farbe: fa, fuellung: '#fff' })
  svg.linie(x, y0 + 3, x, y1 - 3, { farbe: fa })
}

/** Inhalt einer Gerätebox (Wechselrichter, Wallbox, ...) */
function boxInhalt(svg: Svg, art: SymbolArt, x0: number, y0: number, w: number, h: number) {
  const mx = x0 + w / 2, my = y0 + h / 2
  const t = (s: string, gr = 2.4) => svg.text(mx, my + gr * 0.35, s, { groesse: gr, anker: 'middle', fett: true })
  switch (art) {
    case 'wechselrichter':
      svg.linie(x0, y0 + h, x0 + w, y0)
      svg.text(x0 + 1.2, y0 + 3.4, '=', { groesse: 3 })
      svg.text(x0 + w - 1.2, y0 + h - 1, '~', { groesse: 3, anker: 'end' })
      break
    case 'pvgen':
      svg.linie(x0, y0 + h, x0 + w, y0)
      svg.text(x0 + 1, y0 + 3.2, 'PV', { groesse: 2 })
      svg.text(x0 + w - 1, y0 + h - 1, '=', { groesse: 3, anker: 'end' })
      // Lichtpfeile
      for (const d of [0, 2.2]) {
        svg.linie(x0 - 3 + d, y0 - 3, x0 - 0.8 + d, y0 - 0.8)
        svg.pfad(`M ${x0 - 0.8 + d} ${y0 - 0.8} l -1.1 -0.2 l 0.9 -0.9 z`, { fuellung: '#000', breite: 0.2 })
      }
      break
    case 'speicher': {
      const bx = mx
      svg.linie(bx - 3, my - 0.8, bx + 3, my - 0.8, { breite: 0.5 })
      svg.linie(bx - 1.6, my + 0.8, bx + 1.6, my + 0.8, { breite: 0.9 })
      svg.text(bx + 3.6, my - 1.2, '+', { groesse: 2 })
      break
    }
    case 'wallbox':
      t('EV')
      break
    case 'waermepumpe':
      t('WP')
      break
    case 'steuerbox':
      t('SB', 2.2)
      break
    case 'spd':
      // Varistor-Symbol
      svg.rechteck(mx - 1.2, y0 + 1.5, 2.4, h - 3, { fuellung: '#fff' })
      svg.linie(mx - 2, y0 + h - 2, mx + 2, y0 + 2)
      break
    case 'verbraucher':
    default:
      svg.linie(mx - 2, my - 1.5, mx + 2, my + 1.5)
      svg.linie(mx - 2, my + 1.5, mx + 2, my - 1.5)
  }
}

function symbolEinpolig(svg: Svg, l: Lage) {
  const { x, symTop: y0, symBot: y1 } = l
  const n = l.n
  const art = n.def.symbol
  const mitKindern = n.kinder.length > 0
  const verbindung = (a: number, b: number) => svg.linie(x, a, x, b)
  switch (art) {
    case 'hak':
      sicherung(svg, x, y0, y1)
      svg.rechteck(x - 4, y0 + 1, 8, y1 - y0 - 2, { strich: '1 0.8', fuellung: 'none', breite: 0.25 })
      break
    case 'zaehler':
      verbindung(y0, y1)
      svg.rechteck(x - 4.5, y0 + 2.5, 9, 9)
      svg.text(x, y0 + 7.8, 'kWh', { groesse: 2.3, anker: 'middle', fett: true })
      if (n.k.params?.art === 'Zweirichtung') {
        svg.text(x, y0 + 10.5, '<>', { groesse: 1.7, anker: 'middle' })
      }
      break
    case 'sls':
      schalter(svg, x, y0, y1, { kreuz: true })
      svg.rechteck(x + 0.8, y0 + 5.4, 3.2, 2.4, { breite: 0.25 })
      break
    case 'ls':
      schalter(svg, x, y0, y1, { kreuz: true })
      break
    case 'trenner':
      schalter(svg, x, y0, y1, { kreis: true })
      break
    case 'sicherung':
      sicherung(svg, x, y0, y1)
      break
    case 'rcd':
    case 'rcbo': {
      const m = schalter(svg, x, y0, y1 - 3.5, { kreuz: art === 'rcbo' })
      verbindung(y1 - 3.5, y1)
      const ey = y1 - 2
      svg.ellipse(x, ey, 2.4, 1.1)
      svg.pfad(`M ${x + 2.4} ${ey} H ${x + 3.6} V ${m.mitteY} H ${m.mitteX}`, { strich: '0.8 0.6', breite: 0.25 })
      break
    }
    case 'verteiler':
      verbindung(y0, y1)
      svg.rechteck(x - 4, y0 + 2, 8, y1 - y0 - 4, { strich: '1.2 0.8', fuellung: 'none' })
      svg.text(x, (y0 + y1) / 2 + 0.8, 'UV', { groesse: 2.2, anker: 'middle', fett: true })
      break
    default: {
      const w = 10, h = 10, bt = y0 + 2
      verbindung(y0, bt)
      if (mitKindern) verbindung(bt + h, y1)
      svg.rechteck(x - w / 2, bt, w, h)
      boxInhalt(svg, art, x - w / 2, bt, w, h)
      if (art === 'spd') {
        verbindung(bt + h, bt + h + 2)
        erde(svg, x, bt + h + 2)
      }
    }
  }
}

function symbolAllpolig(svg: Svg, l: Lage, cx: (l: Lage, le: LeiterName, liste?: LeiterName[]) => number, farbe: (l: LeiterName) => string, o: PlanOptionen) {
  const n = l.n
  const art = n.def.symbol
  const { symTop: y0, symBot: y1 } = l
  const xs = n.leiter.map((le) => cx(l, le))
  const xmin = Math.min(...xs), xmax = Math.max(...xs)
  const durch = (le: LeiterName) => svg.linie(cx(l, le), y0, cx(l, le), y1, { farbe: farbe(le) })
  const glieder: { mitteX: number; mitteY: number }[] = []

  if (!n.def.durchgang) {
    const bt = y0 + 1.5, h = 11
    const w = Math.max(12, xmax - xmin + 6)
    const bx = l.x - w / 2
    for (const le of n.leiter) svg.linie(cx(l, le), y0, cx(l, le), bt, { farbe: farbe(le) })
    if (n.kinder.length) for (const le of l.aus) svg.linie(cx(l, le, l.aus), bt + h, cx(l, le, l.aus), y1, { farbe: farbe(le) })
    svg.rechteck(bx, bt, w, h)
    boxInhalt(svg, art, bx, bt, w, h)
    if (art === 'spd') {
      svg.linie(l.x, bt + h, l.x, bt + h + 2)
      erde(svg, l.x, bt + h + 2)
    }
    return
  }

  const geschaltet = (le: LeiterName): boolean => {
    switch (art) {
      case 'hak': case 'sicherung': case 'ls': case 'sls': case 'trenner':
        return istPhase(le)
      case 'rcd': case 'rcbo':
        return istPhase(le) || le === 'N'
      default:
        return false
    }
  }

  for (const le of n.leiter) {
    const xx = cx(l, le)
    const fa = farbe(le)
    if (art === 'hak' && le === 'PE' && o.netz.form !== 'TN-S') continue
    if (!geschaltet(le)) {
      durch(le)
      continue
    }
    if (art === 'hak' || art === 'sicherung') sicherung(svg, xx, y0, y1, fa)
    else if (art === 'rcd' || art === 'rcbo') {
      glieder.push(schalter(svg, xx, y0, y1 - 3.5, { farbe: fa, kreuz: art === 'rcbo' && le !== 'N', dx: 2 }))
      svg.linie(xx, y1 - 3.5, xx, y1, { farbe: fa })
    } else glieder.push(schalter(svg, xx, y0, y1, { farbe: fa, kreuz: art === 'ls' || art === 'sls', kreis: art === 'trenner', dx: 2 }))
  }

  if (art === 'zaehler') {
    const zs = n.leiter.filter((le) => le !== 'PE').map((le) => cx(l, le))
    const a = Math.min(...zs) - 2, b = Math.max(...zs) + 2
    svg.rechteck(a, y0 + 2.5, b - a, 9)
    svg.text((a + b) / 2, y0 + 7.8, 'kWh', { groesse: 2.4, anker: 'middle', fett: true })
  }
  if (art === 'sls') svg.text(xmin - 1.5, y0 + 7.6, 'SLS', { groesse: 1.6, anker: 'end' })
  if (art === 'verteiler') {
    svg.rechteck(xmin - 3, y0 + 2, xmax - xmin + 6, y1 - y0 - 4, { strich: '1.2 0.8', fuellung: 'none' })
  }
  if (art === 'hak') {
    svg.rechteck(xmin - 2.5, y0 + 1, xmax - xmin + 5, y1 - y0 - 2, { strich: '1 0.8', fuellung: 'none', breite: 0.25 })
  }
  if (art === 'rcd' || art === 'rcbo') {
    const zs = n.leiter.filter(geschaltet).map((le) => cx(l, le))
    const a = Math.min(...zs), b = Math.max(...zs)
    const ey = y1 - 2
    svg.ellipse((a + b) / 2, ey, (b - a) / 2 + 2, 1.1)
    const ende = b + 2
    const mitte = glieder.length ? glieder[glieder.length - 1] : { mitteX: b, mitteY: y0 + 5 }
    svg.pfad(`M ${ende} ${ey} H ${ende + 1.2} V ${mitte.mitteY}`, { strich: '0.8 0.6', breite: 0.25 })
  }
  if (glieder.length > 1 || art === 'rcd' || art === 'rcbo') {
    const ys = glieder.map((g) => g.mitteY)
    const ya = ys.length ? ys[0] : y0 + 7
    const xa = glieder.length ? glieder[0].mitteX : xmin
    const xb = art === 'rcd' || art === 'rcbo' ? Math.max(...n.leiter.filter(geschaltet).map((le) => cx(l, le))) + 3.2 : glieder[glieder.length - 1].mitteX
    svg.linie(xa, ya, xb, ya, { strich: '0.8 0.6', breite: 0.25 })
  }
}

function beschriftung(svg: Svg, l: Lage, allp: boolean, cx: (l: Lage, le: LeiterName) => number) {
  const n = l.n
  const rechts = allp ? Math.max(...n.leiter.map((le) => cx(l, le))) + (n.def.durchgang ? 3.5 : 4.5) : l.x + (n.def.durchgang ? 5.5 : 6.5)
  const kurz = n.def.kurz?.(n.k.params ?? {}) ?? ''
  let y = l.symTop + 3.6
  svg.text(rechts, y, n.bmk, { groesse: 2.4, fett: true })
  y += 2.8
  if (kurz.trim()) {
    for (const zeile of umbrechen(kurz, 12)) {
      svg.text(rechts, y, zeile, { groesse: 1.9 })
      y += 2.4
    }
  }
  const phasenText = n.dc ? 'DC' : n.pole === 3 ? '3/N/PE' : `${n.phase}/N/PE`
  if (!n.kinder.length) {
    // Endstromkreis: Name senkrecht unter dem Symbol
    const unten = l.symBot + (n.def.symbol === 'spd' ? 5 : 2)
    const text = [n.k.name ?? n.def.label, kabelText(n)].filter(Boolean)
    text.forEach((t, i) => svg.text(l.x + 0.9 - i * 2.8 + (text.length - 1) * 1.4, unten, t, { groesse: 2.2, drehung: -90, anker: 'end', fett: i === 0 }))
    svg.text(rechts, y, phasenText, { groesse: 1.7, farbe: '#444' })
  } else {
    if (n.k.name && n.def.symbol !== 'hak') {
      for (const zeile of umbrechen(n.k.name, 14)) {
        svg.text(rechts, y, zeile, { groesse: 1.9, farbe: '#333' })
        y += 2.4
      }
    }
    const kt = kabelText(n)
    if (kt) svg.text(l.x - (allp ? (n.leiter.length * D) / 2 + 1 : 1.5), l.symTop - 1, kt, { groesse: 1.7, anker: 'end', farbe: '#333' })
  }
}

function kabelText(n: Knoten): string {
  const k = n.k.kabel
  if (!k) return ''
  return [k.typ, k.querschnitt ? `${k.querschnitt} mm²` : '', k.laenge ? `${k.laenge} m` : ''].filter(Boolean).join(' ')
}

function umbrechen(s: string, max: number): string[] {
  const woerter = s.split(/\s+/)
  const out: string[] = []
  let akt = ''
  for (const w of woerter) {
    if (akt && (akt + ' ' + w).length > max) {
      out.push(akt)
      akt = w
    } else akt = akt ? akt + ' ' + w : w
  }
  if (akt) out.push(akt)
  return out.slice(0, 3)
}
