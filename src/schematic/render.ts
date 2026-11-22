import type { Analyse, Knoten, LeiterName } from '../model/analyse'
import { anschluesse, klemmenText, standardParams, type SymbolArt } from '../model/library'
import type { Datenverbindung, Leitungstyp, PaVerbindung, Projekt } from '../model/types'
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
  /** Aufteilung auf mehrere Blätter (z.B. zweiter Zählerstrang) */
  blatt?: BlattBezug
  /** Höchstzahl Endstromkreise je Blatt, danach geht es auf einem Folgeblatt weiter (0 = unbegrenzt).
   *  Wirkt nur über zeichnePlaene/blattTeilung; zeichnePlan zeichnet immer genau ein Blatt. */
  maxAbgaenge?: number
  /** Intern (zeichnePlaene): Blattangaben der Querverweise als Platzhalter lassen, damit sie nach dem
   *  Zeichnen aller Blätter mit Planquadrat ersetzt werden. Sonst steht dort nur „S.<Blatt>“. */
  verweisPlatzhalter?: boolean
}

/** Bezug eines Blatts auf die übrigen Blätter des Plansatzes */
export interface BlattBezug {
  nr: number
  /** Blatt und BMK jeder Komponente des Plansatzes */
  ort: Map<string, { blatt: number; bmk: string }>
  /** Komponente auf einem anderen Blatt, von der dieses Blatt gespeist wird */
  zufuehrung?: { id: string; bmk: string; blatt: number; leiter: string }
  /** BMK-Beschriftung der Verweise auf andere Blätter (je Verweis-Komponente), ohne Blattangabe */
  verweis?: Map<string, string>
  /** Folgeblatt: diese Komponente steht auf einem anderen Blatt, ihre Abgänge gehen hier weiter */
  fortsetzung?: string
}

export interface Plan {
  inhalt: string
  breite: number
  hoehe: number
  /** Lage der auf diesem Blatt gezeichneten Komponenten (Planmaß), Ziel für Querverweise */
  orte?: Map<string, { x: number; y: number }>
  /** Lage der Gegenstellen von Querverweisen (Pfeile, Stiche) auf diesem Blatt, nach Ankername */
  anker?: Map<string, { x: number; y: number }>
  /** Ziele der Querverweise; im Inhalt steht dafür ein Platzhalter (siehe VERWEIS_MUSTER) */
  verweise?: VerweisZiel[]
}

/** Platzhalter für die Blattangabe eines Querverweises („S.2-B3“); wird ersetzt, sobald alle Blätter
 *  gezeichnet sind und die Planquadrate der Ziele feststehen */
// oxlint-disable-next-line no-control-regex -- Platzhalter bzw. Latin-1-Bereich bewusst
export const VERWEIS_MUSTER = /\u0001(\d+)\u0001/g

/** Ziel eines Querverweises: die Gegenstelle (`anker`) auf Blatt `blatt`, ersatzweise die Komponente `id` */
export interface VerweisZiel { blatt: number; anker: string; id: string }

/** Ankernamen der Gegenstellen. Ein Querverweis zeigt immer auf die Stelle des Zielblatts, an der die
 *  Leitung weitergeht (Pfeil oder Stich mit dem Rückverweis), nicht auf das Gerät selbst. */
const ANKER = {
  /** Abgangspfeil zum Blatt `nach` */
  ab: (nach: number) => `#ab:${nach}`,
  /** Zuführung am Fuß der Einspeisekette */
  zu: '#zu',
  daten: (i: number) => `#daten:${i}`,
  pa: (i: number) => `#pa:${i}`,
}

/** Sammelt Querverweise und die Lage der Komponenten und Gegenstellen eines Blatts */
class Verweise {
  ziele: VerweisZiel[] = []
  orte = new Map<string, { x: number; y: number }>()
  /** Getrennt von `orte`, damit eine Komponenten-ID keinen Anker überschreibt */
  anker_ = new Map<string, { x: number; y: number }>()
  /** Platzhalter für die Blattangabe der Gegenstelle `anker` auf Blatt `blatt` */
  ziel(blatt: number, anker: string, id: string) {
    this.ziele.push({ blatt, anker, id })
    return `\u0001${this.ziele.length - 1}\u0001`
  }
  /** Lage einer Gegenstelle auf diesem Blatt */
  anker(name: string, x: number, y: number) {
    this.anker_.set(name, { x, y })
  }
  /** Platzhalter durch „S.<Blatt>“ ersetzen, außer zeichnePlaene löst sie selbst auf */
  fertig(inhalt: string, o: PlanOptionen) {
    if (o.verweisPlatzhalter) return inhalt
    return inhalt.replace(VERWEIS_MUSTER, (_, k: string) => `S.${this.ziele[Number(k)].blatt}`)
  }
}

const D = 4 // Leiterabstand allpolig
const SYM_H = 14
const OBEN = 16 // Platz für Einspeisungsbeschriftung (Baum)
const BESCHRIFTUNG_UNTEN = 42
const BUS_ABSTAND = 2.6
/** Steuerleitungskanal: Abstand paralleler Leitungen, Spurabstand im Kanal */
const KANAL_ABSTAND = 1.5
const KANAL_SPUR = 2.4

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
  /** Abgang aus der Einspeisekette, der nach unten aufgebaut wird: Steigleitung links
   *  vom Abgang (x) hoch zur Speiseleitung (y je Leiter) */
  steig?: { x: number; y: Partial<Record<LeiterName, number>> }
  /** Senkrechte Gasse rechts neben dem Teilbaum für Steuerleitungen in den Kanal */
  kanalX?: number
}

type Cx = (l: Lage, le: LeiterName, liste?: LeiterName[]) => number

const istPhase = (l: LeiterName) => l === 'L1' || l === 'L2' || l === 'L3'

function ausgaenge(n: Knoten): LeiterName[] {
  if (n.def.durchgang) return n.leiter
  if (n.kinder.some((c) => c.dc)) return ['L+', 'L-']
  return n.leiter
}

export function zeichnePlan(a: Analyse, o: PlanOptionen): Plan {
  // Verbindungen über Klemmleisten zu einem Zug zusammenfassen (Gerät – Klemmleiste – … – Gerät)
  o = { ...o, daten: zuege(o.daten ?? [], a) }
  klemmOrte = []
  const svg = new Svg()
  const vw = new Verweise()
  const allp = o.modus === 'allpolig'
  const hager = (o.anordnung ?? 'hager') === 'hager'
  const H = allp ? 42 : 32
  const farbe = (l: LeiterName) => (allp && o.farbig ? LEITERFARBE[l] : '#000')

  const bezug = o.blatt
  /** Komponente steht auf einem anderen Blatt und wird hier nur als Verweis gezeichnet */
  const fremd = (id: string) => !!bezug && (bezug.ort.get(id)?.blatt ?? bezug.nr) !== bezug.nr
  const alle = [...a.knoten.values()].filter((n) => !n.def.potential)
  if (!alle.length && a.potential.length) {
    // nur Potentialausgleichsschienen vorhanden
    const pa = potentialausgleich(svg, a, new Map(), o, allp, () => 0, { x: 10, y: 20 }, vw)
    return { inhalt: vw.fertig(svg.toString(), o), breite: Math.max(120, pa.rechts + 4), hoehe: pa.unten + 4, orte: vw.orte, anker: vw.anker_, verweise: vw.ziele }
  }
  if (!alle.length) {
    svg.text(10, 20, 'Keine Komponenten vorhanden', { groesse: 4, farbe: '#888' })
    return { inhalt: svg.toString(), breite: 120, hoehe: 40 }
  }
  const eigeneBreite = (n: Knoten) => (allp ? Math.max(30, n.leiter.length * D + 24) : 26)

  // Einspeisekette: Hausanschluss und alle Durchgangsgeräte bis zur ersten Verzweigung
  const hauptWurzel = hager ? (a.wurzeln.find((w) => w.def.wurzel) ?? (bezug?.zufuehrung ? a.wurzeln[0] : undefined)) : undefined
  const kette: Knoten[] = hauptWurzel ? einspeiseKette(hauptWurzel) : []
  const inKette = new Set(kette)
  // Abzweige aus der Kette vor dem Kopf (z.B. SPD, Steuerbox im ungezählten Bereich)
  // Abzweige hinter dem (ersten) Zähler sind Verteilerstränge: Sie werden wie die Hauptverteilung
  // von oben nach unten aufgebaut (Schutzorgane oben, Endverbraucher unten über der Tabelle).
  // Der ungezählte Bereich (SPD, SMGW, Steuerbox) bleibt kompakt an der Einspeisung.
  const zaehlerIdx = kette.findIndex((k) => k.k.typ === 'zaehler')
  const seitenWurzeln: { k: number; n: Knoten; ab: boolean }[] = []
  kette.slice(0, -1).forEach((kn, i) => kn.kinder.filter((c) => !inKette.has(c)).forEach((c) => seitenWurzeln.push({ k: i, n: c, ab: zaehlerIdx >= 0 && i >= zaehlerIdx && !fremd(c.k.id) })))
  // Verweise auf andere Blätter hinter die Geräte des ungezählten Bereichs, damit diese zusammen bleiben;
  // nach unten aufgebaute Verteilerstränge danach
  const rang = (s: { n: Knoten; ab: boolean }) => (s.ab ? 2 : fremd(s.n.k.id) ? 1 : 0)
  seitenWurzeln.sort((p, q) => rang(p) - rang(q))
  const seiteAuf = new Set<Knoten>()
  const seiteAb = new Map<Knoten, number>() // Knoten -> Zeile (Ebene ab Strangwurzel)
  const sammle = (n: Knoten) => { seiteAuf.add(n); n.kinder.forEach(sammle) }
  const sammleAb = (n: Knoten, e: number) => { seiteAb.set(n, e); n.kinder.forEach((c) => sammleAb(c, e + 1)) }
  seitenWurzeln.forEach((s) => (s.ab ? sammleAb(s.n, 0) : sammle(s.n)))
  const hoehe0 = (n: Knoten): number => (n.kinder.length ? 1 + Math.max(...n.kinder.map(hoehe0)) : 0)
  const auf = seitenWurzeln.filter((s) => !s.ab)
  const seitenBedarf = auf.length ? Math.max(...auf.map((s) => s.k + hoehe0(s.n) + 2)) : 0
  const abBedarf = Math.max(0, ...seitenWurzeln.filter((s) => s.ab).map((s) => hoehe0(s.n) + 1))

  const relTiefe = (n: Knoten) => n.tiefe - (hauptWurzel && istNachfahr(n, hauptWurzel) ? kette.length : 0)
  const baumKnoten = alle.filter((n) => !inKette.has(n) && !seiteAuf.has(n) && !seiteAb.has(n))
  const maxRel = baumKnoten.length ? Math.max(...baumKnoten.map(relTiefe)) : -1
  const zeilen = Math.max(maxRel + 1, kette.length, seitenBedarf, abBedarf)
  const abzweigAbstand = allp ? 12 : 10

  const busTop = 8
  const busBand = allp ? 5 * BUS_ABSTAND : 0
  const hatAb = seitenWurzeln.some((s) => s.ab)
  // allpolig: eigenes Band für die Speiseleitungen der nach unten aufgebauten Abzweige
  const abBand = hatAb && allp ? 5 * BUS_ABSTAND + 2 : 0
  const rowTop0 = hager ? busTop + busBand + 6 + abBand : OBEN
  const symTopZeile = (z: number) => rowTop0 + z * H + (hager ? 3 : 7)
  const speiseY = (iv: number) => (allp ? busTop + busBand + 4 + iv * BUS_ABSTAND : symTopZeile(0) - 5)

  // Steuerleitungen, die über den Kanal unter den Endverbrauchern geführt werden
  const kanalVerb = new Set<Datenverbindung>()
  const kanalAnz = new Map<Knoten, number>()
  // nur in der Hager-Anordnung, wo Einspeisekette und ungezählter Bereich bekannt sind
  for (const d of kette.length ? (o.daten ?? []) : []) {
    const p = a.knoten.get(d.von), q = a.knoten.get(d.nach)
    if (!p || !q || p === q || fremd(d.von) || fremd(d.nach) || p.def.potential || q.def.potential) continue
    if (inKette.has(p) || inKette.has(q)) continue
    // beide im ungezählten Bereich: kurze direkte Verbindung
    if (seiteAuf.has(p) && seiteAuf.has(q)) continue
    kanalVerb.add(d)
    for (const n of [p, q]) if (n.kinder.length || seiteAuf.has(n)) kanalAnz.set(n, (kanalAnz.get(n) ?? 0) + 1)
  }
  // Gasse für die senkrechten Steuerleitungen rechts neben dem Teilbaum
  const gasse = (n: Knoten) => kanalAnz.has(n)
  /** Verbreitert den Tabellenplatz des Endstromkreises an der rechten (bzw. linken) Kante eines Teilbaums */
  const verbreitere = (n: Knoten, kante: number, um: number, links = false) => {
    for (const l of lagen.values()) {
      if (l.slotW === undefined || !istNachfahr(l.n, n)) continue
      if (!links && Math.abs(l.slotX0! + l.slotW - kante) < 0.01) { l.slotW += um; return }
      if (links && Math.abs(l.slotX0! - kante) < 0.01) { l.slotX0 = kante - um; l.slotW += um; return }
    }
  }

  const lagen = new Map<Knoten, Lage>()
  const platziere = (n: Knoten, x0: number): number => {
    const zeile = n.kinder.length ? (seiteAb.get(n) ?? relTiefe(n)) : zeilen - 1
    const symTop = symTopZeile(zeile)
    const l: Lage = { n, x: 0, symTop, symBot: symTop + SYM_H, aus: ausgaenge(n), busY: {}, kette: false }
    lagen.set(n, l)
    const eigen = eigeneBreite(n)
    if (!n.kinder.length) {
      l.x = x0 + eigen / 2
      l.slotX0 = x0
      l.slotW = eigen
      return eigen + mitGasse(l, x0 + eigen)
    }
    let x = x0
    for (const c of n.kinder) x += platziere(c, x)
    const summe = Math.max(x - x0, eigen)
    // linksbündig: Gerät steht über seinem ersten Abgang
    l.x = lagen.get(n.kinder[0])!.x
    return summe + mitGasse(l, x0 + summe)
  }
  /** Reserviert die Steuerleitungsgasse rechts vom Teilbaum; gibt ihre Breite zurück */
  const mitGasse = (l: Lage, kante: number) => {
    if (!gasse(l.n)) return 0
    // Gasse rechts von der Beschriftung im Teilbaum
    let textEnde = kante
    for (const t of lagen.values()) if (istNachfahr(t.n, l.n)) textEnde = Math.max(textEnde, beschriftungsEnde(t))
    l.kanalX = Math.max(kante + 3, textEnde + 1.5)
    const g = l.kanalX - kante + (kanalAnz.get(l.n)! - 1) * KANAL_ABSTAND + 2.5
    verbreitere(l.n, kante, g)
    return g
  }
  /** Rechtes Ende der Gerätebeschriftung (Schätzung über die Zeichenzahl) */
  const beschriftungsEnde = (t: Lage) => {
    const n = t.n
    const rechts = (allp ? t.x + ((n.leiter.length - 1) / 2) * D + (n.def.durchgang ? 3.5 : 4.5) : t.x + (n.def.durchgang ? 5.5 : 6.5)) + textVersatz(n, allp)
    const kurz = kurzText(n)
    const zeilen = [...(kurz.trim() ? umbrechen(kurz, 12) : []), ...(n.kinder.length && n.k.name ? umbrechen(n.k.name, 14) : [])]
    return rechts + Math.max(n.bmk.length * 1.5, ...zeilen.map((z) => z.length * 1.0))
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
      return eigen + mitGasse(l, x0 + eigen)
    }
    let x = x0
    for (const c of n.kinder) x += platziereSeite(c, x, basis, ebene + 1)
    const summe = Math.max(x - x0, eigen)
    l.x = lagen.get(n.kinder[0])!.x
    return summe + mitGasse(l, x0 + summe)
  }

  /** Abzweig hinter dem Zähler: Steigleitung links, darüber Speiseleitung, Strang nach unten */
  const platziereAb = (n: Knoten, x0: number, quelle: Knoten): number => {
    const steigW = allp ? n.leiter.length * D + 4 : 6
    const w = platziere(n, x0 + steigW)
    const l = lagen.get(n)!
    const ausListe = allp ? ausgaenge(quelle) : (['L1'] as LeiterName[])
    const y: Partial<Record<LeiterName, number>> = {}
    for (const le of allp ? n.leiter : (['L1'] as LeiterName[])) y[le] = speiseY(Math.max(0, ausListe.indexOf(le)))
    l.steig = { x: x0 + steigW / 2, y }
    verbreitere(n, x0 + steigW, steigW, true)
    return w + steigW
  }

  let x = 6
  let kopfBreite = 0
  let trennX: number | undefined
  if (kette.length) {
    // Platz für Hilfsleitungen, die rechts an der Einspeisekette entlang laufen
    const kettenLeitungen = (o.daten ?? []).filter((d) => kette.slice(0, -1).some((k) => k.k.id === d.von || k.k.id === d.nach)).length
    kopfBreite = (allp ? 46 : 44) + Math.max(0, ...kette.map((k) => textVersatz(k, allp))) + (o.daten ?? []).length * 1.6 * Math.min(1, kettenLeitungen)
    const kx = 6 + (allp ? 12 : 8)
    kette.forEach((k, i) => {
      const symTop = symTopZeile(zeilen - 1 - i)
      lagen.set(k, { n: k, x: kx, symTop, symBot: symTop + SYM_H, aus: ausgaenge(k), busY: {}, kette: true })
    })
    x = 6 + kopfBreite
    for (const s of seitenWurzeln) {
      if (s.ab) x += platziereAb(s.n, x, kette[s.k])
      else x += platziereSeite(s.n, x, lagen.get(kette[s.k])!.symTop - abzweigAbstand, 0)
      if (!s.ab) trennX = x
    }
    for (const c of kette[kette.length - 1].kinder) x += platziere(c, x)
    x += 6
  }
  for (const w of a.wurzeln) if (!lagen.has(w)) x += platziere(w, x) + 6
  let breite = Math.max(x, kopfBreite + 60)
  const yNetz = rowTop0 + zeilen * H - 2

  const cx: Cx = (l, leiter, liste = l.n.leiter) => {
    if (!allp) return l.x
    const i = liste.indexOf(leiter)
    return l.x + (i - (liste.length - 1) / 2) * D
  }
  /** x der Steigleitung je Leiter */
  const steigX = (l: Lage, le: LeiterName) => (allp ? l.steig!.x + (l.n.leiter.indexOf(le) - (l.n.leiter.length - 1) / 2) * D : l.steig!.x)

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
        const kx = k.steig ? steigX(k, le) : allp ? cx(k, le) : k.x
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
          // Leiterkennzeichnung unter dem Gerät (Energiefluss von unten nach oben)
          if (!allp && !fremd(n.k.id)) leiterZahl(svg, { ...l, aufwaerts: true }, eltern.symTop, !!o.farbig)
        }
        continue
      }
      let yStart: number
      if (l.steig && eltern && l.steig.y[le] !== undefined && eltern.busY[allp ? le : 'L1'] !== undefined) {
        // Steigleitung vom Abgriff hoch, dann waagerecht über den Abgang
        const sx = steigX(l, le)
        yStart = l.steig.y[le]!
        svg.pfad(`M ${sx} ${eltern.busY[allp ? le : 'L1']} V ${yStart} H ${xx}`, { farbe: fa })
      } else if (eltern) yStart = eltern.busY[allp ? le : 'L1'] ?? l.symTop - 4
      else yStart = n.def.wurzel && !hager ? OBEN - 2 : l.symTop - 5
      svg.linie(xx, yStart, xx, l.aufwaerts ? l.symBot : l.symTop, { farbe: fa })
    }
    if (bezug?.fortsetzung === n.k.id) {
      // Fortsetzung der Abgänge eines Geräts von einem anderen Blatt: nur die Leitung, kein Symbol
      for (const le of allp ? l.aus : (['L1'] as LeiterName[])) svg.linie(cx(l, le, l.aus), l.symTop, cx(l, le, l.aus), l.symBot, { farbe: farbe(le) })
      if (!eltern && l.kette && bezug.zufuehrung) {
        zufuehrung(svg, l, allp, cx, yNetz, bezug.zufuehrung, vw, bezug.nr)
        if (!allp) leiterZahl(svg, { ...l, aufwaerts: true }, yNetz, !!o.farbig)
      }
      continue
    }
    if (fremd(n.k.id)) {
      if (!allp && eltern) leiterZahl(svg, l, eltern.busY.L1, !!o.farbig)
      const nach = bezug!.ort.get(n.k.id)!.blatt
      const spitze = verweisPfeil(svg, l, allp, cx, bezug!.verweis?.get(n.k.id) ?? n.bmk, vw.ziel(nach, ANKER.zu, n.k.id))
      vw.anker(ANKER.ab(nach), l.x, spitze)
      continue
    }
    if (!eltern && n.def.wurzel) einspeisung(svg, l, cx, o, allp, farbe, l.kette ? yNetz : undefined)
    else if (!eltern && l.kette && bezug?.zufuehrung) {
      zufuehrung(svg, l, allp, cx, yNetz, bezug.zufuehrung, vw, bezug.nr)
      if (!allp) leiterZahl(svg, { ...l, aufwaerts: true }, yNetz, !!o.farbig)
    }
    else if (!allp && eltern && !l.kette) leiterZahl(svg, l, l.steig?.y.L1 ?? eltern.busY.L1, !!o.farbig)
    if (allp) symbolAllpolig(svg, l, cx, farbe, o)
    else symbolEinpolig(svg, l)
    // Klemmen der Hilfsspannung (Anschluss „UH“) an der Zuleitung
    const uh = anschluesse(parameter(n)).find((x) => x.name === 'UH')
    if (uh && !n.def.durchgang) svg.text((allp ? Math.max(...n.leiter.map((le) => cx(l, le))) : l.x) + 0.7, l.aufwaerts ? l.symBot - 0.4 : l.symTop + 1.3, uh.klemmen, { groesse: 1.3 })
    if (n.def.symbol === 'schiene' && l.kette && n === kette[kette.length - 1]) {
      // Sammelschiene als Kopf der Einspeisung: Beschriftung an der Schiene
      const kurz = kurzText(n)
      const ty = busTop - 1.6
      svg.text(l.x + (allp ? 12 : 4), ty, `${n.bmk}  ${n.k.name ?? kurz}`, { groesse: 2.3, fett: true })
      if (n.k.name && kurz) svg.text(l.x + (allp ? 12 : 4) + 40, ty, kurz, { groesse: 1.9, farbe: '#333' })
    } else beschriftung(svg, l, allp, cx, hager && o.tabelle !== false, (o.daten ?? []).filter((d) => d.von === n.k.id || d.nach === n.k.id).length)
  }

  // Verweise auf andere Blätter sind keine echten Anschlusspunkte für Hilfsleitungen
  const eigene = new Map([...lagen].filter(([n]) => !fremd(n.k.id)))
  const mitTabelle = hager && o.tabelle !== false
  const unterste = symTopZeile(zeilen - 1)
  // Kanal unter den Endverbrauchern; ohne Tabelle unter deren senkrechter Beschriftung
  const textUnten = mitTabelle ? 0 : Math.max(0, ...[...eigene.values()].filter((l) => !l.n.kinder.length && Math.abs(l.symTop - unterste) < 0.01).map((l) => Math.max((l.n.k.name ?? l.n.def.label).length, kabelText(l.n).length) * 1.25 + 4))
  // Klemmenangaben an den Abgängen in den Kanal brauchen Platz über der obersten Spur
  const kanalKlemmen = Math.max(0, ...[...kanalVerb].flatMap((d) => [d.von, d.nach].map((id) => { const l = lagen.get(a.knoten.get(id)!); return l ? klemmenLaenge(d, l) : 0 })))
  const kanal = { verb: kanalVerb, y0: unterste + SYM_H + 1 + textUnten + kanalKlemmen, unterste, mitTabelle }
  const daten = datenLinien(svg, eigene, o, allp, cx, vw, kanal)
  // Einbauorte (z. B. eigener Messumformerschrank) als Strichpunkt-Rahmen um Geräte und Klemmleisten
  const orte = new Map<string, { x0: number; y0: number; x1: number; y1: number }>()
  const erweitere = (ort: string, b: { x0: number; y0: number; x1: number; y1: number }) => {
    const r = orte.get(ort)
    orte.set(ort, r ? { x0: Math.min(r.x0, b.x0), y0: Math.min(r.y0, b.y0), x1: Math.max(r.x1, b.x1), y1: Math.max(r.y1, b.y1) } : { ...b })
  }
  for (const l of eigene.values()) {
    const ort = l.n.k.params?.ort
    if (!ort || l.kette || l.n.def.symbol === 'verteiler') continue
    const g = geometrie(l, allp, cx)
    erweitere(String(ort), { x0: l.x - g.hb - 1.5, y0: g.oben - 1.5, x1: Math.max(l.x + g.hb + 1.5, beschriftungsEnde(l)), y1: g.unten + 1.5 })
  }
  for (const k of klemmOrte) if (k.n.k.params?.ort) erweitere(String(k.n.k.params.ort), { x0: k.x0 - 1.5, y0: k.y0 - 1.5, x1: k.x1 + 1, y1: k.y1 + 1 })
  for (const [ort, r] of orte) {
    const y0 = r.y0 - 3
    svg.rechteck(r.x0, y0, r.x1 - r.x0, r.y1 - y0, { farbe: '#444', fuellung: 'none', breite: 0.25, strich: '2 0.8 0.4 0.8' })
    svg.text(r.x0 + 0.8, y0 + 2, ort, { groesse: 1.6, farbe: '#444', fett: true })
  }
  const pa = potentialausgleich(svg, a, eigene, o, allp, cx, { x: 6 + kopfBreite, y: yNetz - 8 }, vw)
  for (const l of eigene.values()) vw.orte.set(l.n.k.id, { x: l.x, y: (l.symTop + l.symBot) / 2 })
  breite = Math.max(breite, pa.rechts + 4, daten.rechts + 4)

  let hoehe = Math.max(hager ? yNetz + 12 : OBEN + zeilen * H + BESCHRIFTUNG_UNTEN, pa.unten + 4, daten.unten + 4)
  if (mitTabelle) {
    const blaetter = [...lagen.values()].filter((l) => l.slotW !== undefined && !fremd(l.n.k.id)).sort((p, q) => p.slotX0! - q.slotX0!)
    if (blaetter.length) hoehe = tabelle(svg, blaetter, 2, blaetter[0].slotX0!, Math.max(yNetz + 12, daten.unten + 3), trennX) + 4
  }
  return { inhalt: vw.fertig(svg.toString(), o), breite, hoehe, orte: vw.orte, anker: vw.anker_, verweise: vw.ziele }
}

/** Typen, die die Einspeisekette fortsetzen (Hauptstromweg vom HAK zur Hauptverteilung) */
const HAUPTSTRANG = ['hlak', 'zaehler', 'sls', 'trennschalter', 'sicherung', 'stromwandler', 'schuetz']

export function hauptstrang(k: Knoten): Knoten | undefined {
  if (!k.def.durchgang) return undefined
  if (k.kinder.length === 1) return k.kinder[0].def.durchgang ? k.kinder[0] : undefined
  const kandidaten = k.kinder.filter((c) => HAUPTSTRANG.includes(c.k.typ))
  if (kandidaten.length === 1) return kandidaten[0]
  // mehrere Zählerstränge (z.B. Modul 2 mit separatem Zähler): der erste ist der Hauptstrang
  return kandidaten.find(hatZaehler)
}

export function hatZaehler(n: Knoten): boolean {
  return n.k.typ === 'zaehler' || n.kinder.some(hatZaehler)
}

/** Einspeisekette ab einer Wurzel: alle Durchgangsgeräte entlang des Hauptstrangs */
export function einspeiseKette(w: Knoten): Knoten[] {
  const kette = [w]
  for (let k = hauptstrang(w); k; k = hauptstrang(k)) kette.push(k)
  return kette
}

// ---------- Verweise auf andere Blätter ----------

/** Senkrechte Schrift (Drehung -90°) liegt links ihrer Grundlinie; Versatz der Grundlinie,
 *  damit die Zeile mittig auf `x` steht */
const MITTE_SENKRECHT = 0.36

/** Abgang auf ein anderes Blatt: Leitung endet in einem Pfeil; dahinter in Pfeilrichtung die
 *  Blattangabe des Ziels („S.2-B3“, fett, auf der Leitungsachse) und rechts daneben die BMK */
function verweisPfeil(svg: Svg, l: Lage, allp: boolean, cx: Cx, bmk: string, ziel: string): number {
  const xs = allp ? l.n.leiter.map((le) => cx(l, le)) : [l.x]
  const y = l.aufwaerts ? l.symBot : l.symTop
  const richtung = l.aufwaerts ? -1 : 1
  if (xs.length > 1) svg.linie(Math.min(...xs), y, Math.max(...xs), y, { breite: 0.35 })
  const spitze = y + richtung * 5
  svg.linie(l.x, y, l.x, spitze - richtung * 2, { breite: 0.35 })
  svg.pfad(`M ${l.x} ${spitze} L ${l.x - 1} ${spitze - richtung * 2} L ${l.x + 1} ${spitze - richtung * 2} Z`, { fuellung: '#000', breite: 0.2 })
  // Text beginnt mit Abstand hinter der Pfeilspitze und läuft vom Pfeil weg
  const ty = spitze + richtung * 1.2
  const anker = l.aufwaerts ? 'start' : 'end'
  const gr = 2.2
  svg.text(l.x + gr * MITTE_SENKRECHT, ty, ziel, { groesse: gr, fett: true, drehung: -90, anker })
  svg.text(l.x + gr * MITTE_SENKRECHT + 2.6, ty, bmk, { groesse: 1.9, drehung: -90, anker })
  return spitze
}

/** Zuführung von einem anderen Blatt am Fuß der Einspeisekette */
function zufuehrung(svg: Svg, l: Lage, allp: boolean, cx: Cx, yNetz: number, z: { id: string; bmk: string; blatt: number; leiter: string }, vw: Verweise, nr: number) {
  const xs = allp ? l.n.leiter.map((le) => cx(l, le)) : [l.x]
  if (xs.length > 1) svg.linie(Math.min(...xs), yNetz, Math.max(...xs), yNetz, { breite: 0.35 })
  const sx = Math.min(...xs)
  svg.pfad(`M ${l.x} ${yNetz - 2.5} L ${l.x - 1} ${yNetz - 0.5} L ${l.x + 1} ${yNetz - 0.5} Z`, { fuellung: '#000', breite: 0.2 })
  // Rückverweis auf den Abgangspfeil des speisenden Blatts
  svg.text(sx - 3, yNetz + 3.5, `von ${z.bmk}  ${vw.ziel(z.blatt, ANKER.ab(nr), z.id)}`, { groesse: 2.2, fett: true })
  // Anker in der Mitte des Pfeils (Spitze bei yNetz - 2.5), damit das Planquadrat den Pfeil trifft
  vw.anker(ANKER.zu, l.x, yNetz - 1.5)
  svg.text(sx - 3, yNetz + 6.5, z.leiter, { groesse: 2 })
}

// ---------- Informationsverbindungen ----------

type Seite = 'oben' | 'unten' | 'kette' | 'rechts' | 'links'

/** Umriss eines Geräts für Anschlüsse von Hilfsleitungen */
function geometrie(l: Lage, allp: boolean, cx: Cx) {
  const xs = l.n.leiter.map((le) => cx(l, le))
  const spann = Math.max(...xs) - Math.min(...xs)
  const durch = l.n.def.durchgang
  const hb = !allp ? (durch ? 4.5 : 5) : durch ? spann / 2 + 2.5 : Math.max(12, spann + 6) / 2
  const oben = l.symTop + (durch ? 2.5 : allp ? 1.5 : 2)
  let unten = oben + (durch ? 9 : allp ? 11 : 10)
  // einpolige Verbraucher-Schaltzeichen sind teils kürzer als der Gerätekasten
  if (!allp && l.n.def.symbol === 'verbraucher') unten = l.symTop + verbraucherZeichen(l.n).unten
  // rechte Kante: beim allpoligen Zähler endet der Kasten vor dem PE
  const ohnePE = l.n.leiter.filter((le) => le !== 'PE').map((le) => cx(l, le))
  const rechts = halbindirekt(l.n) ? (allp ? Math.max(...xs) : l.x) + ZAEHLER_SEITE.rechts(allp)
    : allp && l.n.def.symbol === 'zaehler' && ohnePE.length ? Math.max(...ohnePE) + 2 : l.x + hb
  return { hb, oben, unten, mitte: (oben + unten) / 2, rechts, xmax: Math.max(...xs) }
}

interface Kanal {
  verb: Set<Datenverbindung>
  /** Oberste Spur */
  y0: number
  /** symTop der Endverbraucherzeile */
  unterste: number
  mitTabelle: boolean
}

/** Zeichnet die Informationsverbindungen; gibt die rechteste und unterste belegte Position zurück */
function datenLinien(svg: Svg, lagen: Map<Knoten, Lage>, o: PlanOptionen, allp: boolean, cx: Cx, vw: Verweise, kanal?: Kanal): { rechts: number; unten: number } {
  const alleVerb = o.daten ?? []
  let rechts = 0
  let unten = 0
  if (!alleVerb.length) return { rechts, unten }
  const nachId = new Map([...lagen.values()].map((l) => [l.n.k.id, l]))
  const stilVon = (d: Datenverbindung) => leitungsStil(d.typ, allp, !!o.farbig)
  const kanalAm = (l: Lage) => (kanal ? [...kanal.verb].filter((d) => d.von === l.n.k.id || d.nach === l.n.k.id).length : 0)
  if (kanal?.verb.size) {
    const k = datenKanal(svg, [...kanal.verb].map((d) => ({ d, a: nachId.get(d.von)!, b: nachId.get(d.nach)! })).filter((v) => v.a && v.b), kanal, allp, cx, stilVon)
    rechts = k.rechts
    unten = k.unten
  }
  const liste = alleVerb.filter((d) => !kanal?.verb.has(d))
  const geo = (l: Lage) => geometrie(l, allp, cx)
  const grundSeite = (l: Lage): Seite => (l.kette ? 'kette' : !l.n.kinder.length ? (l.aufwaerts ? 'oben' : 'unten') : 'rechts')
  /** Geräte mit Abgängen werden seitlich angefahren: von der Seite, auf der die Gegenstelle liegt */
  const seite = (l: Lage, gegen?: Lage): Seite => {
    const s = grundSeite(l)
    if (s !== 'rechts' || !gegen) return s
    const gx = grundSeite(gegen) === 'kette' ? geo(gegen).rechts : gegen.x
    return gx < l.x - geo(l).hb ? 'links' : 'rechts'
  }
  // Anschlüsse je Gerät zählen, damit mehrere Leitungen nebeneinander liegen
  const zaehl = new Map<string, number>()
  const gesamt = new Map<string, number>()
  /** Anschlussseite je Leitungsende (Schlüssel der Zählung: Gerät und Seite) */
  const schluessel = (id: string, gegenId: string) => {
    const l = nachId.get(id), g = nachId.get(gegenId)
    return l ? `${id}:${seite(l, g)}` : id
  }
  liste.forEach((d) => [schluessel(d.von, d.nach), schluessel(d.nach, d.von)].forEach((k) => gesamt.set(k, (gesamt.get(k) ?? 0) + 1)))
  const anschluss = (l: Lage, stich: number, gegen?: Lage) => {
    const s = seite(l, gegen)
    const id = `${l.n.k.id}:${s}`
    const i = zaehl.get(id) ?? 0
    zaehl.set(id, i + 1)
    // neben den Abgängen in den Steuerleitungskanal (die liegen mittig am Gerät)
    const kc = s === 'oben' || s === 'unten' ? kanalAm(l) : 0
    const v = kc ? -((gesamt.get(id) ?? 1) - i) * 2.5 - ((kc - 1) / 2) * KANAL_ABSTAND : (i - ((gesamt.get(id) ?? 1) - 1) / 2) * 2.5
    const g = geo(l)
    switch (s) {
      case 'oben': return { p: [l.x + v, g.oben], s: [l.x + v, g.oben - stich] }
      case 'unten': return { p: [l.x + v, g.unten], s: [l.x + v, g.unten + stich] }
      // Einspeisekette: rechts oben anfahren, Beschriftung steht darunter
      case 'kette': return { p: [g.rechts, g.oben + 1.5 + i * 1.6], s: [g.rechts + stich, g.oben + 1.5 + i * 1.6] }
      // links nicht über den Planrand hinaus
      case 'links': return { p: [l.x - g.hb, g.mitte + v], s: [Math.max(1.5, l.x - g.hb - stich), g.mitte + v] }
      default: return { p: [l.x + g.hb, g.mitte + v], s: [l.x + g.hb + stich, g.mitte + v] }
    }
  }
  // Verweis-Stiche auf andere Blätter je Gerät zählen, damit sie gestaffelt werden können
  const verweisZiel = (d: Datenverbindung) => {
    const a = nachId.get(d.von), b = nachId.get(d.nach)
    const fern = !a ? d.von : !b ? d.nach : undefined
    const ziel = fern ? o.blatt?.ort.get(fern) : undefined
    return (a || b) && ziel ? { l: (a ?? b)!, ziel, id: fern! } : undefined
  }
  // Rechtes Ende der Beschriftungen in der Einspeisekette (Schätzung über die Zeichenzahl)
  /** Sammelschiene als Kopf der Kette: Beschriftung oben an der Schiene, nicht neben den Geräten */
  const istKopf = (l: Lage) => l.kette && l.n.def.symbol === 'schiene' && !l.n.kinder.some((k) => lagen.get(k)?.kette)
  const textEnde = (l: Lage) => {
    const n = l.n
    if (istKopf(l)) {
      // Sammelschiene als Kopf der Kette: einzeilige Beschriftung „BMK  Name“ (2.3) und ggf. Kenndaten 40 mm weiter
      const kurz = kurzText(n)
      const x0 = l.x + (allp ? 12 : 4)
      const ende = x0 + `${n.bmk}  ${n.k.name ?? kurz}`.length * 1.3
      return n.k.name && kurz ? Math.max(ende, x0 + 40 + kurz.length * 1.1) : ende
    }
    const r = (allp ? Math.max(...n.leiter.map((le) => cx(l, le))) + 3.5 : l.x + 5.5) + textVersatz(n, allp)
    const zeilen = [...umbrechen(kurzText(n), 12), ...(n.k.name ? umbrechen(n.k.name, 14) : [])]
    return r + Math.max(n.bmk.length * 1.5, ...zeilen.map((z) => z.length * 1.0))
  }
  const kettenLagen = [...lagen.values()].filter((l) => l.kette)
  const ketteTextEnde = Math.max(0, ...kettenLagen.map(textEnde))
  // Leitungen zwischen Geräten unterhalb des Kopfs laufen links an dessen Beschriftung vorbei
  const ketteTextEndeOhneKopf = Math.max(0, ...kettenLagen.filter((l) => !istKopf(l)).map(textEnde))
  const stichGesamt = new Map<Lage, number>()
  for (const d of liste) { const v = verweisZiel(d); if (v) stichGesamt.set(v.l, (stichGesamt.get(v.l) ?? 0) + 1) }
  const stichNr = new Map<Lage, number>()
  liste.forEach((d, i) => {
    const st = stilVon(d)
    const farbe = st.farbe
    let a = nachId.get(d.von), b = nachId.get(d.nach)
    // Gegenstelle auf einem anderen Blatt: kurzer Stich mit Verweis
    const verweis = verweisZiel(d)
    if (verweis) {
      const { l, ziel, id } = verweis
      const nr = stichNr.get(l) ?? 0
      stichNr.set(l, nr + 1)
      const senkrecht = seite(l) === 'oben' || seite(l) === 'unten'
      // oben/unten: der linke Stich geht am weitesten hinaus, so kreuzt keine Waagerechte einen anderen Stich
      const stufe = senkrecht ? (stichGesamt.get(l) ?? 1) - 1 - nr : 0
      // Stich über die übrigen Leitungen hinaus, damit er sich nicht mit ihnen kreuzt
      const q = anschluss(l, 3 + liste.length * 1.6 + stufe * 2.8)
      const rechtsterStich = l.x + (((gesamt.get(`${l.n.k.id}:${seite(l)}`) ?? 1) - 1) / 2) * 2.5
      const ende = [senkrecht ? Math.max(q.s[0], rechtsterStich) + 3 : q.s[0] + 4, q.s[1]]
      svg.pfad(`M ${q.p[0]} ${q.p[1]} L ${q.s[0]} ${q.s[1]} L ${ende[0]} ${ende[1]}`, { farbe, breite: st.breite, strich: st.strich })
      svg.kreis(q.p[0], q.p[1], 0.45, { farbe, fuellung: farbe, breite: 0.1 })
      const text = `${d.art ? d.art + ': ' : ''}${ziel.bmk}  `
      // Gegenstelle ist der Stich derselben Verbindung auf dem anderen Blatt
      const nrD = (o.daten ?? []).indexOf(d)
      const ref = vw.ziel(ziel.blatt, ANKER.daten(nrD), id)
      vw.anker(ANKER.daten(nrD), ende[0], ende[1])
      svg.text(ende[0] + 0.8, ende[1] + 0.6, text + ref, { groesse: 1.7, farbe })
      // Blattangabe „S.12-E8“ hat höchstens 7 Zeichen
      rechts = Math.max(rechts, ende[0] + 0.8 + (text.length + 7) * 0.9)
      return
    }
    if (!a || !b || a === b) return
    // Geräte in der Einspeisekette werden seitlich angefahren: dort immer als Ziel routen
    let vorwaerts = true
    if (seite(a) === 'kette' && seite(b) !== 'kette') { [a, b] = [b, a]; vorwaerts = false }
    const stich = 3 + i * 1.6
    // senkrechte Abgänge mit Klemmenangabe so lang, dass die Angabe daneben Platz hat
    const ext = (l: Lage) => (seite(l) === 'oben' || seite(l) === 'unten' ? Math.max(0, ...liste.map((e) => klemmenLaenge(e, l))) : 0)
    const q = anschluss(a, stich + ext(a), b), z = anschluss(b, stich + ext(b), a)
    let pkt: number[][]
    let ecke: number[]
    if (seite(a) === 'kette' && seite(b) === 'kette') {
      // zwei Geräte der Einspeisekette (z. B. Stromwandler – Wandlerzähler): rechts an den
      // Beschriftungen der Kette vorbei
      const x = (istKopf(a) || istKopf(b) ? ketteTextEnde : ketteTextEndeOhneKopf) + 1.5 + i * 1.6
      rechts = Math.max(rechts, x)
      ecke = [x, q.p[1]]
      pkt = [q.p, ecke, [x, z.p[1]], z.p]
    } else if (seite(b) === 'kette' && seite(a) === 'oben' && q.p[1] > z.p[1] + 1 && q.p[0] > ketteTextEnde) {
      // direkt: senkrecht hoch, dann waagerecht in die rechte Seite des Geräts
      ecke = [q.p[0], z.p[1]]
      pkt = [q.p, ecke, z.p]
    } else if (seite(b) === 'kette' && seite(a) !== 'kette') {
      // Gerät der Einspeisekette: Senkrechte rechts an den Beschriftungen der Kette vorbei,
      // dann waagerecht über der Beschriftung in den Anschluss
      const x = Math.max(z.s[0], (istKopf(b) ? ketteTextEnde : ketteTextEndeOhneKopf) + 1.5 + i * 1.6)
      rechts = Math.max(rechts, x)
      ecke = [x, q.s[1]]
      pkt = [q.p, q.s, ecke, [x, z.p[1]], z.p]
    } else {
      ecke = [z.s[0], q.s[1]]
      pkt = [q.p, q.s, ecke, z.s, z.p]
    }
    zeichneZug(svg, vorwaerts ? pkt : [...pkt].reverse(), d, st, a.n.k.id === d.von ? a : b, a.n.k.id === d.von ? b : a)
    if (d.art && !d.kabel) {
      const direkt = pkt.length === 3
      const lang = direkt || Math.abs(ecke[0] - q.s[0]) > 8
      // Mess-/Analogleitungen: Angabe im ersten Drittel, damit sie nicht mit Kabelangaben paralleler Leitungen zusammenfällt
      const anteil = d.typ && d.typ !== 'daten' ? 0.7 : 0.5
      const tx = direkt ? (ecke[0] + z.p[0]) / 2 : lang ? q.s[0] + (ecke[0] - q.s[0]) * anteil : z.s[0] + 1
      const ty = lang ? ecke[1] - 0.8 : (ecke[1] + z.s[1]) / 2
      svg.text(tx, ty, d.art, { groesse: 1.7, anker: lang ? 'middle' : 'start', farbe })
    }
  })
  return { rechts, unten }
}

/**
 * Steuerleitungen über einen Kanal unter den Endverbrauchern: jede Leitung läuft senkrecht
 * in eine eigene Spur und dort waagerecht zur Gegenstelle. Endverbraucher werden von unten
 * angefahren, Geräte mit Abgängen (und der ungezählte Bereich) über eine Gasse rechts neben
 * ihrem Teilbaum. Verschachtelte Leitungen bekommen innen liegende Spuren, damit sich
 * senkrechte und waagerechte Stücke möglichst nicht kreuzen.
 */
function datenKanal(svg: Svg, verb: { d: Datenverbindung; a: Lage; b: Lage }[], k: Kanal, allp: boolean, cx: Cx, stilVon: (d: Datenverbindung) => Stil): { rechts: number; unten: number } {
  const vonUnten = (l: Lage) => l.kanalX === undefined || (!l.n.kinder.length && !l.aufwaerts && !l.kette && Math.abs(l.symTop - k.unterste) < 0.01)
  const basis = (l: Lage) => (vonUnten(l) ? l.x : l.kanalX!)
  // Spuren: kürzere Leitungen innen (oben), überlappende darunter
  const spur = new Map<Datenverbindung, number>()
  const iv = (v: (typeof verb)[number]) => [Math.min(basis(v.a), basis(v.b)), Math.max(basis(v.a), basis(v.b))]
  const sortiert = [...verb].sort((p, q) => (iv(p)[1] - iv(p)[0]) - (iv(q)[1] - iv(q)[0]))
  const belegt: { a: number; b: number; s: number }[] = []
  for (const v of sortiert) {
    const [a, b] = iv(v)
    const s = 1 + Math.max(-1, ...belegt.filter((e) => e.a < b + 2 && a < e.b + 2).map((e) => e.s))
    belegt.push({ a, b, s })
    spur.set(v.d, s)
  }
  const spurY = (d: Datenverbindung) => k.y0 + spur.get(d)! * KANAL_SPUR
  // Reihenfolge der Abgänge je Gerät: nach links laufende innen liegend links, nach rechts laufende
  // mit der tiefsten Spur links, so liegt keine Senkrechte über einer fremden Waagerechten
  // Schlüssel je Verbindung (Index) und Gerät, damit doppelte Verbindungen getrennt bleiben
  const nr = new Map(verb.map((v, i) => [v, i]))
  const ende = new Map<string, { x: number; y: number; pfad: number[][] }>()
  const geraete = new Set(verb.flatMap((v) => [v.a, v.b]))
  for (const l of geraete) {
    const eigene = verb.filter((v) => v.a === l || v.b === l).map((v) => ({ v, gegen: basis(v.a === l ? v.b : v.a), s: spur.get(v.d)! }))
    const x0 = basis(l)
    const linksL = eigene.filter((e) => e.gegen < x0).sort((p, q) => p.s - q.s)
    const rechtsL = eigene.filter((e) => e.gegen >= x0).sort((p, q) => q.s - p.s)
    const reihe = [...linksL, ...rechtsL]
    const g = geometrie(l, allp, cx)
    const n = reihe.length
    reihe.forEach((e, i) => {
      const y = spurY(e.v.d)
      let pfad: number[][]
      if (vonUnten(l)) {
        const x = k.mitTabelle ? l.x + (i - (n - 1) / 2) * KANAL_ABSTAND : l.x + 2.5 + i * 1.3
        pfad = [[x, g.unten], [x, y]]
      } else {
        // oben rechts am Gerät heraus, über die Gasse nach unten
        const dx = l.kanalX! + i * KANAL_ABSTAND
        const start = allp ? g.xmax + 1.2 : l.x + 2.5
        const ax = start + (n - 1 - i) * 1.2
        const sy = g.oben - 1.2 - i * 1.2
        pfad = [[ax, g.oben], [ax, sy], [dx, sy], [dx, y]]
      }
      ende.set(`${nr.get(e.v)}:${l.n.k.id}`, { x: pfad[pfad.length - 1][0], y, pfad })
    })
  }
  let rechts = 0
  let unten = 0
  for (const v of verb) {
    const p = ende.get(`${nr.get(v)}:${v.a.n.k.id}`)!
    const q = ende.get(`${nr.get(v)}:${v.b.n.k.id}`)!
    const pkt = [...p.pfad, ...[...q.pfad].reverse()]
    const stil = stilVon(v.d)
    const farbe = stil.farbe
    zeichneZug(svg, pkt, v.d, stil, v.a, v.b)
    rechts = Math.max(rechts, p.x, q.x)
    unten = Math.max(unten, p.y + 1)
    if (!v.d.art) continue
    // Beschriftung in die größte freie Lücke der Spur (ohne kreuzende Senkrechte)
    const xa = Math.min(p.x, q.x), xb = Math.max(p.x, q.x)
    const kreuz = [...ende.values()].filter((e) => e.y > p.y + 0.01 && e.x > xa && e.x < xb).map((e) => e.x).sort((m, n) => m - n)
    const punkte = [xa, ...kreuz, xb]
    let best = 0
    for (let i = 1; i < punkte.length; i++) if (punkte[i] - punkte[i - 1] > punkte[best + 1] - punkte[best]) best = i - 1
    const breiteText = v.d.art.length * 0.8
    if (punkte[best + 1] - punkte[best] > breiteText + 1.5) svg.text((punkte[best] + punkte[best + 1]) / 2, p.y - 0.5, v.d.art, { groesse: 1.5, anker: 'middle', farbe })
  }
  return { rechts, unten }
}

// ---------- Potentialausgleich ----------

const PA_FARBE = '#2e9e3e'

/** Zeichnet Potentialausgleichsschienen und ihre Verbindungen (eigene Verkabelung, getrennt vom Strompfad).
 *  Gibt die unterste belegte y-Position zurück. */
function potentialausgleich(svg: Svg, a: Analyse, lagen: Map<Knoten, Lage>, o: PlanOptionen, allp: boolean, cx: Cx, frei: { x: number; y: number }, vw: Verweise): { unten: number; rechts: number } {
  const liste = o.pa ?? []
  if (!a.potential.length && !liste.length) return { unten: 0, rechts: 0 }
  const fa = o.farbig ? PA_FARBE : '#000'
  const nachId = new Map([...lagen.values()].map((l) => [l.n.k.id, l]))
  const stil = { farbe: fa, breite: 0.35 }
  let unten = 0
  let rechts = 0

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
    // Partner auf anderen Blättern
    const fern = verb.map((d) => ({ d, pid: d.von === id ? d.nach : d.von }))
      .filter(({ pid }) => !nachId.has(pid) && o.blatt?.ort.has(pid) && o.blatt.ort.get(pid)!.blatt !== o.blatt.nr)
      .map(({ d, pid }) => ({ d, id: pid, ...o.blatt!.ort.get(pid)! }))
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
    const fernX = fern.map((_, i) => Math.max(x0 + 4, ...xs.map((x) => x + 6)) + i * 6)
    const x1 = Math.max(x0 + 24, ...xs.map((x) => x + 6), ...fernX.map((x) => x + 4))
    fern.forEach((z, i) => {
      const fx = fernX[i]
      svg.linie(fx, y, fx, y + 5, stil)
      svg.pfad(`M ${fx} ${y + 7} L ${fx - 0.8} ${y + 5} L ${fx + 0.8} ${y + 5} Z`, { farbe: fa, fuellung: fa, breite: 0.1 })
      const nrP = (o.pa ?? []).indexOf(z.d)
      svg.text(fx + 1.6 * MITTE_SENKRECHT, y + 8, `${z.bmk}  ${vw.ziel(z.blatt, ANKER.pa(nrP), z.id)}`, { groesse: 1.6, farbe: fa, drehung: -90, anker: 'end' })
      vw.anker(ANKER.pa(nrP), fx, y + 7)
    })
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
    vw.orte.set(id, { x: (x0 + x1) / 2, y })
    // Beschriftung rechts der Schiene (ca. 0,95 mm je Zeichen bei 1,8 mm Schrift)
    const texte = [pas.k.name ?? 'Potentialausgleichsschiene', erder + (p.querschnitt ? `, ${p.querschnitt} mm²` : '')]
    rechts = Math.max(rechts, tx + Math.max(...texte.map((t) => t.length)) * 0.95)
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
  // Gegenstelle auf einem anderen Blatt: Stich mit Verweis
  for (const d of liste) {
    const la = nachId.get(d.von), lb = nachId.get(d.nach)
    if (!la === !lb) continue
    const fern = la ? d.nach : d.von
    const z = o.blatt?.ort.get(fern)
    if (!z || z.blatt === o.blatt!.nr || pasIds.has(fern)) continue
    const q = anschluss((la ?? lb)!)
    const y = q.p[1] + 6
    leitung(q, y, querschnitt(d))
    svg.pfad(`M ${q.x} ${y + 2} L ${q.x - 0.8} ${y} L ${q.x + 0.8} ${y} Z`, { farbe: fa, fuellung: fa, breite: 0.1 })
    const nrP = (o.pa ?? []).indexOf(d)
    svg.text(q.x + 1.2, y + 2, `${z.bmk}  ${vw.ziel(z.blatt, ANKER.pa(nrP), fern)}`, { groesse: 1.6, farbe: fa })
    vw.anker(ANKER.pa(nrP), q.x, y + 2)
    unten = Math.max(unten, y + 3)
    rechts = Math.max(rechts, q.x + 16)
  }
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
  return { unten, rechts }
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
    { titel: 'Kenndaten', wert: (n) => kurzText(n), hoch: true },
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
// Außenleiter als Schrägstrich (bei mehreren mit Anzahl), N mit Punkt, PE mit Querstrich.
// Jede Zuleitung trägt die Kennzeichnung, auch die von Geräten mit eigenen Abgängen.
function leiterZahl(svg: Svg, l: Lage, yQuelle: number | undefined, farbig: boolean) {
  const n = l.n
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

/** Schaltglied (Schließer). `voreilend`: Kontakt schließt vor den übrigen Kontakten des Geräts
 * (IEC 60617, Kennzeichnung durch einen kurzen Strich am beweglichen Kontakt in Schließrichtung). */
/** Kurzbeschriftung aus den Parametern, bei geschaltetem N mit Polzahl (z. B. „63A 4-polig voreilend“) */
function kurzText(n: Knoten): string {
  const kurz = n.def.kurz?.(n.k.params ?? {}) ?? ''
  if (!n.nGeschaltet) return kurz
  // eingestellte Polzahl des Geräts, auch wenn die Zuleitung nur einphasig ist
  return `${kurz} ${n.k.pole}-polig${n.voreilend ? ' voreilend' : ''}`.trim()
}

function schalter(svg: Svg, x: number, y0: number, y1: number, o: { kreuz?: boolean; kreis?: boolean; farbe?: string; dx?: number; voreilend?: boolean; schuetz?: boolean }) {
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
  // Schütz (IEC 60617 S00284): Halbkreis am festen Kontakt
  if (o.schuetz) svg.pfad(`M ${x - 0.8} ${ya - 0.8} A 0.8 0.8 0 0 0 ${x + 0.8} ${ya - 0.8}`, { farbe: fa, breite: 0.3 })
  if (o.voreilend) {
    // Strich an der Spitze des Schaltstücks, senkrecht dazu in Richtung fester Kontakt
    const ax = -dx, ay = ya + 0.6 - yb
    const len = Math.hypot(ax, ay)
    const ux = ax / len, uy = ay / len
    const px = -uy, py = ux // senkrecht, zeigt Richtung fester Kontakt (nach rechts)
    const tx = x - dx, ty = ya + 0.6
    svg.linie(tx, ty, tx + px * 1.4, ty + py * 1.4, { farbe: fa, breite: 0.3 })
  }
  return { mitteX: x - dx / 2, mitteY: (ya + yb) / 2 }
}

function sicherung(svg: Svg, x: number, y0: number, y1: number, fa = '#000') {
  svg.linie(x, y0, x, y1, { farbe: fa })
  svg.rechteck(x - 1.1, y0 + 3, 2.2, y1 - y0 - 6, { farbe: fa, fuellung: '#fff' })
  svg.linie(x, y0 + 3, x, y1 - 3, { farbe: fa })
}

/** Inhalt einer Gerätebox (Wechselrichter, Wallbox, ...) */
function boxInhalt(svg: Svg, art: SymbolArt, x0: number, y0: number, w: number, h: number, gespiegelt = false) {
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
    case 'fernwirk':
      t('FW', 2.2)
      break
    case 'messumformer':
      // Messumformer (Umformer allgemein): Diagonale, Eingang U/I, Ausgang Analogsignal
      svg.linie(x0, y0 + h, x0 + w, y0)
      svg.text(x0 + 0.8, y0 + 3, 'U,I', { groesse: 1.8 })
      svg.text(x0 + w - 0.8, y0 + h - 1, 'mA', { groesse: 1.8, anker: 'end' })
      break
    case 'spd': {
      // Überspannungsableiter (IEC 60617): Rechteck, vom Leiteranschluss ein Pfeil zur Erdseite,
      // gegenüber ein kurzer Stummel zum Erdanschluss. `gespiegelt`: Erde liegt oben.
      const iw = 3.2, ih = h - 3, it = y0 + 1.5, ib = it + ih
      const r = gespiegelt ? -1 : 1
      const oben = gespiegelt ? ib : it, unten = gespiegelt ? it : ib
      svg.rechteck(mx - iw / 2, it, iw, ih, { fuellung: '#fff' })
      const spitze = oben + r * ih * 0.5, basis = oben + r * ih * 0.22
      svg.linie(mx, oben, mx, basis)
      svg.pfad(`M ${mx - 0.75} ${basis} L ${mx + 0.75} ${basis} L ${mx} ${spitze} Z`, { fuellung: '#000', breite: 0.2 })
      svg.linie(mx, unten, mx, unten - r * ih * 0.15)
      break
    }
    case 'verbraucher':
    default:
      svg.linie(mx - 2, my - 1.5, mx + 2, my + 1.5)
      svg.linie(mx - 2, my + 1.5, mx + 2, my - 1.5)
  }
}

/** Schaltzeichen der Verbraucher nach DIN EN 60617 je Verwendung */
export function verbraucherArt(n: Knoten): 'steckdose' | 'leuchte' | 'herd' | 'backofen' | 'kuehl' | 'gefrier' | 'wasch' | 'trockner' | 'spuel' | 'motor' | 'reserve' | 'geraet' {
  const v = String(n.k.params?.verwendung ?? '').toLowerCase()
  if (v.startsWith('steckdose')) return 'steckdose'
  if (v.startsWith('beleuchtung') || v.startsWith('licht')) return 'leuchte'
  if (v.startsWith('heizung') || v.startsWith('herd') || v.startsWith('kochfeld')) return 'herd'
  if (v.startsWith('backofen')) return 'backofen'
  if (v.startsWith('kühl')) return 'kuehl'
  if (v.startsWith('gefrier')) return 'gefrier'
  if (v.startsWith('waschmaschine')) return 'wasch'
  if (v.startsWith('wäschetrockner') || v.startsWith('trockner')) return 'trockner'
  if (v.startsWith('spül')) return 'spuel'
  if (v.startsWith('motor')) return 'motor'
  if (v.startsWith('reserve')) return 'reserve'
  return 'geraet'
}

/**
 * Zeichnet das Verbraucher-Schaltzeichen unter dem Anschluss bei (x, y0); gibt die Unterkante
 * relativ zu y0 zurück. Ohne svg wird nur die Unterkante berechnet. `innen`: nur das Zeichen
 * im allpoligen Gerätekasten (ohne Zuleitung).
 */
function verbraucherZeichen(n: Knoten, svg?: Svg, x = 0, y0 = 0, innen = false): { unten: number } {
  const art = verbraucherArt(n)
  const zul = (bis: number) => { if (!innen) svg?.linie(x, y0, x, y0 + bis) }
  const kasten = (s = 8) => { const t = y0 + 3 + (innen ? 1.5 : 0); if (!innen) svg?.rechteck(x - s / 2, t, s, s); return t }
  switch (art) {
    case 'steckdose': {
      // Steckdose (S00473): Querstrich mit Halbkreis darunter
      const yb = y0 + (innen ? 5 : 6)
      zul(6)
      if (svg) {
        svg.linie(x - 3.5, yb, x + 3.5, yb)
        svg.pfad(`M ${x - 3} ${yb + 3} A 3 3 0 0 1 ${x + 3} ${yb + 3}`)
      }
      return { unten: 9 }
    }
    case 'leuchte': {
      // Leuchte, allgemein: Kreuz am Leitungsende
      const m = y0 + 7.5
      zul(7.5)
      svg?.linie(x - 2.5, m - 2.5, x + 2.5, m + 2.5)
      svg?.linie(x - 2.5, m + 2.5, x + 2.5, m - 2.5)
      return { unten: 10 }
    }
    case 'reserve': {
      // Reserve-Stromkreis: offenes Leitungsende ohne Verbraucher
      zul(5)
      return { unten: 6 }
    }
    case 'motor': {
      const m = y0 + 7
      zul(3)
      svg?.kreis(x, m, 4, { fuellung: '#fff' })
      svg?.text(x, m + 1.1, 'M', { groesse: 3.2, anker: 'middle', fett: true })
      return { unten: 11 }
    }
    default: {
      zul(3)
      const t = kasten()
      if (!svg) return { unten: 11 }
      const m = t + 4
      switch (art) {
        case 'herd':
          svg.punkt(x, m - 1.6, '#000', 1)
          svg.punkt(x - 1.7, m + 1.4, '#000', 1)
          svg.punkt(x + 1.7, m + 1.4, '#000', 1)
          break
        case 'backofen':
          svg.linie(x - 4, t + 2, x + 4, t + 2)
          svg.punkt(x, m + 1, '#000', 1)
          break
        case 'kuehl':
          svg.text(x, m + 2, '*', { groesse: 4, anker: 'middle' })
          break
        case 'gefrier':
          svg.text(x, m + 1.8, '***', { groesse: 3.2, anker: 'middle' })
          break
        case 'wasch':
          svg.kreis(x, m, 2.6)
          svg.punkt(x, m, '#000', 1.1)
          break
        case 'trockner':
          svg.kreis(x, m - 0.5, 2.4)
          svg.linie(x - 0.6, m + 1.4, x - 0.6, m - 2.2)
          svg.punkt(x, m + 3, '#000', 0.5)
          break
        case 'spuel':
          svg.linie(x - 4, t, x + 4, t + 8, { breite: 0.25 })
          svg.linie(x - 4, t + 8, x + 4, t, { breite: 0.25 })
          svg.kreis(x, m, 2.4, { fuellung: '#fff' })
          svg.punkt(x, m, '#000', 1)
          break
        default:
          // Elektrogerät, allgemein
          svg.text(x, m + 1.8, 'E', { groesse: 5, anker: 'middle', fett: true })
      }
      return { unten: 11 }
    }
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
      if (halbindirekt(n)) {
        wandlerZaehler(svg, n, [{ le: 'L1', x, farbe: '#000' }], y0, false)
        break
      }
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
    case 'schuetz': {
      const m = schalter(svg, x, y0, y1, { schuetz: true })
      if (n.k.params?.antrieb === 'Motor') motorAntrieb(svg, m.mitteX, m.mitteY)
      break
    }
    case 'wandler': {
      verbindung(y0, y1)
      stromwandler(svg, x, (y0 + y1) / 2, 2.2, y0 + 4, x + 4.5)
      if (n.leiter.filter(istPhase).length > 1) svg.text(x - 2.8, (y0 + y1) / 2 + 0.6, `${n.leiter.filter(istPhase).length}x`, { groesse: 1.6, anker: 'end' })
      break
    }
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
      if (art === 'verbraucher' && !l.aufwaerts) {
        verbraucherZeichen(n, svg, x, y0)
        break
      }
      const w = 10, h = 10, bt = y0 + 2
      if (art === 'verbraucher' && verbraucherArt(n) === 'reserve') {
        // Reserve, aufwärts gezeichnet: offenes Leitungsende statt Gerätekasten
        verbindung(bt + h - 5, y1)
        break
      }
      if (l.aufwaerts) verbindung(bt + h, y1)
      else verbindung(y0, bt)
      if (mitKindern) {
        if (l.aufwaerts) verbindung(y0, bt)
        else verbindung(bt + h, y1)
      }
      svg.rechteck(x - w / 2, bt, w, h)
      boxInhalt(svg, art, x - w / 2, bt, w, h, !!l.aufwaerts)
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
    if (art === 'verbraucher' && verbraucherArt(n) === 'reserve') {
      // Reserve: offene Leitungsenden ohne Gerätekasten
      for (const le of n.leiter) svg.linie(cx(l, le), auf ? bt + h - 5 : bt, cx(l, le), auf ? bt + h : bt + 5, { farbe: farbe(le) })
      return
    }
    if (n.kinder.length) for (const le of l.aus) svg.linie(cx(l, le, l.aus), auf ? y0 : bt + h, cx(l, le, l.aus), auf ? bt : y1, { farbe: farbe(le) })
    svg.rechteck(bx, bt, w, h)
    if (art === 'verbraucher') verbraucherZeichen(n, svg, l.x, bt - 3, true)
    else boxInhalt(svg, art, bx, bt, w, h, auf)
    if (art === 'spd' && !l.pa) {
      if (auf) { svg.linie(l.x, bt - 2, l.x, bt); erde(svg, l.x, bt - 2, '#000', true) }
      else { svg.linie(l.x, bt + h, l.x, bt + h + 2); erde(svg, l.x, bt + h + 2) }
    }
    return
  }

  const geschaltet = (le: LeiterName): boolean => {
    switch (art) {
      case 'trenner':
        return istPhase(le) || (le === 'N' && !!n.nGeschaltet)
      case 'hak': case 'sicherung': case 'ls': case 'sls': case 'schuetz':
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
    } else glieder.push(schalter(svg, xx, y0, y1, { farbe: fa, kreuz: art === 'ls' || art === 'sls', kreis: art === 'trenner', schuetz: art === 'schuetz', dx: 2, voreilend: le === 'N' && !!n.voreilend }))
  }

  if (art === 'wandler') {
    // je Außenleiter ein Wandler; Sekundärleitungen gesammelt nach rechts oben zum Anschluss
    const phasen = n.leiter.filter(istPhase)
    const ym = (y0 + y1) / 2
    const ya = y0 + 4
    phasen.forEach((le) => stromwandler(svg, cx(l, le), ym, 1.4, ya, undefined, farbe(le)))
    if (phasen.length) svg.linie(cx(l, phasen[0]) + 0.6, ya, xmax + 2.5, ya, { farbe: '#c2410c', breite: 0.25 })
  }
  if (art === 'schuetz' && n.k.params?.antrieb === 'Motor' && glieder.length) motorAntrieb(svg, glieder[0].mitteX, glieder[0].mitteY)
  if (art === 'zaehler' && halbindirekt(n)) {
    wandlerZaehler(svg, n, n.leiter.map((le) => ({ le, x: cx(l, le), farbe: farbe(le) })), y0, true)
    return
  }

  if (art === 'zaehler' && !halbindirekt(n)) {
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
  const rechts = (allp ? Math.max(...n.leiter.map((le) => cx(l, le))) + (n.def.durchgang ? 3.5 : 4.5) : l.x + (n.def.durchgang ? 5.5 : 6.5)) + textVersatz(n, allp)
  const kurz = kurzText(n)
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

// ---------- Mess- und Signalleitungen, Klemmleisten ----------

export interface Stil { farbe: string; strich?: string; breite: number }

/** Linienart je Leitungstyp: Daten/Steuerung strichpunktiert, Wandler-Messleitung durchgezogen,
 *  Messspannung lang gestrichelt, Analogsignal kurz gestrichelt */
const LEITUNGSSTIL: Record<Leitungstyp, { farbe: string; strich?: string }> = {
  daten: { farbe: '#8e24aa', strich: '1.6 0.6 0.3 0.6' },
  wandler: { farbe: '#c2410c' },
  spannung: { farbe: '#b45309', strich: '2.4 0.8' },
  analog: { farbe: '#0277bd', strich: '1 0.6' },
}

export function leitungsStil(typ: Leitungstyp | undefined, allp: boolean, farbig: boolean): Stil {
  const s = LEITUNGSSTIL[typ ?? 'daten'] ?? LEITUNGSSTIL.daten
  return { farbe: allp && !farbig ? '#000' : s.farbe, strich: s.strich, breite: 0.3 }
}

/** Verbindung zwischen zwei Geräten, ggf. über Klemmleisten geführt */
export interface Zug extends Datenverbindung {
  /** Klemmleisten in Reihenfolge von `von` nach `nach` */
  klemmen?: Knoten[]
}

/**
 * Fasst Verbindungen über Klemmleisten zusammen: A → X1, X1 → X2, X2 → B wird ein Zug A → B mit den
 * Klemmleisten X1, X2. Leitungstyp, Art und Kabel kommen aus den Abschnitten; die Anschlussklemmen
 * aus dem ersten bzw. letzten Abschnitt.
 */
export function zuege(daten: Datenverbindung[], a: Pick<Analyse, 'hilfs'>): Zug[] {
  const hilfs = new Map((a.hilfs ?? []).map((h) => [h.k.id, h]))
  if (!hilfs.size) return daten
  const benutzt = new Set<Datenverbindung>()
  const out: Zug[] = []
  for (const d of daten) {
    if (benutzt.has(d)) continue
    const vonH = hilfs.has(d.von), nachH = hilfs.has(d.nach)
    if (!vonH && !nachH) { out.push(d); continue }
    if (vonH && nachH) continue // Mittelstück, wird von einem Ende aus aufgesammelt
    // vom Geräteende aus durch die Klemmleisten laufen
    const start = vonH ? d.nach : d.von
    const teile: Datenverbindung[] = [d]
    const klemmen: Knoten[] = []
    benutzt.add(d)
    let akt = vonH ? d.von : d.nach
    let ende: string | undefined
    while (hilfs.has(akt) && !klemmen.includes(hilfs.get(akt)!)) {
      klemmen.push(hilfs.get(akt)!)
      const weiter = daten.find((e) => !benutzt.has(e) && (e.von === akt || e.nach === akt))
      if (!weiter) break
      benutzt.add(weiter)
      teile.push(weiter)
      akt = weiter.von === akt ? weiter.nach : weiter.von
      if (!hilfs.has(akt)) ende = akt
    }
    if (!ende) continue // Klemmleiste ohne Weiterführung: nichts zu zeichnen
    const erst = teile[0], letzt = teile[teile.length - 1]
    const z: Zug = { von: start, nach: ende, klemmen }
    const typ = teile.find((t) => t.typ && t.typ !== 'daten')?.typ
    if (typ) z.typ = typ
    const art = teile.find((t) => t.art)?.art
    if (art) z.art = art
    const kabel = [...new Set(teile.map((t) => t.kabel).filter(Boolean))].join(' / ')
    if (kabel) z.kabel = kabel
    const kv = erst.von === start ? erst.klemmeVon : erst.klemmeNach
    const kn = letzt.nach === ende ? letzt.klemmeNach : letzt.klemmeVon
    if (kv) z.klemmeVon = kv
    if (kn) z.klemmeNach = kn
    out.push(z)
  }
  return out
}

/** Länge der Klemmenangabe am Ende `l` einer Verbindung (Platzbedarf am senkrechten Abgang) */
function klemmenLaenge(d: Datenverbindung, l: Lage): number {
  const t = klemmenText(l.n.k.id === d.von ? d.klemmeVon : d.nach === l.n.k.id ? d.klemmeNach : undefined, parameter(l.n))
  return t ? t.length * 0.75 + 1.5 : 0
}

/** Parameter einer Komponente einschließlich der Standardwerte ihres Typs */
function parameter(n: Knoten) {
  return { ...standardParams(n.k.typ), ...(n.k.params ?? {}) }
}

/** Lage einer Klemmleiste: auf dem ersten ausreichend langen waagerechten Abschnitt vom Ende aus */
function klemmPos(pkt: number[][], vomEnde: boolean, L: number): number | undefined {
  const p = vomEnde ? [...pkt].reverse() : pkt
  const erst = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1])
  // langer erster Abschnitt (z. B. Abgang mit Klemmenangabe): kurz vor dessen Ende, nahe am Gerät
  if (erst >= 10) return vomEnde ? L - (erst - 5.5) : erst - 5.5
  let s = 0
  for (let i = 1; i < p.length; i++) {
    const len = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
    if (Math.abs(p[i][1] - p[i - 1][1]) < 0.01 && len >= 5) {
      const t = s + Math.min(6, len / 2)
      return vomEnde ? L - t : t
    }
    s += len
  }
  return undefined
}

/** Lage der in diesem Plan gezeichneten Klemmleisten (für Einbauort-Rahmen) */
let klemmOrte: { n: Knoten; x0: number; y0: number; x1: number; y1: number }[] = []

/** Punkt im Abstand s entlang eines Linienzugs; `senk`: Abschnitt verläuft senkrecht */
function aufPfad(pkt: number[][], s: number): { x: number; y: number; senk: boolean } {
  let rest = s
  for (let i = 1; i < pkt.length; i++) {
    const [x0, y0] = pkt[i - 1], [x1, y1] = pkt[i]
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (rest <= len || i === pkt.length - 1) {
      const t = len ? Math.min(1, rest / len) : 0
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, senk: Math.abs(x1 - x0) < Math.abs(y1 - y0) }
    }
    rest -= len
  }
  return { x: pkt[0][0], y: pkt[0][1], senk: true }
}

function pfadLaenge(pkt: number[][]): number {
  let l = 0
  for (let i = 1; i < pkt.length; i++) l += Math.hypot(pkt[i][0] - pkt[i - 1][0], pkt[i][1] - pkt[i - 1][1])
  return l
}

/** Zeichnet eine Mess-/Signalleitung (Punkte von `von` nach `nach`) mit Anschlussklemmen,
 *  Klemmleisten und Kabelangabe */
function zeichneZug(svg: Svg, pkt: number[][], d: Zug, st: Stil, lv?: Lage, ln?: Lage) {
  const farbe = st.farbe
  svg.pfad('M ' + pkt.map((pp) => `${pp[0].toFixed(2)} ${pp[1].toFixed(2)}`).join(' L '), { farbe, breite: st.breite, strich: st.strich })
  for (const e of [pkt[0], pkt[pkt.length - 1]]) svg.kreis(e[0], e[1], 0.45, { farbe, fuellung: farbe, breite: 0.1 })
  // Anschlussklemmen am Gerät
  const klemme = (p: number[], q: number[], text: string) => {
    if (!text) return
    const senk = Math.abs(q[0] - p[0]) < Math.abs(q[1] - p[1])
    // senkrecht: Angabe rechts neben der Leitung, vom Gerät weg laufend
    if (senk) { const ab = q[1] > p[1]; svg.text(p[0] + 1.5, p[1] + (ab ? 0.8 : -0.8), text, { groesse: 1.4, farbe, drehung: -90, anker: ab ? 'end' : 'start' }) }
    else {
      const r = Math.sign(q[0] - p[0] || 1)
      svg.text(p[0] + r * 0.9, p[1] - 0.6, text, { groesse: 1.4, farbe, anker: r > 0 ? 'start' : 'end' })
    }
  }
  if (pkt.length > 1) {
    klemme(pkt[0], pkt[1], klemmenText(d.klemmeVon, lv && parameter(lv.n)))
    klemme(pkt[pkt.length - 1], pkt[pkt.length - 2], klemmenText(d.klemmeNach, ln && parameter(ln.n)))
  }
  const L = pfadLaenge(pkt)
  const kl = d.klemmen ?? []
  const rand = Math.min(10, L * 0.2)
  const pos = kl.length === 1 ? [L / 2] : kl.map((_, i) => rand + (i * (L - 2 * rand)) / Math.max(1, kl.length - 1))
  if (kl.length >= 2) {
    // erste und letzte Klemmleiste nahe an ihren Geräten, möglichst auf waagerechten Abschnitten
    const a = klemmPos(pkt, false, L), b = klemmPos(pkt, true, L)
    if (a !== undefined && b !== undefined && a < b - 10) { pos[0] = a; pos[pos.length - 1] = b }
  }
  kl.forEach((n, i) => {
    const p = aufPfad(pkt, pos[i])
    const w = p.senk ? 3.4 : 1.8, h = p.senk ? 1.8 : 3.4
    svg.rechteck(p.x - w / 2, p.y - h / 2, w, h, { farbe: '#000', fuellung: '#fff', breite: 0.3 })
    const art = String(n.k.params?.art ?? '')
    if (art === 'Prüfklemmleiste' || art === 'Trennklemmen') {
      // Trennstelle: zwei Klemmpunkte mit Schrägstrich
      const dx = p.senk ? 0 : 0.5, dy = p.senk ? 0.5 : 0
      svg.kreis(p.x - dx, p.y - dy, 0.35, { farbe, fuellung: '#fff', breite: 0.2 })
      svg.kreis(p.x + dx, p.y + dy, 0.35, { farbe, fuellung: '#fff', breite: 0.2 })
      svg.linie(p.x - 0.9, p.y + 0.9, p.x + 0.9, p.y - 0.9, { breite: 0.2 })
    } else svg.kreis(p.x, p.y, 0.45, { farbe, fuellung: '#fff', breite: 0.2 })
    const kurz = n.def.kurz?.(n.k.params ?? {}) ?? ''
    // Belegung zu je vier Klemmen je Zeile
    const belListe = String(n.k.params?.belegung ?? '').split(',').map((t) => t.trim()).filter(Boolean)
    const belZeilen = Array.from({ length: Math.ceil(belListe.length / 4) }, (_, i) => belListe.slice(i * 4, i * 4 + 4).join(' '))
    const bel = belZeilen[0] ?? ''
    // senkrecht: Beschriftung links der Leitung (rechts liegen meist weitere Abgänge des Geräts)
    // senkrecht: links neben der Klemmleiste; waagerecht: darüber, links beginnend
    const tx = p.senk ? p.x - 2.4 : p.x + 1.2
    const ty = p.senk ? p.y - 0.2 : p.y - 1.4 - (belZeilen.length ? 3.7 + (belZeilen.length - 1) * 1.5 : 2)
    const anker = 'end'
    svg.text(tx, ty, n.bmk, { groesse: 1.9, fett: true, anker })
    svg.text(tx, ty + 2, kurz, { groesse: 1.4, anker })
    belZeilen.forEach((z, i) => svg.text(tx, ty + 3.7 + i * 1.5, z, { groesse: 1.2, farbe: '#444', anker }))
    const breiteT = Math.max(n.bmk.length * 1.2, kurz.length * 0.72, ...belZeilen.map((z) => z.length * 0.6))
    const unten = ty + (bel ? 4 + (belZeilen.length - 1) * 1.5 : 2.5)
    klemmOrte.push({ n, x0: tx - breiteT, y0: Math.min(p.y - h / 2, ty - 2), x1: p.x + w / 2, y1: Math.max(p.y + h / 2, unten) })
  })
  // Kabelangabe in der Mitte zwischen den Klemmleisten (sonst in der Mitte der Leitung)
  // Art der Leitung steht mit an der Kabelangabe
  const kabelText = d.kabel ? (d.art ? `${d.art}  ${d.kabel}` : d.kabel) : ''
  if (kabelText && L > 0) {
    const von = kl.length >= 2 ? pos[0] : 0, bis = kl.length >= 2 ? pos[pos.length - 1] : L
    // bevorzugt mittig auf dem längsten waagerechten Abschnitt zwischen den Klemmleisten
    let m = kl.length >= 2 ? (von + bis) / 2 : kl.length === 1 ? (pos[0] + L) / 2 : L / 2
    let s0 = 0, best = 0
    for (let i = 1; i < pkt.length; i++) {
      const len = Math.hypot(pkt[i][0] - pkt[i - 1][0], pkt[i][1] - pkt[i - 1][1])
      const a0 = Math.max(s0, von + 3), a1 = Math.min(s0 + len, bis - 3)
      if (Math.abs(pkt[i][1] - pkt[i - 1][1]) < 0.01 && a1 - a0 > best && a1 - a0 > kabelText.length * 0.8) { best = a1 - a0; m = (a0 + a1) / 2 }
      s0 += len
    }
    const p = aufPfad(pkt, m)
    if (p.senk) svg.text(p.x - 0.8, p.y, kabelText, { groesse: 1.5, farbe, drehung: -90, anker: 'middle' })
    else svg.text(p.x, p.y - 0.8, kabelText, { groesse: 1.5, farbe, anker: 'middle' })
  }
}

/** Wandlerzähler (halbindirekte Messung): Hauptleiter laufen durch, Zähler daneben */
function halbindirekt(n: Knoten): boolean {
  return n.def.symbol === 'zaehler' && n.k.params?.messart === 'halbindirekt'
}

/** Lage des Zählerkastens beim Wandlerzähler relativ zum (rechtesten) Hauptleiter */
const ZAEHLER_SEITE = { links: (allp: boolean) => (allp ? 3.5 : 3), rechts: (allp: boolean) => (allp ? 15.5 : 12) }

/** Zusätzlicher Abstand der Beschriftung rechts vom Gerät (Wandlerzähler steht neben den Leitern) */
function textVersatz(n: Knoten, allp: boolean): number {
  return halbindirekt(n) ? ZAEHLER_SEITE.rechts(allp) - (allp ? 2 : 4) : 0
}

/** Wandlerzähler: Kasten rechts neben den Hauptleitern, Spannungspfad von den Leitern abgegriffen
 *  (mit Absicherung, wenn angegeben); der Strompfad kommt über die Wandler-Messleitung */
function wandlerZaehler(svg: Svg, n: Knoten, xs: { le: LeiterName; x: number; farbe: string }[], y0: number, allp: boolean) {
  const xmax = Math.max(...xs.map((p) => p.x))
  const a = xmax + ZAEHLER_SEITE.links(allp), b = xmax + ZAEHLER_SEITE.rechts(allp)
  svg.rechteck(a, y0 + 2.5, b - a, 9, { fuellung: '#fff' })
  svg.text((a + b) / 2, y0 + 7.4, 'kWh', { groesse: 2.3, anker: 'middle', fett: true })
  svg.text((a + b) / 2, y0 + 10.3, n.k.params?.art === 'Zweirichtung' ? '<> Wandler' : 'Wandler', { groesse: 1.4, anker: 'middle' })
  const abgesichert = !!n.k.params?.spannungspfad
  const abgriffe = xs.filter((p) => p.le !== 'PE')
  abgriffe.forEach((p, i) => {
    const y = y0 + (allp ? 3.6 + i * 1.7 : 5)
    svg.linie(p.x, y, a, y, { farbe: p.farbe, breite: 0.25 })
    svg.punkt(p.x, y, p.farbe, 0.4)
    if (abgesichert && p.le !== 'N') {
      const fx = allp ? xmax + 0.6 : p.x + 0.7
      const fw = a - fx - 0.4
      svg.rechteck(fx, y - 0.4, fw, 0.8, { farbe: p.farbe, fuellung: '#fff', breite: 0.2 })
    }
  })
  if (abgesichert) svg.text(a, y0 + 1.8, `U-Pfad: ${n.k.params!.spannungspfad}`, { groesse: 1.3, farbe: '#444' })
}

/** Stromwandler (IEC 60617 S00841): Kreis um den Leiter, Sekundäranschluss nach rechts oben */
function stromwandler(svg: Svg, x: number, ym: number, r: number, yAnschluss: number, xAnschluss?: number, fa = '#000') {
  svg.kreis(x, ym, r, { farbe: fa, fuellung: 'none', breite: 0.35 })
  const sek = '#c2410c'
  if (xAnschluss !== undefined) {
    // einpolig: Sekundärkreis als kurzer Abgang zur Anschlussstelle
    svg.pfad(`M ${x + r * 0.7} ${ym - r * 0.7} L ${x + r * 0.7 + 1} ${yAnschluss} H ${xAnschluss}`, { farbe: sek, breite: 0.25 })
  } else svg.linie(x + r * 0.45, ym - r * 0.9, x + 0.6, yAnschluss, { farbe: sek, breite: 0.25 })
}

/** Motorantrieb eines Schaltgeräts: Kästchen mit M links, Wirkverbindung gestrichelt zum Schaltstück */
function motorAntrieb(svg: Svg, mx: number, my: number) {
  const bx = mx - 7
  svg.linie(bx + 1.5, my, mx, my, { strich: '0.8 0.6', breite: 0.25 })
  svg.rechteck(bx - 1.5, my - 1.5, 3, 3, { fuellung: '#fff', breite: 0.3 })
  svg.text(bx, my + 0.8, 'M', { groesse: 2, anker: 'middle', fett: true })
}
