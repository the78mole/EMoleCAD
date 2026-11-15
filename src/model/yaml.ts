import YAML from 'yaml'
import type { Datenverbindung, Komponente, Projekt, ParamWert } from './types'

export class YamlFehler extends Error {
  zeile?: number
  constructor(msg: string, zeile?: number) {
    super(msg)
    this.zeile = zeile
  }
}

export function leeresProjekt(): Projekt {
  return { projekt: { titel: 'Neues Projekt' }, netz: { form: 'TN-C-S', spannung: '230/400 V' }, komponenten: [] }
}

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function parseYaml(text: string): Projekt {
  const doc = YAML.parseDocument(text, { prettyErrors: false })
  if (doc.errors.length) {
    const e = doc.errors[0]
    throw new YamlFehler(e.message.split('\n')[0], e.linePos?.[0]?.line)
  }
  const roh = doc.toJS() as unknown
  if (roh == null) return leeresProjekt()
  if (!istObjekt(roh)) throw new YamlFehler('Wurzel muss ein Objekt sein (projekt, netz, komponenten)')

  const p = leeresProjekt()
  if (roh.projekt !== undefined) {
    if (!istObjekt(roh.projekt)) throw new YamlFehler('"projekt" muss ein Objekt sein')
    p.projekt = Object.fromEntries(Object.entries(roh.projekt).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '')]))
  }
  if (roh.netz !== undefined) {
    if (!istObjekt(roh.netz)) throw new YamlFehler('"netz" muss ein Objekt sein')
    const form = String(roh.netz.form ?? 'TN-C-S')
    if (!['TN-C-S', 'TN-S', 'TT'].includes(form)) throw new YamlFehler(`Unbekannte Netzform "${form}" (erlaubt: TN-C-S, TN-S, TT)`)
    p.netz = { form: form as Projekt['netz']['form'], spannung: roh.netz.spannung ? String(roh.netz.spannung) : undefined }
  }
  const ks = roh.komponenten ?? []
  if (!Array.isArray(ks)) throw new YamlFehler('"komponenten" muss eine Liste sein')
  p.komponenten = ks.map((k, i) => komponenteAus(k, i))

  if (roh.datenverbindungen !== undefined && roh.datenverbindungen !== null) {
    if (!Array.isArray(roh.datenverbindungen)) throw new YamlFehler('"datenverbindungen" muss eine Liste sein')
    p.datenverbindungen = roh.datenverbindungen.map((d, i): Datenverbindung => {
      if (!istObjekt(d) || !d.von || !d.nach) throw new YamlFehler(`Datenverbindung #${i + 1}: "von" und "nach" sind nötig`)
      const v: Datenverbindung = { von: String(d.von), nach: String(d.nach) }
      if (d.art) v.art = String(d.art)
      return v
    })
  }
  if (roh.editor !== undefined && istObjekt(roh.editor)) {
    p.editor = {}
    for (const [id, pos] of Object.entries(roh.editor)) {
      if (Array.isArray(pos) && pos.length === 2) p.editor[id] = { x: Number(pos[0]), y: Number(pos[1]) }
      else if (istObjekt(pos)) p.editor[id] = { x: Number(pos.x), y: Number(pos.y) }
    }
  }
  return p
}

function komponenteAus(k: unknown, i: number): Komponente {
  if (!istObjekt(k)) throw new YamlFehler(`Komponente #${i + 1} muss ein Objekt sein`)
  if (k.id === undefined || k.id === null || k.id === '') throw new YamlFehler(`Komponente #${i + 1}: "id" fehlt`)
  if (!k.typ) throw new YamlFehler(`Komponente "${k.id}": "typ" fehlt`)
  const out: Komponente = { id: String(k.id), typ: String(k.typ) }
  if (k.name !== undefined) out.name = String(k.name)
  if (k.quelle !== undefined && k.quelle !== null && k.quelle !== '') out.quelle = String(k.quelle)
  if (k.pole !== undefined) {
    const pole = Number(k.pole)
    if (pole !== 1 && pole !== 3) throw new YamlFehler(`Komponente "${k.id}": pole muss 1 oder 3 sein`)
    out.pole = pole
  }
  if (k.fest !== undefined) {
    if (typeof k.fest !== 'boolean') throw new YamlFehler(`Komponente "${k.id}": fest muss true oder false sein`)
    if (k.fest) out.fest = true
  }
  if (k.phase !== undefined) {
    const ph = String(k.phase).toUpperCase()
    if (!['L1', 'L2', 'L3'].includes(ph)) throw new YamlFehler(`Komponente "${k.id}": phase muss L1, L2 oder L3 sein`)
    out.phase = ph as Komponente['phase']
  }
  if (k.kabel !== undefined) {
    if (typeof k.kabel === 'string') out.kabel = { typ: k.kabel }
    else if (istObjekt(k.kabel)) {
      out.kabel = {}
      if (k.kabel.typ) out.kabel.typ = String(k.kabel.typ)
      if (k.kabel.querschnitt) out.kabel.querschnitt = String(k.kabel.querschnitt)
      if (k.kabel.laenge !== undefined) out.kabel.laenge = Number(k.kabel.laenge)
    }
  }
  if (k.params !== undefined) {
    if (!istObjekt(k.params)) throw new YamlFehler(`Komponente "${k.id}": params muss ein Objekt sein`)
    out.params = {}
    for (const [pk, pv] of Object.entries(k.params)) {
      if (pv === null || pv === undefined) continue
      out.params[pk] = (typeof pv === 'object' ? String(pv) : pv) as ParamWert
    }
  }
  return out
}

export function toYaml(p: Projekt): string {
  const roh: Record<string, unknown> = {
    projekt: p.projekt,
    netz: p.netz.spannung ? p.netz : { form: p.netz.form },
    komponenten: p.komponenten.map((k) => {
      const o: Record<string, unknown> = { id: k.id, typ: k.typ }
      if (k.fest) o.fest = true
      if (k.name) o.name = k.name
      if (k.quelle) o.quelle = k.quelle
      if (k.pole) o.pole = k.pole
      if (k.phase) o.phase = k.phase
      if (k.kabel && Object.keys(k.kabel).length) o.kabel = k.kabel
      if (k.params && Object.keys(k.params).length) o.params = k.params
      return o
    }),
  }
  if (p.datenverbindungen?.length) roh.datenverbindungen = p.datenverbindungen.map((d) => (d.art ? { von: d.von, nach: d.nach, art: d.art } : { von: d.von, nach: d.nach }))
  const doc = new YAML.Document(roh)
  // kompakte Darstellung für Parameter und Kabel
  YAML.visit(doc, {
    Pair(_, pair) {
      const key = (pair.key as YAML.Scalar)?.value
      if ((key === 'params' || key === 'kabel') && YAML.isMap(pair.value)) pair.value.flow = true
      if (key === 'datenverbindungen' && YAML.isSeq(pair.value)) pair.value.items.forEach((it) => { if (YAML.isMap(it)) it.flow = true })
    },
  })
  let out = doc.toString({ lineWidth: 0 })
  if (p.editor && Object.keys(p.editor).length) {
    const ed = new YAML.Document({ editor: Object.fromEntries(Object.entries(p.editor).map(([id, v]) => [id, [Math.round(v.x), Math.round(v.y)]])) })
    YAML.visit(ed, { Seq(_, s) { s.flow = true } })
    out += '\n# Positionen im grafischen Editor\n' + ed.toString()
  }
  return out
}
