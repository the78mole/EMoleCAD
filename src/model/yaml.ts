import YAML from 'yaml'
import { TYPEN } from './library'
import type { Datenverbindung, Komponente, PaVerbindung, Projekt, ParamWert } from './types'

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
  if (roh.potentialausgleich !== undefined && roh.potentialausgleich !== null) {
    if (!Array.isArray(roh.potentialausgleich)) throw new YamlFehler('"potentialausgleich" muss eine Liste sein')
    p.potentialausgleich = roh.potentialausgleich.map((d, i): PaVerbindung => {
      if (!istObjekt(d) || !d.von || !d.nach) throw new YamlFehler(`Potentialausgleich #${i + 1}: "von" und "nach" sind nötig`)
      const v: PaVerbindung = { von: String(d.von), nach: String(d.nach) }
      if (d.querschnitt !== undefined && d.querschnitt !== null && d.querschnitt !== '') v.querschnitt = String(d.querschnitt)
      return v
    }).filter((v, i, alle) => alle.findIndex((w) => (w.von === v.von && w.nach === v.nach) || (w.von === v.nach && w.nach === v.von)) === i) // ungerichtet, Doppelte entfernen
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
    if (pole !== 1 && pole !== 2 && pole !== 3 && pole !== 4) throw new YamlFehler(`Komponente "${k.id}": pole muss 1, 2, 3 oder 4 sein`)
    out.pole = pole
  }
  if (k.voreilend !== undefined) {
    if (typeof k.voreilend !== 'boolean') throw new YamlFehler(`Komponente "${k.id}": voreilend muss true oder false sein`)
    if (k.voreilend) out.voreilend = true
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
  if (k.produkt !== undefined) {
    if (!istObjekt(k.produkt)) throw new YamlFehler(`Komponente "${k.id}": produkt muss ein Objekt mit hersteller/artikel sein`)
    const pr: Komponente['produkt'] = {}
    if (k.produkt.hersteller !== undefined && k.produkt.hersteller !== '') pr.hersteller = String(k.produkt.hersteller)
    if (k.produkt.artikel !== undefined && k.produkt.artikel !== '') pr.artikel = String(k.produkt.artikel)
    if (Object.keys(pr).length) out.produkt = pr
  }
  if (k.params !== undefined) {
    if (!istObjekt(k.params)) throw new YamlFehler(`Komponente "${k.id}": params muss ein Objekt sein`)
    out.params = {}
    for (const [pk, pv] of Object.entries(k.params)) {
      if (pv === null || pv === undefined) continue
      out.params[pk] = (typeof pv === 'object' ? String(pv) : pv) as ParamWert
    }
    // Ja/Nein-Parameter als echte Booleans (auch in Anführungszeichen geschriebenes "false")
    for (const pd of TYPEN[out.typ]?.params ?? []) {
      if (pd.art !== 'bool' || !(pd.key in out.params)) continue
      const v = out.params[pd.key]
      if (typeof v === 'boolean') continue
      const t = String(v).trim().toLowerCase()
      if (['true', 'ja', '1'].includes(t)) out.params[pd.key] = true
      else if (['false', 'nein', '0', ''].includes(t)) out.params[pd.key] = false
      else throw new YamlFehler(`Komponente "${k.id}": ${pd.key} muss true oder false sein`)
    }
    // ältere Dateien: Lasttrennschalter mit params.allpolig -> 4-polig (bzw. 2-polig) voreilend
    if (out.typ === 'trennschalter' && 'allpolig' in out.params) {
      const v = String(out.params.allpolig).trim().toLowerCase()
      if (![['true', 'ja', '1'], ['false', 'nein', '0', '']].flat().includes(v))
        throw new YamlFehler(`Komponente "${k.id}": allpolig muss true oder false sein`)
      delete out.params.allpolig
      if (['true', 'ja', '1'].includes(v)) {
        out.pole = out.pole === 1 || out.pole === 2 ? 2 : 4
        out.voreilend = true
      }
    }
    if (!Object.keys(out.params).length) delete out.params
    // ältere Dateien: Wechselrichter/SMGW hatten „hersteller“ als Typangabe
    if (out.params && ['wechselrichter', 'smgw'].includes(out.typ) && 'hersteller' in out.params && !('modell' in out.params)) {
      out.params.modell = out.params.hersteller
      delete out.params.hersteller
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
      if (k.voreilend) o.voreilend = true
      if (k.phase) o.phase = k.phase
      if (k.kabel && Object.keys(k.kabel).length) o.kabel = k.kabel
      if (k.produkt && Object.keys(k.produkt).length) o.produkt = k.produkt
      if (k.params && Object.keys(k.params).length) o.params = k.params
      return o
    }),
  }
  if (p.datenverbindungen?.length) roh.datenverbindungen = p.datenverbindungen.map((d) => (d.art ? { von: d.von, nach: d.nach, art: d.art } : { von: d.von, nach: d.nach }))
  if (p.potentialausgleich?.length) roh.potentialausgleich = p.potentialausgleich.map((d) => (d.querschnitt ? { von: d.von, nach: d.nach, querschnitt: d.querschnitt } : { von: d.von, nach: d.nach }))
  const doc = new YAML.Document(roh)
  // kompakte Darstellung für Parameter und Kabel
  YAML.visit(doc, {
    Pair(_, pair) {
      const key = (pair.key as YAML.Scalar)?.value
      if ((key === 'params' || key === 'kabel' || key === 'produkt') && YAML.isMap(pair.value)) pair.value.flow = true
      if ((key === 'datenverbindungen' || key === 'potentialausgleich') && YAML.isSeq(pair.value)) pair.value.items.forEach((it) => { if (YAML.isMap(it)) it.flow = true })
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
