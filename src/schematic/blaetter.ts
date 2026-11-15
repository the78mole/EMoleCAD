import type { Analyse, Knoten } from '../model/analyse'
import { einspeiseKette, hatZaehler, zeichnePlan, type BlattBezug, type Plan, type PlanOptionen } from './render'

interface Teil {
  wurzeln: Knoten[]
  potential: Knoten[]
  /** Teilbäume, die auf eigene Blätter ausgelagert werden */
  ab: Knoten[]
  /** Speisende Komponente auf einem anderen Blatt */
  zu?: Knoten
  /** Wurzel dieses Teils (bei ausgelagerten Teilen) */
  start?: Knoten
}

/** Weitere Zählerstränge, die aus der Einspeisekette (vor dem Hauptzähler) abzweigen */
function weitereZaehlerstraenge(w: Knoten): Knoten[] {
  const kette = einspeiseKette(w)
  const inKette = new Set(kette)
  return kette.slice(0, -1).flatMap((k) => k.kinder.filter((c) => !inKette.has(c) && hatZaehler(c)))
}

/** Teilansicht der Analyse: kopiert die Knoten, ausgelagerte Teilbäume bleiben als kinderlose Verweise stehen */
function sicht(a: Analyse, t: Teil): Analyse {
  const knoten = new Map<string, Knoten>()
  const ab = new Set(t.ab)
  const kopie = (n: Knoten, eltern: Knoten | undefined, tiefe: number): Knoten => {
    const c: Knoten = { ...n, eltern, tiefe, kinder: [] }
    knoten.set(n.k.id, c)
    if (!ab.has(n)) c.kinder = n.kinder.map((k) => kopie(k, c, tiefe + 1))
    return c
  }
  const wurzeln = t.wurzeln.map((w) => kopie(w, undefined, 0))
  const potential = t.potential.map((p) => { const c: Knoten = { ...p, eltern: undefined, kinder: [] }; knoten.set(p.k.id, c); return c })
  return { ...a, wurzeln, potential, knoten, meldungen: [] }
}

/**
 * Teilt den Plan auf Blätter auf: Weitere Zählerstränge (z.B. separater Zähler für steuerbare
 * Verbraucher nach § 14a EnWG, Modul 2) kommen jeweils auf ein eigenes Blatt. Der ungezählte
 * Bereich (SPD, SMGW, Steuerbox) bleibt auf dem ersten Blatt beisammen.
 */
export function blattTeilung(a: Analyse, o: Pick<PlanOptionen, 'anordnung'>, startNr = 1): { sicht: Analyse; bezug?: BlattBezug }[] {
  if ((o.anordnung ?? 'hager') !== 'hager') return [{ sicht: a }]
  const teile: Teil[] = [{ wurzeln: a.wurzeln, potential: a.potential, ab: [] }]
  for (let i = 0; i < teile.length; i++) {
    const t = teile[i]
    const haupt = t.start ?? t.wurzeln.find((w) => w.def.wurzel)
    t.ab = haupt ? weitereZaehlerstraenge(haupt) : []
    for (const n of t.ab) teile.push({ wurzeln: [n], potential: [], ab: [], zu: n.eltern, start: n })
  }
  if (teile.length === 1) return [{ sicht: a }]
  const ort = new Map<string, { blatt: number; bmk: string }>()
  teile.forEach((t, i) => {
    const ab = new Set(t.ab)
    const markiere = (n: Knoten) => {
      if (ab.has(n)) return
      ort.set(n.k.id, { blatt: startNr + i, bmk: n.bmk })
      n.kinder.forEach(markiere)
    }
    t.wurzeln.forEach(markiere)
    t.potential.forEach((p) => ort.set(p.k.id, { blatt: startNr + i, bmk: p.bmk }))
  })
  return teile.map((t, i) => {
    const s = t.start
    const zufuehrung = t.zu && s ? { bmk: t.zu.bmk, blatt: ort.get(t.zu.k.id)!.blatt, leiter: s.dc ? 'DC' : s.pole === 3 ? '3/N/PE' : `${s.phase}/N/PE` } : undefined
    return { sicht: sicht(a, t), bezug: { nr: startNr + i, ort, zufuehrung } }
  })
}

/** Zeichnet alle Blätter eines Plans (ein Blatt je Zählerstrang) */
export function zeichnePlaene(a: Analyse, o: PlanOptionen, startNr = 1): Plan[] {
  return blattTeilung(a, o, startNr).map((b) => zeichnePlan(b.sicht, { ...o, blatt: b.bezug }))
}
