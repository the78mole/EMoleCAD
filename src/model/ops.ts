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
  if (neu.id !== id) {
    komponenten = komponenten.map((k) => (k.quelle === id ? { ...k, quelle: neu.id } : k))
    if (editor?.[id]) {
      editor = { ...editor, [neu.id]: editor[id] }
      delete editor[id]
    }
  }
  return { ...p, komponenten, editor }
}

export function entfernen(p: Projekt, ids: string[]): Projekt {
  const weg = new Set(ids)
  const editor = { ...(p.editor ?? {}) }
  ids.forEach((i) => delete editor[i])
  return {
    ...p,
    editor,
    komponenten: p.komponenten
      .filter((k) => !weg.has(k.id))
      .map((k) => (k.quelle && weg.has(k.quelle) ? { ...k, quelle: undefined } : k)),
  }
}

export function setzeQuelle(p: Projekt, id: string, quelle: string | undefined): Projekt {
  return { ...p, komponenten: p.komponenten.map((k) => (k.id === id ? { ...k, quelle } : k)) }
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
    const x = (Math.min(...xs) + Math.max(...xs)) / 2
    pos[n.k.id] = { x, y: n.tiefe * BY }
    return x
  }
  a.wurzeln.forEach((w) => {
    setze(w)
    blatt += 0.5
  })
  return pos
}
