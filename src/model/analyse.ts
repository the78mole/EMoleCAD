import { typDef, type TypDef } from './library'
import type { Komponente, Phase, Projekt } from './types'

export type LeiterName = 'L1' | 'L2' | 'L3' | 'N' | 'PE' | 'L+' | 'L-'

export interface Knoten {
  k: Komponente
  def: TypDef
  eltern?: Knoten
  kinder: Knoten[]
  /** Leiter auf der Zuleitung dieser Komponente */
  leiter: LeiterName[]
  pole: 1 | 3
  /** N wird mitgeschaltet (2-/4-poliges Schaltgerät) */
  nGeschaltet?: boolean
  /** N-Kontakt voreilend */
  voreilend?: boolean
  phase?: Phase
  dc: boolean
  tiefe: number
  bmk: string
}

export interface Meldung {
  stufe: 'fehler' | 'warnung' | 'info'
  text: string
  id?: string
}

export interface Analyse {
  wurzeln: Knoten[]
  /** Potentialausgleichsschienen (nicht Teil des Strompfads) */
  potential: Knoten[]
  /** Hilfsbetriebsmittel ohne Strompfad (Klemmleisten), liegen im Verlauf ihrer Verbindungen */
  hilfs: Knoten[]
  knoten: Map<string, Knoten>
  meldungen: Meldung[]
  phasenlast: Record<Phase, number>
}

export const ALLE_AC: LeiterName[] = ['L1', 'L2', 'L3', 'N', 'PE']

export function bmkVon(id: string): string {
  return /^[-=+]/.test(id) ? id : `-${id}`
}

export function analysiere(p: Projekt): Analyse {
  const meldungen: Meldung[] = []
  const knoten = new Map<string, Knoten>()

  for (const k of p.komponenten) {
    if (knoten.has(k.id)) {
      meldungen.push({ stufe: 'fehler', text: `Doppelte ID "${k.id}"`, id: k.id })
      continue
    }
    const def = typDef(k.typ)
    if (!def.params.length && def.label.startsWith('Unbekannt')) meldungen.push({ stufe: 'warnung', text: `Unbekannter Typ "${k.typ}"`, id: k.id })
    knoten.set(k.id, { k, def, kinder: [], leiter: [], pole: 3, dc: false, tiefe: 0, bmk: bmkVon(k.id) })
  }

  const wurzeln: Knoten[] = []
  const potential: Knoten[] = []
  const hilfs: Knoten[] = []
  for (const n of knoten.values()) {
    const q = n.k.quelle
    if (n.def.hilfs) {
      hilfs.push(n)
      n.pole = 1
      if (q) meldungen.push({ stufe: 'warnung', text: `${n.bmk}: eine ${n.def.label} hat keine Quelle; sie liegt im Verlauf ihrer Verbindungen`, id: n.k.id })
      continue
    }
    if (n.def.potential) {
      potential.push(n)
      n.leiter = ['PE']
      n.pole = 1
      if (q) meldungen.push({ stufe: 'warnung', text: `${n.bmk}: eine ${n.def.label} hat keine Quelle; Anschluss über Potentialausgleich`, id: n.k.id })
      continue
    }
    if (!q) {
      wurzeln.push(n)
      if (!n.def.wurzel) meldungen.push({ stufe: 'warnung', text: `${n.bmk} hat keine Quelle (nicht angeschlossen)`, id: n.k.id })
      continue
    }
    const e = knoten.get(q)
    if (!e) {
      meldungen.push({ stufe: 'fehler', text: `${n.bmk}: Quelle "${q}" existiert nicht`, id: n.k.id })
      wurzeln.push(n)
      continue
    }
    if (e.def.potential) {
      meldungen.push({ stufe: 'fehler', text: `${n.bmk}: ${e.bmk} ist eine ${e.def.label} und kann keine Quelle sein`, id: n.k.id })
      wurzeln.push(n)
      continue
    }
    if (n.def.wurzel) meldungen.push({ stufe: 'warnung', text: `${n.bmk}: ein Hausanschluss sollte keine Quelle haben`, id: n.k.id })
    n.eltern = e
    e.kinder.push(n)
  }

  // Reihenfolge der Abgänge wie im grafischen Editor (links nach rechts), sonst Listenreihenfolge
  const pos = p.editor ?? {}
  const sortiere = (liste: Knoten[]) => {
    if (liste.length > 1 && liste.every((n) => pos[n.k.id])) liste.sort((a, b) => pos[a.k.id].x - pos[b.k.id].x || pos[a.k.id].y - pos[b.k.id].y)
  }
  for (const n of knoten.values()) sortiere(n.kinder)
  sortiere(wurzeln)

  // Zyklen erkennen: Knoten, die von keiner Wurzel erreichbar sind
  const erreicht = new Set<Knoten>()
  const besuche = (n: Knoten, tiefe: number) => {
    if (erreicht.has(n)) return
    erreicht.add(n)
    n.tiefe = tiefe
    n.kinder.forEach((c) => besuche(c, tiefe + 1))
  }
  wurzeln.forEach((w) => besuche(w, 0))
  for (const n of knoten.values()) {
    if (!erreicht.has(n) && !n.def.potential && !n.def.hilfs) {
      meldungen.push({ stufe: 'fehler', text: `${n.bmk} ist Teil eines Kreises (Quelle zeigt im Kreis)`, id: n.k.id })
      // Kreis aufbrechen
      if (n.eltern) n.eltern.kinder = n.eltern.kinder.filter((c) => c !== n)
      n.eltern = undefined
      wurzeln.push(n)
      besuche(n, 0)
    }
  }

  for (const d of p.datenverbindungen ?? []) {
    for (const id of [d.von, d.nach]) if (!knoten.has(id)) meldungen.push({ stufe: 'warnung', text: `Datenverbindung ${d.von} → ${d.nach}: "${id}" existiert nicht` })
    if (d.von === d.nach) meldungen.push({ stufe: 'warnung', text: `Datenverbindung ${d.von} zeigt auf sich selbst`, id: d.von })
  }

  // Klemmleisten verbinden genau zwei Leitungsabschnitte (Gerät – Klemmleiste – … – Gerät)
  for (const h of hilfs) {
    const anz = (p.datenverbindungen ?? []).filter((d) => d.von === h.k.id || d.nach === h.k.id).length
    if (anz !== 2) meldungen.push({ stufe: anz ? 'warnung' : 'info', text: `${h.bmk}: Klemmleiste hat ${anz} Verbindung${anz === 1 ? '' : 'en'}, erwartet sind 2 (hin und weiter)`, id: h.k.id })
  }
  // Wandlerzähler ohne Wandler-Messleitung
  for (const n of knoten.values()) {
    if (n.k.typ !== 'zaehler' || n.k.params?.messart !== 'halbindirekt') continue
    if (!(p.datenverbindungen ?? []).some((d) => (d.von === n.k.id || d.nach === n.k.id) && d.typ === 'wandler'))
      meldungen.push({ stufe: 'info', text: `${n.bmk}: Wandlerzähler ohne Wandler-Messleitung (Datenverbindung mit typ: wandler)`, id: n.k.id })
  }

  for (const d of p.potentialausgleich ?? []) {
    const a = knoten.get(d.von), b = knoten.get(d.nach)
    for (const [id, n] of [[d.von, a], [d.nach, b]] as const) if (!n) meldungen.push({ stufe: 'warnung', text: `Potentialausgleich ${d.von} – ${d.nach}: "${id}" existiert nicht` })
    if (d.von === d.nach) meldungen.push({ stufe: 'warnung', text: `Potentialausgleich ${d.von} zeigt auf sich selbst`, id: d.von })
    else if (a && b && (!a.def.pa || !b.def.pa)) for (const n of [a, b].filter((x) => !x.def.pa)) meldungen.push({ stufe: 'warnung', text: `Potentialausgleich ${d.von} – ${d.nach}: ${n.def.label} ${n.bmk} ist dafür nicht vorgesehen`, id: n.k.id })
    else if (a && b && !a.def.potential && !b.def.potential) meldungen.push({ stufe: 'info', text: `Potentialausgleich ${a.bmk} – ${b.bmk} ohne Potentialausgleichsschiene`, id: d.von })
  }

  const hak = wurzeln.filter((w) => w.def.wurzel)
  if (knoten.size && !hak.length) meldungen.push({ stufe: 'warnung', text: 'Kein Hausanschluss vorhanden' })

  // Leiter ableiten
  const phasenlast: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 }
  const leiterAbleiten = (n: Knoten) => {
    const e = n.eltern
    n.dc = !!n.def.dc || (n.k.typ === 'speicher' && e?.k.typ === 'wechselrichter')
    if (n.dc) {
      n.leiter = ['L+', 'L-']
      n.pole = 1
    } else {
      const elternLeiter = e && !e.dc ? e.leiter : ALLE_AC
      const elternPhasen = elternLeiter.filter((l) => l.startsWith('L') && l.length === 2) as Phase[]
      // 2-/4-polig = 1-/3-phasig mit geschaltetem N
      const kPole = n.k.pole === 2 ? 1 : n.k.pole === 4 ? 3 : n.k.pole
      const mitN = n.k.pole === 2 || n.k.pole === 4
      if (mitN && !n.def.nSchaltbar) meldungen.push({ stufe: 'warnung', text: `${n.bmk}: ${n.def.label} kann den N nicht schalten`, id: n.k.id })
      else if (mitN) {
        n.nGeschaltet = true
        n.voreilend = !!n.k.voreilend
      }
      if (n.k.voreilend && !mitN)
        meldungen.push({ stufe: 'warnung', text: n.def.nSchaltbar ? `${n.bmk}: "voreilend" ohne geschalteten N – Polzahl auf 2 oder 4 setzen` : `${n.bmk}: ${n.def.label} kann keinen voreilenden N haben`, id: n.k.id })
      let pole: 1 | 3 = kPole ?? n.def.pole
      if (!n.def.poleWaehlbar && kPole && kPole !== n.def.pole) {
        meldungen.push({ stufe: 'warnung', text: `${n.bmk}: ${n.def.label} ist immer ${n.def.pole}-polig`, id: n.k.id })
        pole = n.def.pole
      }
      if (pole === 3 && elternPhasen.length < 3) {
        if (kPole === 3 || !n.def.poleWaehlbar)
          meldungen.push({ stufe: 'warnung', text: `${n.bmk}: dreiphasig, aber Zuleitung nur einphasig`, id: n.k.id })
        else meldungen.push({ stufe: 'info', text: `${n.bmk}: wird einphasig angeschlossen (Zuleitung einphasig)`, id: n.k.id })
        pole = 1
      }
      n.pole = pole
      if (pole === 3) {
        n.leiter = ['L1', 'L2', 'L3', 'N', 'PE']
        if (n.k.phase) meldungen.push({ stufe: 'info', text: `${n.bmk}: "phase" wird bei 3-polig ignoriert`, id: n.k.id })
      } else {
        let ph: Phase = n.k.phase ?? elternPhasen[0] ?? 'L1'
        if (!elternPhasen.includes(ph)) {
          meldungen.push({ stufe: 'warnung', text: `${n.bmk}: Phase ${ph} ist in der Zuleitung nicht vorhanden`, id: n.k.id })
          ph = elternPhasen[0] ?? 'L1'
        }
        n.phase = ph
        n.leiter = [ph, 'N', 'PE']
      }
    }
    if (n.kinder.length && !n.def.kinder) meldungen.push({ stufe: 'warnung', text: `${n.bmk}: ${n.def.label} hat normalerweise keine Abgänge`, id: n.k.id })
    const leistung = Number(n.k.params?.leistung)
    if (!n.def.durchgang && !n.dc && n.def.kategorie === 'Verbraucher' && leistung > 0) {
      if (n.pole === 3) (['L1', 'L2', 'L3'] as Phase[]).forEach((ph) => (phasenlast[ph] += leistung / 3))
      else if (n.phase) phasenlast[n.phase] += leistung
    }
    n.kinder.forEach(leiterAbleiten)
  }
  wurzeln.forEach(leiterAbleiten)

  const pl = Object.values(phasenlast)
  if (Math.max(...pl) - Math.min(...pl) > 4.6) // 20 A Schieflast-Grenze ≈ 4,6 kVA
    meldungen.push({ stufe: 'warnung', text: `Schieflast > 4,6 kVA: L1 ${pl[0].toFixed(1)} / L2 ${pl[1].toFixed(1)} / L3 ${pl[2].toFixed(1)} kW (einphasige Verbraucher)` })

  return { wurzeln, potential, hilfs, knoten, meldungen, phasenlast }
}

/** Nächste freie ID mit gegebenem Präfix, z.B. F1, F2 ... */
export function naechsteId(p: Projekt, prefix: string): string {
  const belegt = new Set(p.komponenten.map((k) => k.id))
  for (let i = 1; ; i++) if (!belegt.has(`${prefix}${i}`)) return `${prefix}${i}`
}
