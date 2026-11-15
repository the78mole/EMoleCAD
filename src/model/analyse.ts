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
  for (const n of knoten.values()) {
    const q = n.k.quelle
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
    if (n.def.wurzel) meldungen.push({ stufe: 'warnung', text: `${n.bmk}: ein Hausanschluss sollte keine Quelle haben`, id: n.k.id })
    n.eltern = e
    e.kinder.push(n)
  }

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
    if (!erreicht.has(n)) {
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
      let pole: 1 | 3 = n.k.pole ?? n.def.pole
      if (!n.def.poleWaehlbar && n.k.pole && n.k.pole !== n.def.pole) {
        meldungen.push({ stufe: 'warnung', text: `${n.bmk}: ${n.def.label} ist immer ${n.def.pole}-polig`, id: n.k.id })
        pole = n.def.pole
      }
      if (pole === 3 && elternPhasen.length < 3) {
        if (n.k.pole === 3 || !n.def.poleWaehlbar)
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

  return { wurzeln, knoten, meldungen, phasenlast }
}

/** Nächste freie ID mit gegebenem Präfix, z.B. F1, F2 ... */
export function naechsteId(p: Projekt, prefix: string): string {
  const belegt = new Set(p.komponenten.map((k) => k.id))
  for (let i = 1; ; i++) if (!belegt.has(`${prefix}${i}`)) return `${prefix}${i}`
}
