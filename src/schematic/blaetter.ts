import type { Analyse, Knoten } from '../model/analyse'
import { planquadrat, type Vorlage } from './blatt'
import { einspeiseKette, hatZaehler, VERWEIS_MUSTER, zeichnePlan, type BlattBezug, type Plan, type PlanOptionen } from './render'

interface Teil {
  wurzeln: Knoten[]
  potential: Knoten[]
  /** Speisende Komponente auf einem anderen Blatt */
  zu?: Knoten
  /** Wurzel dieses Teils (bei ausgelagerten Zählersträngen) */
  start?: Knoten
  /** Folgeblatt: nur diese Abgänge von `zu` stehen auf dem Blatt; `zu` selbst wird nur als
   *  Fortsetzung (Zuführung von seinem Blatt) gezeichnet */
  nur?: Knoten[]
}

/** Weitere Zählerstränge, die aus der Einspeisekette (vor dem Hauptzähler) abzweigen */
function weitereZaehlerstraenge(w: Knoten): Knoten[] {
  const kette = einspeiseKette(w)
  const inKette = new Set(kette)
  // nur Abzweige vor dem Hauptzähler; Unterzähler hinter ihm bleiben im Verteilerbaum
  const zaehler = kette.findIndex((k) => k.k.typ === 'zaehler')
  const vor = zaehler >= 0 ? kette.slice(0, zaehler) : kette.slice(0, -1)
  return vor.flatMap((k) => k.kinder.filter((c) => !inKette.has(c) && hatZaehler(c)))
}

/** Anzahl der Endstromkreise (Spalten) eines Teilbaums */
function endstromkreise(n: Knoten): number {
  return n.kinder.length ? n.kinder.reduce((s, c) => s + endstromkreise(c), 0) : 1
}

/**
 * Teilansicht der Analyse: kopiert die Knoten des Teils. Abgänge, die auf anderen Blättern
 * stehen, bleiben als kinderlose Verweise stehen – je Zielblatt und speisender Komponente einer.
 */
function sicht(a: Analyse, t: Teil, teilVon: Map<Knoten, Teil>): { sicht: Analyse; gruppen: Map<string, Knoten[]> } {
  const knoten = new Map<string, Knoten>()
  const gruppen = new Map<string, Knoten[]>()
  const kopie = (n: Knoten, eltern: Knoten | undefined, tiefe: number, kinder = n.kinder): Knoten => {
    const c: Knoten = { ...n, eltern, tiefe, kinder: [] }
    knoten.set(n.k.id, c)
    const ziele = new Map<Teil, Knoten[]>()
    for (const k of kinder) {
      const ziel = teilVon.get(k)
      if (!ziel || ziel === t) { c.kinder.push(kopie(k, c, tiefe + 1)); continue }
      const g = ziele.get(ziel)
      if (g) { g.push(k); continue }
      ziele.set(ziel, [k])
      const v: Knoten = { ...k, eltern: c, tiefe: tiefe + 1, kinder: [] }
      knoten.set(k.k.id, v)
      gruppen.set(k.k.id, ziele.get(ziel)!)
      c.kinder.push(v)
    }
    return c
  }
  const wurzeln = t.nur ? [kopie(t.zu!, undefined, 0, t.nur)] : t.wurzeln.map((w) => kopie(w, undefined, 0))
  const potential = t.potential.map((p) => { const c: Knoten = { ...p, eltern: undefined, kinder: [] }; knoten.set(p.k.id, c); return c })
  return { sicht: { ...a, wurzeln, potential, knoten, meldungen: [] }, gruppen }
}

/**
 * Bricht die Abgänge eines Blatts auf Folgeblätter um, sobald mehr als `max` Endstromkreise
 * darauf stünden. Umgebrochen wird an ganzen Teilbäumen (üblicherweise ein FI mit seinen
 * Stromkreisen); passt ein Teilbaum allein nicht auf ein Blatt, wird innerhalb davon
 * umgebrochen. Gibt die Folgeblätter zurück.
 */
function umbrechen(t: Teil, kopf: Knoten, fest: number, max: number, teilVon: Map<Knoten, Teil>): Teil[] {
  const folge: Teil[] = []
  let akt = t
  let anzahl = fest
  let rest = endstromkreise(kopf)
  /** Blatt, auf dem eine Komponente mit Abgängen steht */
  const blattVon = new Map<Knoten, Teil>([[kopf, t]])
  const neu = (p: Knoten) => {
    akt = { wurzeln: [], potential: [], zu: p, nur: [] }
    folge.push(akt)
    anzahl = 0
  }
  /** Setzt Abgang u (von p gespeist) auf das aktuelle Blatt */
  const setze = (u: Knoten, p: Knoten) => {
    if (blattVon.get(p) !== akt) {
      if (!(akt.nur && akt.zu === p)) neu(p)
      akt.nur!.push(u)
      teilVon.set(u, akt)
    }
    blattVon.set(u, akt)
  }
  const verteile = (liste: Knoten[], p: Knoten) => {
    for (const u of liste) {
      const c = endstromkreise(u)
      // Platz für den Verweis auf das Folgeblatt freihalten, falls danach noch etwas kommt
      const passt = anzahl + c + (rest - c > 0 ? 1 : 0) <= max
      if (passt) {
        setze(u, p)
        anzahl += c
        rest -= c
      } else if (c > max && u.kinder.length) {
        // Teilbaum ist für ein Blatt zu groß: Kopf hierher, Abgänge verteilen
        if (anzahl > 0 && anzahl + 2 > max) neu(p)
        setze(u, p)
        verteile(u.kinder, u)
      } else {
        const frisch = anzahl === 0 && (akt.nur ? akt.zu === p : blattVon.get(p) === akt)
        if (!frisch) neu(p)
        setze(u, p)
        anzahl += c
        rest -= c
      }
    }
  }
  verteile(kopf.kinder, kopf)
  return folge
}

/**
 * Teilt den Plan auf Blätter auf:
 * - Weitere Zählerstränge (z.B. separater Zähler für steuerbare Verbraucher nach § 14a EnWG,
 *   Modul 2) kommen jeweils auf ein eigenes Blatt. Der ungezählte Bereich (SPD, SMGW,
 *   Steuerbox) bleibt auf dem ersten Blatt beisammen.
 * - Mit `maxAbgaenge` werden die Abgänge eines Blatts auf Folgeblätter umgebrochen.
 */
export function blattTeilung(a: Analyse, o: Pick<PlanOptionen, 'anordnung' | 'maxAbgaenge'>, startNr = 1): { sicht: Analyse; bezug?: BlattBezug }[] {
  if ((o.anordnung ?? 'hager') !== 'hager') return [{ sicht: a }]
  const teilVon = new Map<Knoten, Teil>()
  const basis: Teil[] = [{ wurzeln: a.wurzeln, potential: a.potential }]
  for (let i = 0; i < basis.length; i++) {
    const t = basis[i]
    const haupt = t.start ?? t.wurzeln.find((w) => w.def.wurzel)
    for (const n of haupt ? weitereZaehlerstraenge(haupt) : []) {
      const s: Teil = { wurzeln: [n], potential: [], zu: n.eltern, start: n }
      teilVon.set(n, s)
      basis.push(s)
    }
  }
  const max = o.maxAbgaenge ?? 0
  const teile: Teil[] = []
  for (const t of basis) {
    teile.push(t)
    const haupt = t.start ?? t.wurzeln.find((w) => w.def.wurzel)
    if (max <= 0 || !haupt) continue
    const kette = einspeiseKette(haupt)
    const kopf = kette[kette.length - 1]
    if (!kopf.kinder.length) continue
    // Spalten außerhalb des Verteilerbaums: ungezählter Bereich, Abzweige, Verweise, lose Teile
    const inKette = new Set(kette)
    const gesehen = new Set<Teil>()
    const fest = (n: Knoten): number => {
      if (n === kopf) return 0
      const ziel = teilVon.get(n)
      if (ziel && ziel !== t) { if (gesehen.has(ziel)) return 0; gesehen.add(ziel); return 1 }
      if (!n.kinder.length) return inKette.has(n) ? 0 : 1
      return n.kinder.reduce((s, c) => s + fest(c), 0)
    }
    const festAnzahl = t.wurzeln.reduce((s, w) => s + fest(w), 0)
    teile.push(...umbrechen(t, kopf, festAnzahl, max, teilVon))
  }
  if (teile.length === 1) return [{ sicht: a }]

  const nr = new Map(teile.map((t, i) => [t, startNr + i]))
  const ort = new Map<string, { blatt: number; bmk: string }>()
  for (const t of teile) {
    const blatt = nr.get(t)!
    const markiere = (n: Knoten) => {
      ort.set(n.k.id, { blatt, bmk: n.bmk })
      n.kinder.forEach((c) => { const z = teilVon.get(c); if (!z || z === t) markiere(c) })
    }
    ;(t.nur ?? t.wurzeln).forEach(markiere)
    t.potential.forEach((p) => ort.set(p.k.id, { blatt, bmk: p.bmk }))
  }
  return teile.map((t) => {
    const s = t.start ?? t.zu
    const leiter = (k: Knoten) => (k.dc ? 'DC' : k.pole === 3 ? '3/N/PE' : `${k.phase}/N/PE`)
    const zufuehrung = t.zu && s ? { id: t.zu.k.id, bmk: t.zu.bmk, blatt: ort.get(t.zu.k.id)!.blatt, leiter: t.nur?.some((c) => c.dc) ? 'DC' : leiter(s) } : undefined
    const { sicht: v, gruppen } = sicht(a, t, teilVon)
    const verweis = new Map<string, string>()
    for (const [id, g] of gruppen) {
      verweis.set(id, g.length > 1 ? `${g[0].bmk} ... ${g[g.length - 1].bmk}` : g[0].bmk)
    }
    return { sicht: v, bezug: { nr: nr.get(t)!, ort, zufuehrung, verweis, fortsetzung: t.nur ? t.zu!.k.id : undefined } }
  })
}

/**
 * Zeichnet alle Blätter eines Plans (Zählerstränge und Folgeblätter). Querverweise erhalten die
 * Blattangabe „S.<Blatt>-<Planquadrat>“ des Ziels (z.B. „S.3-B1“); ohne Vorlage bzw. bei einer
 * Vorlage ohne Rahmen nur „S.<Blatt>“.
 */
export function zeichnePlaene(a: Analyse, o: PlanOptionen, startNr = 1, vorlage?: Vorlage): Plan[] {
  const teile = blattTeilung(a, o, startNr)
  const plaene = teile.map((b) => zeichnePlan(b.sicht, { ...o, blatt: b.bezug, verweisPlatzhalter: true }))
  const nachNr = new Map(teile.map((b, i) => [b.bezug?.nr ?? startNr + i, plaene[i]]))
  return plaene.map((p, i) => {
    const ort = teile[i].bezug?.ort
    const inhalt = p.inhalt.replace(VERWEIS_MUSTER, (_, k: string) => {
      const id = p.verweise![Number(k)]
      const z = ort?.get(id)
      if (!z) return ''
      const ziel = nachNr.get(z.blatt)
      const pos = ziel?.orte?.get(id)
      const pq = pos && vorlage ? planquadrat(ziel!, o.modus, vorlage, pos.x, pos.y) : undefined
      return `S.${z.blatt}${pq ? '-' + pq : ''}`
    })
    return { ...p, inhalt }
  })
}
