import { analysiere, naechsteId } from './analyse'
import { standardParams, typDef } from './library'
import type { Komponente, Projekt } from './types'

/** Reine Funktionen, die ein neues Projekt zurückgeben (unveränderlich). */

export function hinzufuegen(p: Projekt, typ: string, pos?: { x: number; y: number }, quelle?: string): { projekt: Projekt; id: string } {
  const def = typDef(typ)
  const id = naechsteId(p, def.bmk)
  const k: Komponente = { id, typ }
  if (quelle) k.quelle = quelle
  const params = standardParams(typ)
  if (Object.keys(params).length) k.params = params
  const editor = { ...(p.editor ?? {}) }
  if (pos) editor[id] = pos
  return { projekt: { ...p, komponenten: [...p.komponenten, k], editor }, id }
}

export function aktualisieren(p: Projekt, id: string, neu: Komponente): Projekt {
  let komponenten = p.komponenten.map((k) => (k.id === id ? neu : k))
  let editor = p.editor
  let datenverbindungen = p.datenverbindungen
  if (neu.id !== id) {
    komponenten = komponenten.map((k) => (k.quelle === id ? { ...k, quelle: neu.id } : k))
    datenverbindungen = datenverbindungen?.map((d) => ({ ...d, von: d.von === id ? neu.id : d.von, nach: d.nach === id ? neu.id : d.nach }))
    if (editor?.[id]) {
      editor = { ...editor, [neu.id]: editor[id] }
      delete editor[id]
    }
  }
  return { ...p, komponenten, editor, datenverbindungen }
}

export function entfernen(p: Projekt, ids: string[]): Projekt {
  const weg = new Set(ids)
  const editor = { ...(p.editor ?? {}) }
  ids.forEach((i) => delete editor[i])
  return {
    ...p,
    editor,
    datenverbindungen: p.datenverbindungen?.filter((d) => !weg.has(d.von) && !weg.has(d.nach)),
    komponenten: p.komponenten
      .filter((k) => !weg.has(k.id))
      .map((k) => (k.quelle && weg.has(k.quelle) ? { ...k, quelle: undefined } : k)),
  }
}

export function setzeQuelle(p: Projekt, id: string, quelle: string | undefined): Projekt {
  return { ...p, komponenten: p.komponenten.map((k) => (k.id === id ? { ...k, quelle } : k)) }
}

/** Übliche Bezeichnung einer Datenverbindung je nach Gerätepaar */
export function standardDatenart(p: Projekt, von: string, nach: string): string | undefined {
  const typ = (id: string) => p.komponenten.find((k) => k.id === id)?.typ
  const paar = new Set([typ(von), typ(nach)])
  if (paar.has('smgw') && paar.has('zaehler')) return 'LMN'
  if (paar.has('smgw') && paar.has('steuerbox')) return 'CLS'
  if (paar.has('steuerbox')) return 'Steuersignal'
  return undefined
}

export function datenVerbinden(p: Projekt, von: string, nach: string): Projekt {
  const liste = p.datenverbindungen ?? []
  if (von === nach || liste.some((d) => (d.von === von && d.nach === nach) || (d.von === nach && d.nach === von))) return p
  const art = standardDatenart(p, von, nach)
  return { ...p, datenverbindungen: [...liste, art ? { von, nach, art } : { von, nach }] }
}

export function datenTrennen(p: Projekt, von: string, nach: string): Projekt {
  return { ...p, datenverbindungen: (p.datenverbindungen ?? []).filter((d) => !(d.von === von && d.nach === nach)) }
}

export function datenArtSetzen(p: Projekt, von: string, nach: string, art: string): Projekt {
  return { ...p, datenverbindungen: (p.datenverbindungen ?? []).map((d) => (d.von === von && d.nach === nach ? (art ? { ...d, art } : { von, nach }) : d)) }
}

/** true, wenn `vorfahr` oberhalb von `id` im Baum liegt (oder gleich ist) */
export function istVorfahr(p: Projekt, vorfahr: string, id: string): boolean {
  const map = new Map(p.komponenten.map((k) => [k.id, k]))
  let akt: string | undefined = id
  const gesehen = new Set<string>()
  while (akt && !gesehen.has(akt)) {
    if (akt === vorfahr) return true
    gesehen.add(akt)
    akt = map.get(akt)?.quelle
  }
  return false
}

/** Betriebsmittelkennzeichen je Kennbuchstabe neu vergeben: von links nach rechts in Baumreihenfolge
 *  (wie im grafischen Editor angeordnet), Einspeisung zuerst. */
export function neuNummerieren(p: Projekt): Projekt {
  const editor = { ...autoLayout(p), ...(p.editor ?? {}) }
  const a = analysiere({ ...p, editor })
  const neu = new Map<string, string>()
  const zaehler: Record<string, number> = {}
  const besuche = (n: (typeof a.wurzeln)[number]) => {
    if (neu.has(n.k.id)) return
    const pre = n.def.bmk
    zaehler[pre] = (zaehler[pre] ?? 0) + 1
    neu.set(n.k.id, `${pre}${zaehler[pre]}`)
    n.kinder.forEach(besuche)
  }
  a.wurzeln.forEach(besuche)
  p.komponenten.forEach((k) => { if (!neu.has(k.id)) { const pre = typDef(k.typ).bmk; zaehler[pre] = (zaehler[pre] ?? 0) + 1; neu.set(k.id, `${pre}${zaehler[pre]}`) } })
  const m = (id: string) => neu.get(id) ?? id
  return {
    ...p,
    komponenten: p.komponenten.map((k) => ({ ...k, id: m(k.id), quelle: k.quelle ? m(k.quelle) : undefined })),
    datenverbindungen: p.datenverbindungen?.map((d) => ({ ...d, von: m(d.von), nach: m(d.nach) })),
    editor: Object.fromEntries(Object.entries(editor).filter(([id]) => neu.has(id)).map(([id, v]) => [m(id), v])),
  }
}

/** Baum-Layout für den Node-Editor */
export function autoLayout(p: Projekt): Record<string, { x: number; y: number }> {
  const a = analysiere(p)
  const pos: Record<string, { x: number; y: number }> = {}
  const BX = 210, BY = 130
  let blatt = 0
  const setze = (n: (typeof a.wurzeln)[number]): number => {
    if (!n.kinder.length) {
      const x = blatt++ * BX
      pos[n.k.id] = { x, y: n.tiefe * BY }
      return x
    }
    const xs = n.kinder.map(setze)
    const x = xs[0] // linksbündig: Eltern über dem ersten Kind, Aufbau von links nach rechts
    pos[n.k.id] = { x, y: n.tiefe * BY }
    return x
  }
  a.wurzeln.forEach((w) => {
    setze(w)
    blatt += 0.5
  })
  return pos
}
