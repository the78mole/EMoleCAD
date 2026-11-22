import type { ParamWert } from './types'

export type SymbolArt =
  | 'hak' | 'zaehler' | 'sls' | 'trenner' | 'sicherung' | 'ls' | 'rcd' | 'rcbo' | 'spd'
  | 'wechselrichter' | 'pvgen' | 'speicher' | 'wallbox' | 'waermepumpe' | 'verbraucher'
  | 'steuerbox' | 'smgw' | 'verteiler' | 'klemme' | 'schiene' | 'pas'
  | 'wandler' | 'schuetz' | 'messumformer' | 'fernwirk' | 'klemmleiste'

export interface ParamDef {
  key: string
  label: string
  art: 'zahl' | 'text' | 'auswahl' | 'bool'
  einheit?: string
  optionen?: string[]
  /** Bei 'auswahl': auch Freitext erlaubt (im Projekt verwendete Werte erscheinen in der Auswahl) */
  frei?: boolean
  standard?: ParamWert
}

export interface TypDef {
  typ: string
  label: string
  kategorie: 'Einspeisung' | 'Schutz' | 'Erzeugung' | 'Verbraucher' | 'Sonstiges'
  /** Kennbuchstaben (Klasse + Unterklasse) nach DIN EN IEC 81346-2:2019 */
  bmk: string
  /** Kennbuchstaben abhängig von den Parametern (z. B. Verwendung eines Stromkreises) */
  bmkAus?: (p: Record<string, ParamWert>) => string
  farbe: string
  pole: 1 | 3
  poleWaehlbar: boolean
  /** N kann mitgeschaltet werden (2-/4-polig, optional voreilend), z. B. Netztrennung für Ersatzstrom */
  nSchaltbar?: boolean
  kinder: boolean
  /** Gleichstromseitige Komponente (z.B. PV-Generator) */
  dc?: boolean
  /** Komponente ohne Eingang (Wurzel des Baums) */
  wurzel?: boolean
  /** Im Strompfad liegend (Leiter laufen durch) statt Abschluss/Box */
  durchgang: boolean
  symbol: SymbolArt
  params: ParamDef[]
  /** Hat eine Kommunikationsschnittstelle (Datenverbindungen möglich) */
  daten?: boolean
  /** Kann an den Potentialausgleich angeschlossen werden */
  pa?: boolean
  /** Gehört nur zum Potentialausgleich, nicht zum Strompfad (z.B. PAS) */
  potential?: boolean
  /** Hilfsbetriebsmittel ohne Strompfad (z. B. Klemmleiste für Mess-/Steuerleitungen): keine Quelle,
   *  wird in den Verlauf seiner Verbindungen eingezeichnet */
  hilfs?: boolean
  /** Kurzbeschriftung im Plan aus den Parametern */
  kurz?: (p: Record<string, ParamWert>) => string
}

/** Benannte Anschlüsse eines Geräts aus dem Parameter `anschluesse` ("UH:17/18, I-L1:1/3, out1:20/21") */
export function anschluesse(p?: Record<string, ParamWert>): { name: string; klemmen: string }[] {
  const t = p?.anschluesse
  if (t === undefined || t === '') return []
  return String(t).split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.indexOf(':')
    return i < 0 ? { name: s, klemmen: s } : { name: s.slice(0, i).trim(), klemmen: s.slice(i + 1).trim() }
  })
}

/** Anschlussangabe für den Plan: „I-L1“ wird über die Anschlussliste zu „I-L1 1/3“ */
export function klemmenText(name: string | undefined, p?: Record<string, ParamWert>): string {
  if (!name) return ''
  const liste = anschluesse(p)
  const namen = name.split(',').map((t) => t.trim()).filter(Boolean)
  // mehrere Anschlüsse: nur die Klemmennummern, damit die Angabe kurz bleibt
  return namen.map((t) => {
    const a = liste.find((x) => x.name === t)
    if (!a || a.klemmen === a.name) return t
    return namen.length > 1 ? a.klemmen : `${a.name} ${a.klemmen}`
  }).join(', ')
}

const n = (v: ParamWert | undefined) => (v === undefined || v === '' ? '' : String(v))

/** Verbraucher-Stromkreise: Kennbuchstaben nach Verwendung (IEC 81346-2:2019) */
export const VERWENDUNG: Record<string, string> = {
  Steckdosen: 'XD',   // Verbinden (Niederspannung)
  Beleuchtung: 'EA',  // Licht erzeugen
  'Heizung/Herd': 'EB', // elektrisch heizen
  'Motor/Antrieb': 'MA', // elektrischer Antrieb
  Herd: 'EB',
  Backofen: 'EB',
  'Kühlgerät': 'EC',     // Kühlen
  'Gefriergerät': 'EC',
  Waschmaschine: 'EB',
  'Wäschetrockner': 'EB',
  'Spülmaschine': 'EB',
  'Elektrogerät': 'EB',
  Reserve: 'XD',
}

/**
 * Auswahl-Optionen eines Parameters: die festen Optionen, bei Freitext-Parametern ergänzt um die
 * im Projekt bei gleichartigen Komponenten bereits verwendeten Werte (wandern so mit dem YAML mit).
 */
export function paramOptionen(pd: ParamDef, typ: string, komponenten: { typ: string; params?: Record<string, ParamWert> }[]): string[] {
  const fest = pd.optionen ?? []
  if (!pd.frei) return fest
  const eigene = new Set<string>()
  for (const k of komponenten) {
    const w = k.typ === typ ? k.params?.[pd.key] : undefined
    if (w === undefined || w === '') continue
    const t = String(w)
    if (!fest.includes(t)) eigene.add(t)
  }
  return [...fest, ...[...eigene].sort((a, b) => a.localeCompare(b, 'de'))]
}

export const BIBLIOTHEK: TypDef[] = [
  {
    typ: 'hausanschluss', pa: true, label: 'Hausanschluss (HAK)', kategorie: 'Einspeisung', bmk: 'XD', farbe: '#6b7280',
    pole: 3, poleWaehlbar: false, kinder: true, wurzel: true, durchgang: true, symbol: 'hak',
    params: [
      { key: 'sicherung', label: 'Vorsicherung', art: 'zahl', einheit: 'A', standard: 63 },
      { key: 'sicherungstyp', label: 'Sicherungstyp', art: 'auswahl', frei: true, optionen: ['NH00 gG', 'NH1 gG', 'NH2 gG', 'NH3 gG', 'D02 gG'], standard: 'NH00 gG' },
      { key: 'netzbetreiber', label: 'Netzbetreiber', art: 'text', standard: '' },
    ],
    kurz: (p) => `${n(p.sicherungstyp)} ${n(p.sicherung)}A`,
  },
  {
    typ: 'hlak', label: 'HLAK (Hauptleiteranschlussklemme)', kategorie: 'Einspeisung', bmk: 'XD', farbe: '#78716c',
    pole: 3, poleWaehlbar: false, kinder: true, durchgang: true, symbol: 'klemme',
    params: [
      { key: 'querschnitt', label: 'Klemmbereich', art: 'text', einheit: 'mm²', standard: '35' },
      { key: 'nennstrom', label: 'Bemessungsstrom', art: 'zahl', einheit: 'A', standard: 63 },
    ],
    kurz: (p) => `HLAK${p.querschnitt ? ' ' + p.querschnitt + ' mm²' : ''}`,
  },
  {
    typ: 'zaehler', daten: true, label: 'Zähler', kategorie: 'Einspeisung', bmk: 'PG', farbe: '#0ea5e9',
    pole: 3, poleWaehlbar: true, kinder: true, durchgang: true, symbol: 'zaehler',
    params: [
      { key: 'art', label: 'Art', art: 'auswahl', optionen: ['Bezug', 'Zweirichtung', 'Erzeugung', 'Unterzähler'], standard: 'Zweirichtung' },
      { key: 'zaehlernummer', label: 'Zählernummer', art: 'text', standard: '' },
      { key: 'messkonzept', label: 'Messkonzept', art: 'text', standard: '' },
      // halbindirekt: Wandlerzähler, Strompfad über Stromwandler (Datenverbindung typ wandler),
      // Spannungspfad direkt von den Hauptleitern abgegriffen
      { key: 'messart', label: 'Messart', art: 'auswahl', optionen: ['direkt', 'halbindirekt'], standard: 'direkt' },
      { key: 'spannungspfad', label: 'Spannungspfad-Absicherung', art: 'text', standard: '' },
    ],
    kurz: (p) => `${n(p.art)}${p.messart === 'halbindirekt' ? ' Wandlermessung' : ''}${p.zaehlernummer ? ' ' + p.zaehlernummer : ''}`,
  },
  {
    typ: 'stromwandler', daten: true, label: 'Stromwandler(satz)', kategorie: 'Einspeisung', bmk: 'BE', farbe: '#c2410c',
    pole: 3, poleWaehlbar: true, kinder: true, durchgang: true, symbol: 'wandler',
    params: [
      { key: 'uebersetzung', label: 'Übersetzung', art: 'auswahl', frei: true, optionen: ['100/5 A', '150/5 A', '200/5 A', '250/5 A', '300/5 A', '400/5 A', '500/5 A', '600/5 A', '800/5 A', '1000/5 A', '500/1 A'], standard: '500/5 A' },
      { key: 'klasse', label: 'Genauigkeitsklasse', art: 'auswahl', frei: true, optionen: ['0,2S', '0,5S', '0,5', '1', '3'], standard: '0,5S' },
      { key: 'buerde', label: 'Bemessungsbürde', art: 'text', einheit: 'VA', standard: '5' },
      { key: 'zweck', label: 'Zweck', art: 'auswahl', frei: true, optionen: ['Abrechnung', 'Fernwirktechnik', 'Messung'], standard: 'Abrechnung' },
    ],
    kurz: (p) => [n(p.uebersetzung), p.klasse ? `Kl. ${p.klasse}` : '', p.buerde ? `${p.buerde} VA` : ''].filter(Boolean).join(', '),
  },
  {
    typ: 'sls', label: 'SLS-Schalter', kategorie: 'Schutz', bmk: 'FC', farbe: '#ef4444',
    pole: 3, poleWaehlbar: false, kinder: true, durchgang: true, symbol: 'sls',
    params: [{ key: 'nennstrom', label: 'Nennstrom', art: 'zahl', einheit: 'A', standard: 35 }],
    kurz: (p) => `SLS E ${n(p.nennstrom)}A`,
  },
  {
    typ: 'trennschalter', daten: true, label: 'Lasttrennschalter', kategorie: 'Schutz', bmk: 'QB', farbe: '#f97316',
    pole: 3, poleWaehlbar: true, nSchaltbar: true, kinder: true, durchgang: true, symbol: 'trenner',
    params: [{ key: 'nennstrom', label: 'Nennstrom', art: 'zahl', einheit: 'A', standard: 63 }],
    kurz: (p) => `${n(p.nennstrom)}A`,
  },
  {
    typ: 'schuetz', daten: true, label: 'Schütz / motorischer Schalter', kategorie: 'Schutz', bmk: 'QA', farbe: '#ea580c',
    pole: 3, poleWaehlbar: true, kinder: true, durchgang: true, symbol: 'schuetz',
    params: [
      { key: 'nennstrom', label: 'Bemessungsstrom', art: 'zahl', einheit: 'A', standard: 400 },
      { key: 'antrieb', label: 'Antrieb', art: 'auswahl', optionen: ['Spule', 'Motor'], standard: 'Motor' },
      { key: 'steuerspannung', label: 'Steuerspannung', art: 'text', standard: '230 V AC' },
    ],
    kurz: (p) => `${n(p.nennstrom)}A${p.antrieb === 'Motor' ? ' motorisch' : ''}`,
  },
  {
    typ: 'sicherung', label: 'Schmelzsicherung', kategorie: 'Schutz', bmk: 'FC', farbe: '#f59e0b',
    pole: 3, poleWaehlbar: true, kinder: true, durchgang: true, symbol: 'sicherung',
    params: [
      { key: 'nennstrom', label: 'Nennstrom', art: 'zahl', einheit: 'A', standard: 35 },
      { key: 'bauform', label: 'Bauform', art: 'auswahl', optionen: ['D02', 'D01', 'NH00', 'D0-Trenner'], standard: 'D02' },
    ],
    kurz: (p) => `${n(p.bauform)} ${n(p.nennstrom)}A`,
  },
  {
    typ: 'rcd', label: 'FI-Schutzschalter (RCD)', kategorie: 'Schutz', bmk: 'FB', farbe: '#8b5cf6',
    pole: 3, poleWaehlbar: true, kinder: true, durchgang: true, symbol: 'rcd',
    params: [
      { key: 'nennstrom', label: 'Nennstrom', art: 'zahl', einheit: 'A', standard: 40 },
      { key: 'fehlerstrom', label: 'Bemessungsfehlerstrom', art: 'zahl', einheit: 'mA', standard: 30 },
      { key: 'rcdtyp', label: 'Typ', art: 'auswahl', optionen: ['A', 'F', 'B', 'A EV'], standard: 'A' },
    ],
    kurz: (p) => `${n(p.nennstrom)}A/${n(p.fehlerstrom)}mA Typ ${n(p.rcdtyp)}`,
  },
  {
    typ: 'ls', label: 'Leitungsschutzschalter (LS)', kategorie: 'Schutz', bmk: 'FC', farbe: '#dc2626',
    pole: 1, poleWaehlbar: true, kinder: true, durchgang: true, symbol: 'ls',
    params: [
      { key: 'charakteristik', label: 'Charakteristik', art: 'auswahl', optionen: ['B', 'C', 'D'], standard: 'B' },
      { key: 'nennstrom', label: 'Nennstrom', art: 'zahl', einheit: 'A', standard: 16 },
    ],
    kurz: (p) => `${n(p.charakteristik)}${n(p.nennstrom)}`,
  },
  {
    typ: 'rcbo', label: 'FI/LS (RCBO)', kategorie: 'Schutz', bmk: 'FB', farbe: '#a855f7',
    pole: 1, poleWaehlbar: true, kinder: true, durchgang: true, symbol: 'rcbo',
    params: [
      { key: 'charakteristik', label: 'Charakteristik', art: 'auswahl', optionen: ['B', 'C'], standard: 'B' },
      { key: 'nennstrom', label: 'Nennstrom', art: 'zahl', einheit: 'A', standard: 16 },
      { key: 'fehlerstrom', label: 'Bemessungsfehlerstrom', art: 'zahl', einheit: 'mA', standard: 30 },
      { key: 'rcdtyp', label: 'Typ', art: 'auswahl', optionen: ['A', 'F', 'B', 'A EV'], standard: 'A' },
    ],
    kurz: (p) => `${n(p.charakteristik)}${n(p.nennstrom)} ${n(p.fehlerstrom)}mA`,
  },
  {
    typ: 'spd', pa: true, label: 'Überspannungsschutz (SPD)', kategorie: 'Schutz', bmk: 'FA', farbe: '#eab308',
    pole: 3, poleWaehlbar: true, kinder: false, durchgang: false, symbol: 'spd',
    params: [{ key: 'spdtyp', label: 'Typ', art: 'auswahl', optionen: ['1+2', '2', '3'], standard: '1+2' }],
    kurz: (p) => `SPD Typ ${n(p.spdtyp)}`,
  },
  {
    typ: 'wechselrichter', daten: true, label: 'PV-Wechselrichter', kategorie: 'Erzeugung', bmk: 'TB', farbe: '#16a34a',
    pole: 3, poleWaehlbar: true, kinder: true, durchgang: false, symbol: 'wechselrichter',
    params: [
      { key: 'leistung', label: 'AC-Leistung', art: 'zahl', einheit: 'kW', standard: 10 },
      { key: 'modell', label: 'Typ/Modell', art: 'text', standard: '' },
      { key: 'hybrid', label: 'Hybrid (Speicher)', art: 'bool', standard: false },
    ],
    kurz: (p) => `${n(p.leistung)} kW${p.modell ? ' ' + p.modell : ''}`,
  },
  {
    typ: 'pv_generator', pa: true, label: 'PV-Generator', kategorie: 'Erzeugung', bmk: 'GC', farbe: '#22c55e',
    pole: 1, poleWaehlbar: false, kinder: false, dc: true, durchgang: false, symbol: 'pvgen',
    params: [
      { key: 'leistung', label: 'Leistung', art: 'zahl', einheit: 'kWp', standard: 9.9 },
      { key: 'module', label: 'Module', art: 'zahl', standard: 22 },
      { key: 'strings', label: 'Strings', art: 'zahl', standard: 2 },
    ],
    kurz: (p) => `${n(p.leistung)} kWp, ${n(p.module)} Mod.`,
  },
  {
    typ: 'speicher', daten: true, label: 'Batteriespeicher', kategorie: 'Erzeugung', bmk: 'CC', farbe: '#14b8a6',
    pole: 3, poleWaehlbar: true, kinder: false, durchgang: false, symbol: 'speicher',
    params: [
      { key: 'kapazitaet', label: 'Kapazität', art: 'zahl', einheit: 'kWh', standard: 10 },
      { key: 'leistung', label: 'Leistung', art: 'zahl', einheit: 'kW', standard: 5 },
    ],
    kurz: (p) => `${n(p.kapazitaet)} kWh`,
  },
  {
    typ: 'wallbox', daten: true, label: 'Wallbox', kategorie: 'Verbraucher', bmk: 'XD', farbe: '#2563eb',
    pole: 3, poleWaehlbar: true, kinder: false, durchgang: false, symbol: 'wallbox',
    params: [
      { key: 'leistung', label: 'Leistung', art: 'zahl', einheit: 'kW', standard: 11 },
      { key: 'steuerbar', label: 'steuerbar §14a EnWG', art: 'bool', standard: true },
    ],
    kurz: (p) => `${n(p.leistung)} kW${p.steuerbar ? ' §14a' : ''}`,
  },
  {
    typ: 'waermepumpe', daten: true, label: 'Wärmepumpe', kategorie: 'Verbraucher', bmk: 'EG', farbe: '#0891b2',
    pole: 3, poleWaehlbar: true, kinder: false, durchgang: false, symbol: 'waermepumpe',
    params: [
      { key: 'leistung', label: 'el. Leistung', art: 'zahl', einheit: 'kW', standard: 4 },
      { key: 'steuerbar', label: 'steuerbar §14a EnWG', art: 'bool', standard: true },
    ],
    kurz: (p) => `${n(p.leistung)} kW${p.steuerbar ? ' §14a' : ''}`,
  },
  {
    typ: 'verbraucher', label: 'Verbraucher / Stromkreis', kategorie: 'Verbraucher', bmk: 'XD', farbe: '#475569',
    pole: 1, poleWaehlbar: true, kinder: false, durchgang: false, symbol: 'verbraucher',
    params: [
      { key: 'verwendung', label: 'Verwendung', art: 'auswahl', frei: true, optionen: Object.keys(VERWENDUNG), standard: 'Steckdosen' },
      { key: 'leistung', label: 'Leistung', art: 'zahl', einheit: 'kW', standard: '' },
    ],
    bmkAus: (p) => (Object.hasOwn(VERWENDUNG, String(p.verwendung)) ? VERWENDUNG[String(p.verwendung)] : 'XD'),
    kurz: (p) => (p.leistung ? `${p.leistung} kW` : ''),
  },
  {
    typ: 'steuerbox', daten: true, label: 'Steuerbox / Steuergerät', kategorie: 'Sonstiges', bmk: 'KE', farbe: '#64748b',
    pole: 1, poleWaehlbar: false, kinder: false, durchgang: false, symbol: 'steuerbox',
    params: [{ key: 'art', label: 'Art', art: 'auswahl', optionen: ['FNN-Steuerbox', 'Rundsteuerempfänger'], standard: 'FNN-Steuerbox' }],
    kurz: (p) => n(p.art),
  },
  {
    typ: 'smgw', daten: true, label: 'Smart-Meter-Gateway', kategorie: 'Sonstiges', bmk: 'KE', farbe: '#475569',
    pole: 1, poleWaehlbar: false, kinder: false, durchgang: false, symbol: 'smgw',
    params: [{ key: 'modell', label: 'Typ/Modell', art: 'text', standard: '' }],
    kurz: (p) => n(p.modell) || 'SMGW',
  },
  {
    typ: 'messumformer', daten: true, label: 'Messumformer', kategorie: 'Sonstiges', bmk: 'TF', farbe: '#0369a1',
    // Quelle = Hilfsspannung (z. B. über LS); Messspannung, Wandlerströme und Ausgänge als Verbindungen
    pole: 1, poleWaehlbar: true, kinder: false, durchgang: false, symbol: 'messumformer',
    params: [
      { key: 'modell', label: 'Typ/Modell', art: 'text', standard: '' },
      { key: 'eingang', label: 'Stromeingang', art: 'auswahl', frei: true, optionen: ['1 A', '5 A'], standard: '5 A' },
      { key: 'ausgang', label: 'Ausgang', art: 'auswahl', frei: true, optionen: ['4...20 mA', '0...20 mA', '0...10 V'], standard: '4...20 mA' },
      // Anschlüsse „Name:Klemmen“, durch Komma getrennt; UH = Hilfsspannung (an der Zuleitung angeschrieben)
      { key: 'anschluesse', label: 'Anschlüsse', art: 'text', standard: 'UH:17/18, U-L1:2, U-L2:5, U-L3:8, U-N:11, I-L1:1/3, I-L2:4/6, I-L3:7/9, out1:20/21, out2:23/24, out3:26/27, out4:29/30, G1:12/13, G2:14/15' },
      { key: 'ort', label: 'Einbauort', art: 'text', standard: '' },
    ],
    kurz: (p) => `${n(p.modell)}${p.ausgang ? ' ' + p.ausgang : ''}`.trim(),
  },
  {
    typ: 'fernwirk', daten: true, label: 'Fernwirktechnik (RTU)', kategorie: 'Sonstiges', bmk: 'KE', farbe: '#334155',
    pole: 1, poleWaehlbar: true, kinder: false, durchgang: false, symbol: 'fernwirk',
    params: [
      { key: 'modell', label: 'Typ/Modell', art: 'text', standard: '' },
      { key: 'betreiber', label: 'Betreiber', art: 'text', standard: 'Netzbetreiber' },
      { key: 'anschluesse', label: 'Anschlüsse', art: 'text', standard: '' },
      { key: 'ort', label: 'Einbauort', art: 'text', standard: '' },
    ],
    kurz: (p) => n(p.modell) || 'Fernwirktechnik',
  },
  {
    typ: 'klemmleiste', daten: true, hilfs: true, label: 'Klemmleiste (Reihen-/Prüfklemmen)', kategorie: 'Sonstiges', bmk: 'XD', farbe: '#57534e',
    pole: 1, poleWaehlbar: false, kinder: false, durchgang: false, symbol: 'klemmleiste',
    params: [
      { key: 'art', label: 'Art', art: 'auswahl', optionen: ['Reihenklemmen', 'Prüfklemmleiste', 'Trennklemmen'], standard: 'Reihenklemmen' },
      { key: 'klemmen', label: 'Klemmenanzahl', art: 'zahl', standard: 7 },
      // Klemmenbezeichnungen, durch Komma getrennt, z. B. "1S1, 1S2, 2S1, 2S2, 3S1, 3S2, PE"
      { key: 'belegung', label: 'Belegung', art: 'text', standard: '' },
      { key: 'ort', label: 'Einbauort', art: 'text', standard: '' },
    ],
    kurz: (p) => `${p.art === 'Prüfklemmleiste' ? 'Prüfklemmen' : p.art === 'Trennklemmen' ? 'Trennklemmen' : 'Klemmen'} 1...${n(p.klemmen) || '?'}`,
  },
  {
    typ: 'sammelschiene', pa: true, label: 'Sammelschiene', kategorie: 'Sonstiges', bmk: 'WD', farbe: '#1e293b',
    pole: 3, poleWaehlbar: false, kinder: true, durchgang: true, symbol: 'schiene',
    params: [
      { key: 'nennstrom', label: 'Bemessungsstrom', art: 'zahl', einheit: 'A', standard: 63 },
      { key: 'querschnitt', label: 'Schienenquerschnitt', art: 'text', standard: '12x5' },
    ],
    kurz: (p) => `Sammelschiene${p.nennstrom ? ' ' + p.nennstrom + 'A' : ''}${p.querschnitt ? ' ' + p.querschnitt : ''}`,
  },
  {
    typ: 'unterverteilung', pa: true, label: 'Unterverteilung', kategorie: 'Sonstiges', bmk: 'UC', farbe: '#334155',
    pole: 3, poleWaehlbar: true, kinder: true, durchgang: true, symbol: 'verteiler',
    params: [{ key: 'ort', label: 'Ort', art: 'text', standard: '' }],
    kurz: (p) => n(p.ort),
  },
  {
    typ: 'pas', pa: true, potential: true, label: 'Potentialausgleichsschiene (PAS)', kategorie: 'Einspeisung', bmk: 'PAS', farbe: '#2e9e3e',
    pole: 1, poleWaehlbar: false, kinder: false, durchgang: false, symbol: 'pas',
    params: [
      { key: 'erder', label: 'Erder', art: 'auswahl', optionen: ['Fundamenterder', 'Ringerder', 'Tiefenerder', 'ohne'], standard: 'Fundamenterder' },
      { key: 'querschnitt', label: 'Erdungsleiter', art: 'text', einheit: 'mm²', standard: '' },
    ],
    kurz: (p) => `PAS${p.erder && p.erder !== 'ohne' ? ', ' + p.erder : ''}`,
  },
]

export const TYPEN: Record<string, TypDef> = Object.fromEntries(BIBLIOTHEK.map((t) => [t.typ, t]))

export function typDef(typ: string): TypDef {
  return TYPEN[typ] ?? {
    typ, label: `Unbekannt (${typ})`, kategorie: 'Sonstiges', bmk: 'X', farbe: '#9ca3af',
    pole: 1, poleWaehlbar: true, kinder: true, durchgang: false, symbol: 'verbraucher', params: [],
  }
}

export function standardParams(typ: string): Record<string, ParamWert> {
  const out: Record<string, ParamWert> = {}
  for (const p of typDef(typ).params) if (p.standard !== undefined && p.standard !== '') out[p.key] = p.standard
  return out
}

/** Kennbuchstaben einer Komponente (berücksichtigt parameterabhängige Zuordnung) */
export function kennbuchstaben(typ: string, params?: Record<string, ParamWert>): string {
  const d = typDef(typ)
  return d.bmkAus ? d.bmkAus({ ...standardParams(typ), ...(params ?? {}) }) : d.bmk
}
