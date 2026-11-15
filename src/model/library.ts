import type { ParamWert } from './types'

export type SymbolArt =
  | 'hak' | 'zaehler' | 'sls' | 'trenner' | 'sicherung' | 'ls' | 'rcd' | 'rcbo' | 'spd'
  | 'wechselrichter' | 'pvgen' | 'speicher' | 'wallbox' | 'waermepumpe' | 'verbraucher'
  | 'steuerbox' | 'smgw' | 'verteiler' | 'klemme' | 'schiene' | 'pas'

export interface ParamDef {
  key: string
  label: string
  art: 'zahl' | 'text' | 'auswahl' | 'bool'
  einheit?: string
  optionen?: string[]
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
  /** Kurzbeschriftung im Plan aus den Parametern */
  kurz?: (p: Record<string, ParamWert>) => string
}

const n = (v: ParamWert | undefined) => (v === undefined || v === '' ? '' : String(v))

/** Verbraucher-Stromkreise: Kennbuchstaben nach Verwendung (IEC 81346-2:2019) */
export const VERWENDUNG: Record<string, string> = {
  Steckdosen: 'XD',   // Verbinden (Niederspannung)
  Beleuchtung: 'EA',  // Licht erzeugen
  'Heizung/Herd': 'EB', // elektrisch heizen
  'Motor/Antrieb': 'MA', // elektrischer Antrieb
}

export const BIBLIOTHEK: TypDef[] = [
  {
    typ: 'hausanschluss', pa: true, label: 'Hausanschluss (HAK)', kategorie: 'Einspeisung', bmk: 'XD', farbe: '#6b7280',
    pole: 3, poleWaehlbar: false, kinder: true, wurzel: true, durchgang: true, symbol: 'hak',
    params: [
      { key: 'sicherung', label: 'Vorsicherung', art: 'zahl', einheit: 'A', standard: 63 },
      { key: 'sicherungstyp', label: 'Sicherungstyp', art: 'auswahl', optionen: ['NH00 gG', 'NH1 gG', 'D02 gG'], standard: 'NH00 gG' },
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
    ],
    kurz: (p) => `${n(p.art)}${p.zaehlernummer ? ' ' + p.zaehlernummer : ''}`,
  },
  {
    typ: 'sls', label: 'SLS-Schalter', kategorie: 'Schutz', bmk: 'FC', farbe: '#ef4444',
    pole: 3, poleWaehlbar: false, kinder: true, durchgang: true, symbol: 'sls',
    params: [{ key: 'nennstrom', label: 'Nennstrom', art: 'zahl', einheit: 'A', standard: 35 }],
    kurz: (p) => `SLS E ${n(p.nennstrom)}A`,
  },
  {
    typ: 'trennschalter', label: 'Lasttrennschalter', kategorie: 'Schutz', bmk: 'QB', farbe: '#f97316',
    pole: 3, poleWaehlbar: true, kinder: true, durchgang: true, symbol: 'trenner',
    params: [{ key: 'nennstrom', label: 'Nennstrom', art: 'zahl', einheit: 'A', standard: 63 }],
    kurz: (p) => `${n(p.nennstrom)}A`,
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
      { key: 'verwendung', label: 'Verwendung', art: 'auswahl', optionen: Object.keys(VERWENDUNG), standard: 'Steckdosen' },
      { key: 'leistung', label: 'Leistung', art: 'zahl', einheit: 'kW', standard: '' },
    ],
    bmkAus: (p) => VERWENDUNG[String(p.verwendung)] ?? 'XD',
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
    typ: 'pas', pa: true, potential: true, label: 'Potentialausgleichsschiene (PAS)', kategorie: 'Einspeisung', bmk: 'XE', farbe: '#2e9e3e',
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
