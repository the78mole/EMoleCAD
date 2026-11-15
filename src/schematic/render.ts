import type { Analyse, Knoten, LeiterName } from '../model/analyse'
import type { SymbolArt } from '../model/library'
import type { Datenverbindung, PaVerbindung, Projekt } from '../model/types'
import { Svg } from './svg'

export type Modus = 'einpolig' | 'allpolig'
/** hager: Einspeisung links von unten nach oben, Abgänge als Spalten rechts, Tabelle unten.
 *  baum: Einspeisung oben, Baum nach unten. */
export type Anordnung = 'hager' | 'baum'

export interface PlanOptionen {
  modus: Modus
  farbig: boolean
  netz: Projekt['netz']
  anordnung?: Anordnung
  tabelle?: boolean
  daten?: Datenverbindung[]
  pa?: PaVerbindung[]
}

export interface Plan {
  inhalt: string
  breite: number
  hoehe: number
}

const D = 4 // Leiterabstand allpolig
const SYM_H = 14
const OBEN = 16 // Platz für Einspeisungsbeschriftung (Baum)
const BESCHRIFTUNG_UNTEN = 42
const BUS_ABSTAND = 2.6

const LEITERFARBE: Record<LeiterName, string> = {
  L1: '#7a4a1e', L2: '#111111', L3: '#7d7d7d', N: '#1f6fd1', PE: '#2e9e3e', 'L+': '#c62828', 'L-': '#1f3fa8',
}

interface Lage {
  n: Knoten
  x: number
  symTop: number
  symBot: number
  aus: LeiterName[]
  busY: Partial<Record<LeiterName, number>>
  /** Teil der Einspeisekette (Energiefluss von unten nach oben) */
  kette: boolean
  /** Abzweig aus der Einspeisekette (z.B. ungezählter Bereich), nach oben gezeichnet */
  aufwaerts?: boolean
  /** Spaltenbereich bei Endstromkreisen */
  slotX0?: number
  slotW?: number
  /** Rechtes Ende der gezeichneten Sammelleitung */
  busMax?: number
  /** Am Potentialausgleich angeschlossen (Erdungssymbol entfällt beim SPD) */
  pa?: boolean
}

type Cx = (l: Lage, le: LeiterName, liste?: LeiterName[]) => number

const istPhase = (l: LeiterName) => l === 'L1' || l === 'L2' || l === 'L3'

function ausgaenge(n: Knoten): LeiterName[] {
  if (n.def.durchgang) return n.leiter
  if (n.kinder.some((c) => c.dc)) return ['L+', 'L-']
  return n.leiter
}

export function zeichnePlan(a: Analyse, o: PlanOptionen): Plan {
  const svg = new Svg()
  const allp = o.modus === 'allpolig'
  const hager = (o.anordnung ?? 'hager') === 'hager'
  const H = allp ? 42 : 32
  const farbe = (l: LeiterName) => (allp && o.farbig ? LEITERFARBE[l] : '#000')

  const alle = [...a.knoten.values()].filter((n) => !n.def.potential)
  if (!alle.length && a.potential.length) {
    // nur Potentialausgleichsschienen vorhanden
    const unten = potentialausgleich(svg, a, new Map(), o, allp, () => 0, { x: 10, y: 20 })
    return { inhalt: svg.toString(), breite: 140, hoehe: unten + 4 }
  }
  if (!alle.length) {
    svg.text(10, 20, 'Keine Komponenten vorhanden', { groesse: 4, farbe: '#888' })
    return { inhalt: svg.toString(), breite: 120, hoehe: 40 }
  }
  const eigeneBreite = (n: Knoten) => (allp ? Math.max(30, n.leiter.length * D + 24) : 26)

  // Einspeisekette: Hausanschluss und alle Durchgangsgeräte bis zur ersten Verzweigung
  const kette: Knoten[] = []
  const hauptWurzel = hager ? a.wurzeln.find((w) => w.def.wurzel) : undefined
  if (hauptWurzel) {
    let k = hauptWurzel
    kette.push(k)
    for (;;) {
      const naechster = hauptstrang(k)
      if (!naechster) break
      k = naechster
      kette.push(k)
    }
  }
  const inKette = new Set(kette)
  // Abzweige aus der Kette vor dem Kopf (z.B. SPD, Steuerbox im ungezählten Bereich)
  const seitenWurzeln: { k: number; n: Knoten }[] = []
  kette.slice(0, -1).forEach((kn, i) => kn.kinder.filter((c) => !inKette.has(c)).forEach((c) => seitenWurzeln.push({ k: i, n: c })))
  const seite = new Set<Knoten>()
  const sammle = (n: Knoten) => { seite.add(n); n.kinder.forEach(sammle) }
  seitenWurzeln.forEach((s) => sammle(s.n))
  const hoehe0 = (n: Knoten): number => (n.kinder.length ? 1 + Math.max(...n.kinder.map(hoehe0)) : 0)
  const seitenBedarf = seitenWurzeln.length ? Math.max(...seitenWurzeln.map((s) => s.k + hoehe0(s.n) + 2)) : 0

  const relTiefe = (n: Knoten) => n.tiefe - (hauptWurzel && istNachfahr(n, hauptWurzel) ? kette.length : 0)
  const baumKnoten = alle.filter((n) => !inKette.has(n) && !seite.has(n))
  const maxRel = baumKnoten.length ? Math.max(...baumKnoten.map(relTiefe)) : -1
  const zeilen = Math.max(maxRel + 1, kette.length, seitenBedarf)
  const abzweigAbstand = allp ? 12 : 10

  const busTop = 8
  const busBand = allp ? 5 * BUS_ABSTAND : 0
  const rowTop0 = hager ? busTop + busBand + 6 : OBEN
  const symTopZeile = (z: number) => rowTop0 + z * H + (hager ? 3 : 7)

  const lagen = new Map<Knoten, Lage>()
  const platziere = (n: Knoten, x0: number): number => {
    const zeile = n.kinder.length ? relTiefe(n) : zeilen - 1
    const symTop = symTopZeile(zeile)
    const l: Lage = { n, x: 0, symTop, symBot: symTop + SYM_H, aus: ausgaenge(n), busY: {}, kette: false }
    lagen.set(n, l)
    const eigen = eigeneBreite(n)
    if (!n.kinder.length) {
      l.x = x0 + eigen / 2
      l.slotX0 = x0
      l.slotW = eigen
      return eigen
    }
    let x = x0
    for (const c of n.kinder) x += platziere(c, x)
    const summe = Math.max(x - x0, eigen)
    // linksbündig: Gerät steht über seinem ersten Abgang
    l.x = lagen.get(n.kinder[0])!.x
    return summe
  }

  const platziereSeite = (n: Knoten, x0: number, basis: number, ebene: number): number => {
    // Überspannungsschutz direkt am Abgriff nach unten hängen (Erde zeigt nach unten)
    const runter = ebene === 0 && !n.kinder.length && n.def.symbol === 'spd'
    const symBot = runter ? basis + abzweigAbstand + (allp ? 2 : 6) + SYM_H : basis - ebene * H
    const l: Lage = { n, x: 0, symTop: symBot - SYM_H, symBot, aus: ausgaenge(n), busY: {}, kette: false, aufwaerts: !runter }
    lagen.set(n, l)
    const eigen = eigeneBreite(n)
    if (!n.kinder.length) {
      l.x = x0 + eigen / 2
      l.slotX0 = x0
      l.slotW = eigen
      return eigen
    }
    let x = x0
    for (const c of n.kinder) x += platziereSeite(c, x, basis, ebene + 1)
    const summe = Math.max(x - x0, eigen)
    l.x = lagen.get(n.kinder[0])!.x
    return summe
  }

  let x = 6
  let kopfBreite = 0
  let trennX: number | undefined
  if (kette.length) {
    kopfBreite = allp ? 46 : 44
    const kx = 6 + (allp ? 12 : 8)
    kette.forEach((k, i) => {
      const symTop = symTopZeile(zeilen - 1 - i)
      lagen.set(k, { n: k, x: kx, symTop, symBot: symTop + SYM_H, aus: ausgaenge(k), busY: {}, kette: true })
    })
    x = 6 + kopfBreite
    for (const s of seitenWurzeln) x += platziereSeite(s.n, x, lagen.get(kette[s.k])!.symTop - abzweigAbstand, 0)
    if (seitenWurzeln.length) trennX = x
    for (const c of kette[kette.length - 1].kinder) x += platziere(c, x)
    x += 6
  }
  for (const w of a.wurzeln) if (!lagen.has(w)) x += platziere(w, x) + 6
  const breite = Math.max(x, kopfBreite + 60)
  const yNetz = rowTop0 + zeilen * H - 2

  const cx: Cx = (l, leiter, liste = l.n.leiter) => {
    if (!allp) return l.x
    const i = liste.indexOf(leiter)
    return l.x + (i - (liste.length - 1) / 2) * D
  }

  // --- Sammelschienen / Verbindungen zwischen Eltern und Kindern ---
  for (const l of lagen.values()) {
    const kinder = l.n.kinder.map((k) => lagen.get(k)!).filter((k) => !k.kette)
    if (!kinder.length) continue
    const ausListe = allp ? l.aus : (['L1'] as LeiterName[])
    const benutzt = ausListe.filter((le) => !allp || kinder.some((k) => k.n.leiter.includes(le)))
    const istKopf = l.kette && l.n === kette[kette.length - 1]
    const istAbzweig = l.kette && !istKopf
    benutzt.forEach((le, i) => {
      const iv = ausListe.indexOf(le)
      let y: number
      if (istKopf) y = busTop + iv * BUS_ABSTAND // Sammelschiene oben, Leitung von unten kommend
      else if (istAbzweig) y = l.symTop - (allp ? 1.5 + (ausListe.length - 1 - iv) * 1.8 : 3) // Abgriff an der Einspeisung
      else if (l.aufwaerts) y = l.symTop - 4 - (allp ? (benutzt.length - 1 - i) * BUS_ABSTAND : 0)
      else y = l.symBot + 4 + (allp ? i * BUS_ABSTAND : 0)
      l.busY[le] = y
      const px = cx(l, le, ausListe)
      const punkte: { x: number; senk: number }[] = [{ x: px, senk: istAbzweig ? 2 : 1 }]
      for (const k of kinder) {
        if (allp && !k.n.leiter.includes(le)) continue
        const kx = allp ? cx(k, le) : k.x
        const p = punkte.find((pp) => Math.abs(pp.x - kx) < 0.01)
        if (p) p.senk++
        else punkte.push({ x: kx, senk: 1 })
      }
      const xs = punkte.map((p) => p.x)
      const min = Math.min(...xs), max = Math.max(...xs)
      const fa = farbe(le)
      if (!istAbzweig) svg.linie(px, l.kette || l.aufwaerts ? l.symTop : l.symBot, px, y, { farbe: fa })
      const schiene = l.n.def.symbol === 'schiene'
      if (max - min > 0.01) l.busMax = Math.max(l.busMax ?? -Infinity, max)
      if (max - min > 0.01) svg.linie(min, y, max, y, { farbe: fa, breite: schiene ? (allp ? 0.8 : 1.1) : istKopf ? 0.5 : 0.35 })
      for (const p of punkte) {
        const grad = p.senk + (p.x > min + 0.01 ? 1 : 0) + (p.x < max - 0.01 ? 1 : 0)
        if (grad >= 3) svg.punkt(p.x, y, fa)
      }
    })
  }

  // nur gültige Verbindungen zählen (beide Enden vorhanden), sonst bliebe ein SPD ohne Erdung
  const paIds = new Set((o.pa ?? []).filter((d) => d.von !== d.nach && a.knoten.has(d.von) && a.knoten.has(d.nach)).flatMap((d) => [d.von, d.nach]))
  for (const l of lagen.values()) if (paIds.has(l.n.k.id)) l.pa = true

  // --- Komponenten ---
  for (const l of lagen.values()) {
    const n = l.n
    const eltern = n.eltern ? lagen.get(n.eltern) : undefined
    for (const le of allp ? n.leiter : (['L1'] as LeiterName[])) {
      const xx = cx(l, le)
      const fa = farbe(le)
      if (!eltern && n.def.wurzel && allp && le === 'PE' && o.netz.form !== 'TN-S') continue // PE entsteht im HAK bzw. am Erder
      if (l.kette) {
        // Energiefluss von unten nach oben
        if (!eltern) svg.linie(xx, l.symBot, xx, yNetz, { farbe: fa })
        else {
          const ex = allp && eltern.n.leiter.includes(le) ? cx(eltern, le) : xx
          const ym = (eltern.symTop + l.symBot) / 2
          svg.pfad(`M ${ex} ${eltern.symTop} V ${ym} H ${xx} V ${l.symBot}`, { farbe: fa })
        }
        continue
      }
      let yStart: number
      if (eltern) yStart = eltern.busY[allp ? le : 'L1'] ?? l.symTop - 4
      else yStart = n.def.wurzel && !hager ? OBEN - 2 : l.symTop - 5
      svg.linie(xx, yStart, xx, l.aufwaerts ? l.symBot : l.symTop, { farbe: fa })
    }
    if (!eltern && n.def.wurzel) einspeisung(svg, l, cx, o, allp, farbe, l.kette ? yNetz : undefined)
    else if (!allp && eltern && !l.kette) leiterZahl(svg, l, eltern, eltern.busY.L1, !!o.farbig)
    if (allp) symbolAllpolig(svg, l, cx, farbe, o)
    else symbolEinpolig(svg, l)
    if (n.def.symbol === 'schiene' && l.kette && n === kette[kette.length - 1]) {
      // Sammelschiene als Kopf der Einspeisung: Beschriftung an der Schiene
      const kurz = n.def.kurz?.(n.k.params ?? {}) ?? ''
      const ty = busTop - 1.6
      svg.text(l.x + (allp ? 12 : 4), ty, `${n.bmk}  ${n.k.name ?? kurz}`, { groesse: 2.3, fett: true })
      if (n.k.name && kurz) svg.text(l.x + (allp ? 12 : 4) + 40, ty, kurz, { groesse: 1.9, farbe: '#333' })
    } else beschriftung(svg, l, allp, cx, hager && o.tabelle !== false, (o.daten ?? []).filter((d) => d.von === n.k.id || d.nach === n.k.id).length)
  }

  datenLinien(svg, lagen, o, allp, cx)
  const paUnten = potentialausgleich(svg, a, lagen, o, allp, cx, { x: 6 + kopfBreite, y: yNetz - 8 })

  let hoehe = Math.max(hager ? yNetz + 12 : OBEN + zeilen * H + BESCHRIFTUNG_UNTEN, paUnten + 4)
  if (hager && o.tabelle !== false) {
    const blaetter = [...lagen.values()].filter((l) => l.slotW !== undefined).sort((p, q) => p.slotX0! - q.slotX0!)
    if (blaetter.length) hoehe = tabelle(svg, blaetter, 2, blaetter[0].slotX0!, yNetz + 12, trennX) + 4
  }
  return { inhalt: svg.toString(), breite, hoehe }
}

/** Typen, die die Einspeisekette fortsetzen (Hauptstromweg vom HAK zur Hauptverteilung) */
const HAUPTSTRANG = ['hlak', 'zaehler', 'sls', 'trennschalter', 'sicherung']

function hauptstrang(k: Knoten): Knoten | undefined {
  if (!k.def.durchgang) return undefined
  if (k.kinder.length === 1) return k.kinder[0].def.durchgang ? k.kinder[0] : undefined
  const kandidaten = k.kinder.filter((c) => HAUPTSTRANG.includes(c.k.typ))
  return kandidaten.length === 1 ? kandidaten[0] : undefined
}

// ---------- Informationsverbindungen ----------

type Seite = 'oben' | 'unten' | 'kette' | 'rechts'

function datenLinien(svg: Svg, lagen: Map<Knoten, Lage>, o: PlanOptionen, allp: boolean, cx: Cx) {
  const liste = o.daten ?? []
  if (!liste.length) return
  const nachId = new Map([...lagen.values()].map((l) => [l.n.k.id, l]))
  const farbe = allp && !o.farbig ? '#000' : '#8e24aa'
  const seite = (l: Lage): Seite => (l.kette ? 'kette' : !l.n.kinder.length ? (l.aufwaerts ? 'oben' : 'unten') : 'rechts')
  const geometrie = (l: Lage) => {
    const xs = l.n.leiter.map((le) => cx(l, le))
    const spann = Math.max(...xs) - Math.min(...xs)
    const durch = l.n.def.durchgang
    const hb = !allp ? (durch ? 4.5 : 5) : durch ? spann / 2 + 2.5 : Math.max(12, spann + 6) / 2
    const oben = l.symTop + (durch ? 2.5 : allp ? 1.5 : 2)
    const unten = oben + (durch ? 9 : allp ? 11 : 10)
    // rechte Kante: beim allpoligen Zähler endet der Kasten vor dem PE
    const ohnePE = l.n.leiter.filter((le) => le !== 'PE').map((le) => cx(l, le))
    const rechts = allp && l.n.def.symbol === 'zaehler' && ohnePE.length ? Math.max(...ohnePE) + 2 : l.x + hb
    return { hb, oben, unten, mitte: (oben + unten) / 2, rechts }
  }
  // Anschlüsse je Gerät zählen, damit mehrere Leitungen nebeneinander liegen
  const zaehl = new Map<string, number>()
  const gesamt = new Map<string, number>()
  liste.forEach((d) => [d.von, d.nach].forEach((id) => gesamt.set(id, (gesamt.get(id) ?? 0) + 1)))
  const anschluss = (l: Lage, stich: number) => {
    const id = l.n.k.id
    const i = zaehl.get(id) ?? 0
    zaehl.set(id, i + 1)
    const v = (i - ((gesamt.get(id) ?? 1) - 1) / 2) * 2.5
    const g = geometrie(l)
    switch (seite(l)) {
      case 'oben': return { p: [l.x + v, g.oben], s: [l.x + v, g.oben - stich] }
      case 'unten': return { p: [l.x + v, g.unten], s: [l.x + v, g.unten + stich] }
      // Einspeisekette: rechts oben anfahren, Beschriftung steht darunter
      case 'kette': return { p: [g.rechts, g.oben + 1.5 + i * 1.6], s: [g.rechts + stich, g.oben + 1.5 + i * 1.6] }
      default: return { p: [l.x + g.hb, g.mitte + v], s: [l.x + g.hb + stich, g.mitte + v] }
    }
  }
  liste.forEach((d, i) => {
    let a = nachId.get(d.von), b = nachId.get(d.nach)
    if (!a || !b || a === b) return
    // Geräte in der Einspeisekette werden seitlich angefahren: dort immer als Ziel routen
    if (seite(a) === 'kette' && seite(b) !== 'kette') [a, b] = [b, a]
    const stich = 3 + i * 1.6
    const q = anschluss(a, stich), z = anschluss(b, stich)
    let pkt: number[][]
    let ecke: number[]
    if (seite(b) === 'kette' && seite(a) === 'oben' && q.p[1] > z.p[1] + 1) {
      // direkt: senkrecht hoch, dann waagerecht in die rechte Seite des Geräts
      ecke = [q.p[0], z.p[1]]
      pkt = [q.p, ecke, z.p]
    } else {
      ecke = [z.s[0], q.s[1]]
      pkt = [q.p, q.s, ecke, z.s, z.p]
    }
    svg.pfad('M ' + pkt.map((pp) => `${pp[0].toFixed(2)} ${pp[1].toFixed(2)}`).join(' L '), { farbe, breite: 0.3, strich: '1.6 0.6 0.3 0.6' })
    svg.kreis(q.p[0], q.p[1], 0.45, { farbe, fuellung: farbe, breite: 0.1 })
    svg.kreis(z.p[0], z.p[1], 0.45, { farbe, fuellung: farbe, breite: 0.1 })
    if (d.art) {
      const direkt = pkt.length === 3
      const lang = direkt || Math.abs(ecke[0] - q.s[0]) > 8
      const tx = direkt ? (ecke[0] + z.p[0]) / 2 : lang ? (q.s[0] + ecke[0]) / 2 : z.s[0] + 1
      const ty = lang ? ecke[1] - 0.8 : (ecke[1] + z.s[1]) / 2
      svg.text(tx, ty, d.art, { groesse: 1.7, anker: lang ? 'middle' : 'start', farbe })
    }
  })
}

// ---------- Potentialausgleich ----------

const PA_FARBE = '#2e9e3e'

/** Zeichnet Potentialausgleichsschienen und ihre Verbindungen (eigene Verkabelung, getrennt vom Strompfad).
 *  Gibt die unterste belegte y-Position zurück. */
function potentialausgleich(svg: Svg, a: Analyse, lagen: Map<Knoten, Lage>, o: PlanOptionen, allp: boolean, cx: Cx, frei: { x: number; y: number }): number {
  const liste = o.pa ?? []
  if (!a.potential.length && !liste.length) return 0
  const fa = o.farbig ? PA_FARBE : '#000'
  const nachId = new Map([...lagen.values()].map((l) => [l.n.k.id, l]))
  const stil = { farbe: fa, breite: 0.35 }
  let unten = 0

  // Anschlusspunkt eines Geräts: p = am Gerät, w = Weg dorthin (Punkt, von dem es senkrecht weitergeht)
  const anschluss = (l: Lage): { p: number[]; x: number; pe?: boolean } => {
    const n = l.n
    if (n.def.symbol === 'spd') return l.aufwaerts ? { p: [l.x, l.symTop + (allp ? 1.5 : 2)], x: l.x } : { p: [l.x, l.symTop + (allp ? 12.5 : 12)], x: l.x }
    if (n.def.symbol === 'schiene' && l.busMax !== undefined) {
      const y = l.busY.PE ?? l.busY.L1
      if (y !== undefined) return { p: [l.busMax, y], x: l.busMax, pe: !allp }
    }
    const xs = n.leiter.map((le) => cx(l, le))
    const rechts = allp ? Math.max(...xs) + (n.def.durchgang ? 3.5 : 6) : l.x + (n.def.durchgang ? 4.5 : 5)
    // rechts am Gerät, unten (Beschriftung steht oben rechts)
    return { p: [rechts, l.symBot - 2], x: rechts + 3 }
  }
  const leitung = (q: { p: number[]; x: number; pe?: boolean }, y: number, text?: string) => {
    const [px, py] = q.p
    svg.pfad(`M ${px} ${py} H ${q.x} V ${y}`, stil)
    svg.kreis(px, py, 0.45, { farbe: fa, fuellung: fa, breite: 0.1 })
    // einpolig steht die Sammelleitung für alle Leiter: Anschluss am PE kennzeichnen
    if (q.pe) svg.text(px + 0.9, py + (y > py ? 2.6 : -1), 'PE', { groesse: 1.6, farbe: fa })
    if (text) svg.text(q.x + 0.8, (Math.max(py, y - 8) + y) / 2, text, { groesse: 1.6, farbe: fa })
  }
  const querschnitt = (d: PaVerbindung) => (d.querschnitt ? `${d.querschnitt}${/mm/.test(d.querschnitt) ? '' : ' mm²'}` : undefined)

  let yFrei = frei.y
  const schienen = new Map<string, { x0: number; x1: number; y: number }>()
  for (const pas of a.potential) {
    const id = pas.k.id
    const verb = liste.filter((d) => d.von === id || d.nach === id)
    const partner = verb.map((d) => ({ d, l: nachId.get(d.von === id ? d.nach : d.von) })).filter((v): v is { d: PaVerbindung; l: Lage } => !!v.l)
    const ans = partner.map((v) => ({ ...v, a: anschluss(v.l) }))
    // Schienenhöhe: unter allen Anschlüssen, Geräte der Einspeisekette möglichst waagerecht anfahren
    const kette = ans.filter((v) => v.l.kette).map((v) => v.a.p[1])
    const sonst = ans.filter((v) => !v.l.kette).map((v) => v.a.p[1] + 6)
    let y = Math.max(...kette, ...sonst, -Infinity)
    if (!Number.isFinite(y)) y = yFrei
    yFrei = y + 12
    // Geräte der Einspeisekette auf Schienenhöhe werden direkt waagerecht angefahren
    const direkt = ans.filter((v) => v.l.kette && Math.abs(v.a.p[1] - y) < 0.01)
    const senk = ans.filter((v) => !direkt.includes(v))
    const xs = senk.map((v) => v.a.x)
    const links = direkt.length ? Math.max(...direkt.map((v) => v.a.p[0])) + 14 : frei.x
    const x0 = xs.length ? Math.min(Math.min(...xs) - 4, Math.max(links, Math.min(...xs) - 4)) : links
    const x1 = Math.max(x0 + 24, ...xs.map((x) => x + 6))
    for (const v of senk) leitung(v.a, y, querschnitt(v.d))
    for (const v of direkt) {
      const [px, py] = v.a.p
      svg.linie(px, py, x0, py, stil)
      svg.kreis(px, py, 0.45, { farbe: fa, fuellung: fa, breite: 0.1 })
      const t = querschnitt(v.d)
      if (t) svg.text((px + x0) / 2, py - 0.8, t, { groesse: 1.6, farbe: fa, anker: 'middle' })
    }
    // Schiene mit Klemmpunkten
    svg.rechteck(x0, y - 0.6, x1 - x0, 1.2, { farbe: fa, fuellung: '#fff', breite: 0.35 })
    for (const x of xs) svg.punkt(x, y, fa, 0.45)
    const p = pas.k.params ?? {}
    const erder = p.erder && p.erder !== 'ohne' ? String(p.erder) : ''
    const tx = x1 + 2
    svg.text(tx, y - 0.4, pas.bmk, { groesse: 2.3, fett: true })
    svg.text(tx, y + 2.4, pas.k.name ?? 'Potentialausgleichsschiene', { groesse: 1.8 })
    if (erder) {
      const ex = x1 - 3
      svg.linie(ex, y + 0.7, ex, y + 4, { farbe: fa, breite: 0.35 })
      erde(svg, ex, y + 4, fa)
      svg.text(tx, y + 5, erder + (p.querschnitt ? `, ${p.querschnitt} mm²` : ''), { groesse: 1.6, farbe: '#444' })
    }
    schienen.set(id, { x0, x1, y })
    unten = Math.max(unten, y + 7)
  }
  // Verbindungen zwischen zwei Schienen: von Schienenende zu Schienenende
  for (const d of liste) {
    const sa = schienen.get(d.von), sb = schienen.get(d.nach)
    if (!sa || !sb || sa === sb) continue
    const xa = sa.x0 + 2, xb = sb.x0 + 2
    const yu = Math.max(sa.y, sb.y) + 6
    svg.pfad(`M ${xa} ${sa.y} V ${yu} H ${xb} V ${sb.y}`, stil)
    const t = querschnitt(d)
    if (t) svg.text((xa + xb) / 2, yu - 0.8, t, { groesse: 1.6, farbe: fa, anker: 'middle' })
    unten = Math.max(unten, yu + 2)
  }

  // Potentialausgleich direkt zwischen zwei Geräten (ohne PAS)
  const pasIds = new Set(a.potential.map((n) => n.k.id))
  for (const d of liste) {
    if (pasIds.has(d.von) || pasIds.has(d.nach)) continue
    const la = nachId.get(d.von), lb = nachId.get(d.nach)
    if (!la || !lb || la === lb) continue
    const qa = anschluss(la), qb = anschluss(lb)
    const y = Math.max(qa.p[1], qb.p[1]) + 4
    leitung(qa, y, querschnitt(d))
    leitung(qb, y)
    svg.linie(qa.x, y, qb.x, y, stil)
    unten = Math.max(unten, y + 2)
  }
  return unten
}

function istNachfahr(n: Knoten, vorfahr: Knoten): boolean {
  for (let k: Knoten | undefined = n; k; k = k.eltern) if (k === vorfahr) return true
  return false
}

// ---------- Stromkreistabelle ----------

function tabelle(svg: Svg, spalten: Lage[], x0: number, kopfEnde: number, y0: number, trennX?: number): number {
  const vorgeschaltet = (n: Knoten, pred: (k: Knoten) => boolean) => {
    for (let k = n.eltern; k; k = k.eltern) if (pred(k)) return k
    return undefined
  }
  const phasen = (n: Knoten) => (n.dc ? 'DC' : n.pole === 3 ? '3/N/PE' : `${n.phase}/N/PE`)
  const zeilen: { titel: string; wert: (n: Knoten) => string; hoch?: boolean }[] = [
    { titel: 'Stromkreis', wert: (n) => n.bmk },
    { titel: 'Bezeichnung', wert: (n) => n.k.name ?? n.def.label, hoch: true },
    { titel: 'Schutzorgan', wert: (n) => { const s = vorgeschaltet(n, (k) => ['ls', 'rcbo', 'sicherung'].includes(k.def.symbol)); return s ? `${s.bmk} ${s.def.kurz?.(s.k.params ?? {}) ?? ''}` : '' }, hoch: true },
    { titel: 'FI-Schutz', wert: (n) => { const s = vorgeschaltet(n, (k) => ['rcd', 'rcbo'].includes(k.def.symbol)); const p = s?.k.params ?? {}; return s ? `${s.bmk} ${p.fehlerstrom ?? ''}mA ${p.rcdtyp ?? ''}` : '' }, hoch: true },
    { titel: 'Anschluss', wert: phasen },
    { titel: 'Kabeltyp', wert: (n) => n.k.kabel?.typ ?? '' },
    { titel: 'Querschnitt', wert: (n) => (n.k.kabel?.querschnitt ? `${n.k.kabel.querschnitt} mm²` : '') },
    { titel: 'Länge', wert: (n) => (n.k.kabel?.laenge ? `${n.k.kabel.laenge} m` : '') },
    { titel: 'Kenndaten', wert: (n) => n.def.kurz?.(n.k.params ?? {}) ?? '', hoch: true },
    { titel: 'Hersteller', wert: (n) => n.k.produkt?.hersteller ?? '' },
    { titel: 'Artikelnummer', wert: (n) => n.k.produkt?.artikel ?? '' },
  ]
  const x1 = Math.max(...spalten.map((s) => s.slotX0! + s.slotW!))
  const gr = 1.8
  let y = y0
  svg.rechteck(x0, y0, x1 - x0, 0.01, { breite: 0.5, fuellung: 'none' })
  for (const z of zeilen) {
    const h = z.hoch ? 6.6 : 4.4
    svg.linie(x0, y + h, x1, y + h, { breite: z === zeilen[zeilen.length - 1] ? 0.5 : 0.2 })
    svg.text(x0 + 1.5, y + h / 2 + 0.7, z.titel, { groesse: gr, fett: true })
    for (const s of spalten) {
      const mx = s.slotX0! + s.slotW! / 2
      const max = Math.max(6, Math.floor(s.slotW! / (gr * 0.52)))
      const teile = z.hoch ? umbrechen(z.wert(s.n), max).slice(0, 2) : [kuerzen(z.wert(s.n), max)]
      const start = y + h / 2 + 0.7 - ((teile.length - 1) * 2.2) / 2
      teile.forEach((t, i) => svg.text(mx, start + i * 2.2, t, { groesse: gr, anker: 'middle', fett: z.titel === 'Stromkreis' }))
    }
    y += h
  }
  // Senkrechte Linien
  svg.linie(x0, y0, x0, y, { breite: 0.5 })
  svg.linie(kopfEnde, y0, kopfEnde, y, { breite: 0.35 })
  const grenzen = new Set<number>()
  spalten.forEach((s) => { grenzen.add(Math.round(s.slotX0! * 100) / 100); grenzen.add(Math.round((s.slotX0! + s.slotW!) * 100) / 100) })
  for (const g of grenzen) if (g > kopfEnde + 0.5) svg.linie(g, y0, g, y, { breite: g >= x1 - 0.01 ? 0.5 : 0.2 })
  if (trennX !== undefined && trennX < x1 - 0.5) svg.linie(trennX, y0, trennX, y, { breite: 0.5 })
  return y
}

function kuerzen(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// Leiterkennzeichnung im einpoligen Plan nach IEC 60617 (S00003/S00004/S00005):
// Außenleiter als Schrägstrich (bei mehreren mit Anzahl), N mit Punkt, PE mit Querstrich
function leiterZahl(svg: Svg, l: Lage, eltern: Lage, yQuelle: number | undefined, farbig: boolean) {
  const n = l.n
  if (n.kinder.length && eltern.n.leiter.length === n.leiter.length) return
  // Reihenfolge vom Symbol weg: PE, N, Außenleiter (Außenleiter liegt also zur Quelle hin)
  const marken: ('L' | 'N' | 'PE')[] = []
  if (n.dc) marken.push('L')
  else {
    if (n.leiter.includes('PE')) marken.push('PE')
    if (n.leiter.includes('N')) marken.push('N')
    if (n.leiter.some(istPhase)) marken.push('L')
  }
  const phasen = n.dc ? 2 : n.leiter.filter(istPhase).length
  const r = 0.85
  const richtung = l.aufwaerts ? 1 : -1
  const yEnde = l.aufwaerts ? l.symBot : l.symTop
  // Platz bis zur Sammelleitung; die Marken dürfen sie nicht berühren
  const platz = yQuelle === undefined ? 99 : Math.abs(yEnde - yQuelle) - 1.3
  let schritt = 1.7, abstand = 1.7
  const k = marken.length - 1
  if (abstand + k * schritt + r > platz) {
    abstand = Math.max(r + 0.3, platz - k * schritt - r)
    if (abstand + k * schritt + r > platz && k > 0) schritt = Math.max(1.1, (platz - abstand - r) / k)
  }
  marken.forEach((m, i) => {
    const fa = farbig && m !== 'L' ? LEITERFARBE[m] : '#000'
    const y = yEnde + richtung * (abstand + i * schritt)
    svg.linie(l.x - r, y + r, l.x + r, y - r, { farbe: fa })
    if (m === 'L' && phasen > 1) svg.text(l.x + r + 0.4, y - r + 0.2, String(phasen), { groesse: 1.8 })
    if (m === 'N') svg.punkt(l.x + r, y - r, fa, 0.5)
    if (m === 'PE') svg.linie(l.x + r - 0.4, y - r, l.x + r + 1.1, y - r, { farbe: fa })
  })
}

function einspeisung(svg: Svg, l: Lage, cx: Cx, o: PlanOptionen, allp: boolean, farbe: (l: LeiterName) => string, yUnten?: number) {
  const netz = o.netz
  const unten = yUnten !== undefined
  const xpe = cx(l, 'PE'), xn = cx(l, 'N')
  if (!allp) {
    const y = unten ? yUnten + 3.5 : OBEN - 8
    svg.text(l.x - 3, y, `${netz.form}  3/N/PE ~50 Hz`, { groesse: 2.2, fett: true, anker: unten ? 'start' : 'middle' })
    if (netz.spannung) svg.text(l.x - 3, y + 3, netz.spannung, { groesse: 2, anker: unten ? 'start' : 'middle' })
    if (unten) svg.text(l.x - 3, y + 6, 'Netzanschluss', { groesse: 1.8, farbe: '#444' })
  } else {
    const y = unten ? yUnten + 1 : OBEN - 4
    for (const le of l.n.leiter) {
      if (le === 'PE' && netz.form !== 'TN-S') continue
      const label = le === 'N' && netz.form === 'TN-C-S' ? 'PEN' : le
      svg.text(cx(l, le) + 0.7, y, label, { groesse: 1.8, drehung: -90, farbe: farbe(le), anker: unten ? 'end' : 'start' })
    }
    if (unten) svg.text(xpe + 3, y + 3, `${netz.form}${netz.spannung ? '  ' + netz.spannung : ''}`, { groesse: 2.2, fett: true })
    else svg.text(l.x, y - 9.5, `${netz.form}${netz.spannung ? '  ' + netz.spannung : ''}`, { groesse: 2.4, anker: 'middle', fett: true })
  }
  if (!allp) return
  if (netz.form === 'TN-C-S') {
    // PEN-Aufteilung im HAK (auf der Abgangsseite)
    const ys = unten ? l.symTop + 2 : l.symBot - 2
    svg.linie(xn, ys, xpe, ys, { farbe: farbe('PE') })
    svg.linie(xpe, ys, xpe, unten ? l.symTop : l.symBot, { farbe: farbe('PE') })
    svg.punkt(xn, ys, farbe('PE'))
  } else if (netz.form === 'TT') {
    const ye = unten ? l.symBot + 4 : l.symTop + 4
    svg.linie(xpe, ye, xpe, unten ? l.symTop : l.symBot, { farbe: farbe('PE') })
    erde(svg, xpe, ye, farbe('PE'), !unten)
    svg.text(xpe + 2.5, unten ? ye + 1.5 : ye - 1.5, 'Anlagenerder', { groesse: 1.6 })
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
    case 'smgw':
      t('SMGW', 1.9)
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
    case 'schiene':
      verbindung(y0, y1)
      break
    case 'klemme': {
      verbindung(y0, y1)
      const ym = (y0 + y1) / 2
      svg.rechteck(x - 3.5, ym - 3, 7, 6, { fuellung: 'none' })
      svg.kreis(x, ym, 1, { fuellung: '#fff' })
      break
    }
    case 'verteiler':
      verbindung(y0, y1)
      svg.rechteck(x - 4, y0 + 2, 8, y1 - y0 - 4, { strich: '1.2 0.8', fuellung: 'none' })
      svg.text(x, (y0 + y1) / 2 + 0.8, 'UV', { groesse: 2.2, anker: 'middle', fett: true })
      break
    default: {
      const w = 10, h = 10, bt = y0 + 2
      if (l.aufwaerts) verbindung(bt + h, y1)
      else verbindung(y0, bt)
      if (mitKindern) {
        if (l.aufwaerts) verbindung(y0, bt)
        else verbindung(bt + h, y1)
      }
      svg.rechteck(x - w / 2, bt, w, h)
      boxInhalt(svg, art, x - w / 2, bt, w, h)
      if (art === 'spd' && !l.pa) {
        if (l.aufwaerts) { verbindung(bt - 2, bt); erde(svg, x, bt - 2, '#000', true) }
        else { verbindung(bt + h, bt + h + 2); erde(svg, x, bt + h + 2) }
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
    const auf = !!l.aufwaerts
    for (const le of n.leiter) svg.linie(cx(l, le), auf ? bt + h : y0, cx(l, le), auf ? y1 : bt, { farbe: farbe(le) })
    if (n.kinder.length) for (const le of l.aus) svg.linie(cx(l, le, l.aus), auf ? y0 : bt + h, cx(l, le, l.aus), auf ? bt : y1, { farbe: farbe(le) })
    svg.rechteck(bx, bt, w, h)
    boxInhalt(svg, art, bx, bt, w, h)
    if (art === 'spd' && !l.pa) {
      if (auf) { svg.linie(l.x, bt - 2, l.x, bt); erde(svg, l.x, bt - 2, '#000', true) }
      else { svg.linie(l.x, bt + h, l.x, bt + h + 2); erde(svg, l.x, bt + h + 2) }
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
  if (art === 'klemme') {
    const ym = (y0 + y1) / 2
    svg.rechteck(xmin - 2.5, ym - 3, xmax - xmin + 5, 6, { fuellung: 'none' })
    for (const le of n.leiter) svg.kreis(cx(l, le), ym, 1, { farbe: farbe(le), fuellung: '#fff' })
  }
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

function beschriftung(svg: Svg, l: Lage, allp: boolean, cx: Cx, mitTabelle: boolean, datenAnschluesse = 0) {
  const n = l.n
  const rechts = allp ? Math.max(...n.leiter.map((le) => cx(l, le))) + (n.def.durchgang ? 3.5 : 4.5) : l.x + (n.def.durchgang ? 5.5 : 6.5)
  const kurz = n.def.kurz?.(n.k.params ?? {}) ?? ''
  // Bei Datenanschlüssen rechts oben (Einspeisekette) die Beschriftung darunter beginnen
  let y = l.symTop + 3.6 + (l.kette && datenAnschluesse ? 2.5 + datenAnschluesse * 1.6 : 0)
  svg.text(rechts, y, n.bmk, { groesse: 2.4, fett: true })
  y += 2.8
  if (kurz.trim()) {
    for (const zeile of umbrechen(kurz, 12)) {
      svg.text(rechts, y, zeile, { groesse: 1.9 })
      y += 2.4
    }
  }
  const phasenText = n.dc ? 'DC' : n.pole === 3 ? '3/N/PE' : `${n.phase}/N/PE`
  if (!n.kinder.length && mitTabelle) {
    // Angaben stehen in der Stromkreistabelle
  } else if (!n.kinder.length) {
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
    const links = l.x - (allp ? (n.leiter.length * D) / 2 + 1 : 1.5)
    if (kt && l.kette) svg.text(links, l.symBot + 2, kt, { groesse: 1.7, anker: 'end', farbe: '#333', drehung: -90 })
    else if (kt) svg.text(l.x - (allp ? (n.leiter.length * D) / 2 + 1 : 1.5), l.symTop - 1, kt, { groesse: 1.7, anker: 'end', farbe: '#333' })
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
