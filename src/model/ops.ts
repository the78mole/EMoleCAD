import { analysiere, naechsteId } from './analyse'
import { kennbuchstaben, standardParams } from './library'
import type { Komponente, Projekt } from './types'

/** Reine Funktionen, die ein neues Projekt zurückgeben (unveränderlich). */

export function hinzufuegen(p: Projekt, typ: string, pos?: { x: number; y: number }, quelle?: string): { projekt: Projekt; id: string } {
  const id = naechsteId(p, kennbuchstaben(typ))
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
  let potentialausgleich = p.potentialausgleich
  if (neu.id !== id) {
    const m = (x: string) => (x === id ? neu.id : x)
    komponenten = komponenten.map((k) => (k.quelle === id ? { ...k, quelle: neu.id } : k))
    datenverbindungen = datenverbindungen?.map((d) => ({ ...d, von: m(d.von), nach: m(d.nach) }))
    potentialausgleich = potentialausgleich?.map((d) => ({ ...d, von: m(d.von), nach: m(d.nach) }))
    if (editor?.[id]) {
      editor = { ...editor, [neu.id]: editor[id] }
      delete editor[id]
    }
  }
  return { ...p, komponenten, editor, datenverbindungen, potentialausgleich }
}

export function entfernen(p: Projekt, ids: string[]): Projekt {
  const weg = new Set(ids)
  const editor = { ...(p.editor ?? {}) }
  ids.forEach((i) => delete editor[i])
  return {
    ...p,
    editor,
    datenverbindungen: p.datenverbindungen?.filter((d) => !weg.has(d.von) && !weg.has(d.nach)),
    potentialausgleich: p.potentialausgleich?.filter((d) => !weg.has(d.von) && !weg.has(d.nach)),
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
  // Netztrennung für Ersatzstrom, z. B. Fronius Backup Controller vom Hybridwechselrichter gesteuert
  if (paar.has('trennschalter') && paar.has('wechselrichter')) return 'Steuersignal'
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
  // Lesereihenfolge: Zeile für Zeile von oben nach unten, innerhalb der Zeile von links nach rechts.
  // Bausteine, deren Oberkante weniger als ZEILE px auseinander liegt, gelten als eine Zeile.
  const ZEILE = 60
  const pos = (id: string) => editor[id] ?? { x: 0, y: 0 }
  const nachY = [...p.komponenten].sort((x, y) => pos(x.id).y - pos(y.id).y)
  const zeilen: Komponente[][] = []
  for (const k of nachY) {
    const z = zeilen[zeilen.length - 1]
    if (z && pos(k.id).y - pos(z[0].id).y < ZEILE) z.push(k)
    else zeilen.push([k])
  }
  const festeIds = new Set(p.komponenten.filter((k) => k.fest).map((k) => k.id))
  const neu = new Map<string, string>()
  const zaehler: Record<string, number> = {}
  for (const z of zeilen) {
    z.sort((x, y) => pos(x.id).x - pos(y.id).x)
    for (const k of z) {
      if (k.fest) { neu.set(k.id, k.id); continue }
      const pre = kennbuchstaben(k.typ, k.params)
      let id: string
      do { zaehler[pre] = (zaehler[pre] ?? 0) + 1; id = `${pre}${zaehler[pre]}` } while (festeIds.has(id))
      neu.set(k.id, id)
    }
  }
  const m = (id: string) => neu.get(id) ?? id
  return {
    ...p,
    komponenten: p.komponenten.map((k) => ({ ...k, id: m(k.id), quelle: k.quelle ? m(k.quelle) : undefined })),
    datenverbindungen: p.datenverbindungen?.map((d) => ({ ...d, von: m(d.von), nach: m(d.nach) })),
    potentialausgleich: p.potentialausgleich?.map((d) => ({ ...d, von: m(d.von), nach: m(d.nach) })),
    editor: Object.fromEntries(Object.entries(editor).filter(([id]) => neu.has(id)).map(([id, v]) => [m(id), v])),
  }
}

/** Typen der Einspeisekette (HAK → … → Verteilung); im Editor immer ganz links. */
const KETTE = ['hlak', 'zaehler', 'sls', 'trennschalter', 'sicherung', 'sammelschiene']

/**
 * Baum-Layout von links nach rechts: Eltern stehen über ihrem ersten Abgang.
 * Unterbäume werden pro Ebene so weit links wie möglich eingepasst, damit die
 * Geräte am Netzanschluss (SPD, Steuerbox, SMGW …) direkt neben dem Hauptstrang stehen.
 */
export function autoLayout(p: Projekt): Record<string, { x: number; y: number }> {
  const a = analysiere(p)
  type K = (typeof a.wurzeln)[number]
  const pos: Record<string, { x: number; y: number }> = {}
  const BX = 210, BY = 130
  const frei: number[] = []
  const istKette = (n: K) => KETTE.includes(n.k.typ) && n.kinder.length > 0
  const mitZaehler = (n: K): boolean => n.k.typ === 'zaehler' || n.kinder.some(mitZaehler)
  const setze = (n: K, min: number): number => {
    min = Math.max(min, frei[n.tiefe] ?? 0)
    let x = min
    if (n.kinder.length) {
      // Hauptstrang zuerst, dann die übrigen Geräte (z.B. ungezählter Bereich mit SMGW und Steuerbox),
      // weitere Zählerstränge zuletzt, damit der Netzbereich beisammen bleibt
      // Hauptstrang wie im Plan: der erste Kettenzweig mit nachgelagertem Zähler, sonst der erste
      const ketten = n.kinder.filter(istKette)
      const haupt = ketten.find(mitZaehler) ?? ketten[0]
      const kinder = [...(haupt ? [haupt] : []), ...n.kinder.filter((c) => !istKette(c)), ...ketten.filter((c) => c !== haupt)]
      x = setze(kinder[0], min)
      kinder.slice(1).forEach((c) => setze(c, x))
    }
    pos[n.k.id] = { x: x * BX, y: n.tiefe * BY }
    frei[n.tiefe] = x + 1
    return x
  }
  let start = 0
  a.wurzeln.forEach((w) => {
    setze(w, start)
    start = Math.max(0, ...Array.from(frei, (f) => f ?? 0)) + 0.5
  })
  // Potentialausgleichsschienen unter den Baum, links beginnend
  const yPa = (Math.max(-1, ...Object.values(pos).map((v) => v.y / BY)) + 1) * BY
  a.potential.forEach((n, i) => { pos[n.k.id] = { x: i * BX, y: yPa } })
  return pos
}

// ---------- Potentialausgleich ----------

const paGleich = (d: { von: string; nach: string }, a: string, b: string) => (d.von === a && d.nach === b) || (d.von === b && d.nach === a)

export function paVerbinden(p: Projekt, von: string, nach: string): Projekt {
  const liste = p.potentialausgleich ?? []
  if (von === nach || liste.some((d) => paGleich(d, von, nach))) return p
  return { ...p, potentialausgleich: [...liste, { von, nach }] }
}

export function paTrennen(p: Projekt, von: string, nach: string): Projekt {
  return { ...p, potentialausgleich: (p.potentialausgleich ?? []).filter((d) => !paGleich(d, von, nach)) }
}

export function paQuerschnittSetzen(p: Projekt, von: string, nach: string, querschnitt: string): Projekt {
  return { ...p, potentialausgleich: (p.potentialausgleich ?? []).map((d) => (paGleich(d, von, nach) ? (querschnitt ? { ...d, querschnitt } : { von: d.von, nach: d.nach }) : d)) }
}
