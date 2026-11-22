/** Leiterbezeichnungen */
export type Leiter = 'L1' | 'L2' | 'L3' | 'N' | 'PE'
export type Phase = 'L1' | 'L2' | 'L3'
export type Netzform = 'TN-C-S' | 'TN-S' | 'TT'

export type ParamWert = string | number | boolean

export interface Produkt {
  hersteller?: string
  artikel?: string
}

export interface Kabel {
  typ?: string
  querschnitt?: string
  laenge?: number
}

/** Ein Betriebsmittel im Projekt. Die Topologie ist ein Baum: jede Komponente
 * (außer dem Hausanschluss) hat genau eine `quelle` (vorgeschaltete Komponente). */
export interface Komponente {
  id: string
  /** ID festgeschrieben: „Neu nummerieren“ lässt sie unverändert */
  fest?: boolean
  typ: string
  name?: string
  quelle?: string
  /** 1 = einphasig, 3 = dreiphasig. Wird ohne Angabe aus Bibliothek bzw. Quelle abgeleitet.
   * Schaltgeräte mit schaltbarem N (Lasttrennschalter): 2 = L+N, 4 = L1–L3+N. */
  pole?: 1 | 2 | 3 | 4
  /** Bei 2-/4-polig: N-Kontakt voreilend (schließt vor den Außenleitern, öffnet nach ihnen) */
  voreilend?: boolean
  /** Phase bei einphasigen Komponenten */
  phase?: Phase
  kabel?: Kabel
  /** Verwendetes Produkt */
  produkt?: Produkt
  params?: Record<string, ParamWert>
}

export interface ProjektInfo {
  titel?: string
  kunde?: string
  adresse?: string
  ersteller?: string
  datum?: string
  zeichnungsnummer?: string
  revision?: string
}

/** Informations-/Kommunikationsverbindung (z.B. SMGW–Zähler über LMN) */
export interface Datenverbindung {
  von: string
  nach: string
  art?: string
  /** Leitungsart: Daten-/Steuerleitung (Standard), Wandler-Messleitung (Sekundärkreis eines
   *  Stromwandlers) oder Analogsignal (z. B. 4...20 mA zur Fernwirktechnik) */
  typ?: Leitungstyp
  /** Kabel dieser Verbindung, z. B. "Ölflex Classic 110 7G1,5" (wird an der Leitung angeschrieben) */
  kabel?: string
  /** Anschlussklemmen am Gerät `von` bzw. `nach`, z. B. "1/3" oder "out1" (siehe Parameter `anschluesse`) */
  klemmeVon?: string
  klemmeNach?: string
}

/** daten: Daten-/Steuerleitung, wandler: Stromwandler-Sekundärkreis (k/l), spannung: Messspannung
 *  (Spannungspfad eines Zählers/Messumformers), analog: Analogsignal (z. B. 4...20 mA) */
export type Leitungstyp = 'daten' | 'wandler' | 'spannung' | 'analog'
export const LEITUNGSTYPEN: Leitungstyp[] = ['daten', 'wandler', 'spannung', 'analog']
export const LEITUNGSTYP_NAME: Record<Leitungstyp, string> = { daten: 'Daten/Steuerung', wandler: 'Wandler-Messleitung', spannung: 'Messspannung', analog: 'Analogsignal' }

/** Potentialausgleichsverbindung (z.B. PAS–HAK), getrennt von den Stromleitungen */
export interface PaVerbindung {
  von: string
  nach: string
  /** Leiterquerschnitt, z.B. "16" (mm²) */
  querschnitt?: string
}

export interface Projekt {
  projekt: ProjektInfo
  netz: { form: Netzform; spannung?: string }
  komponenten: Komponente[]
  datenverbindungen?: Datenverbindung[]
  potentialausgleich?: PaVerbindung[]
  /** Positionen im Node-Editor, rein visuell */
  editor?: Record<string, { x: number; y: number }>
}
