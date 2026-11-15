/** Leiterbezeichnungen */
export type Leiter = 'L1' | 'L2' | 'L3' | 'N' | 'PE'
export type Phase = 'L1' | 'L2' | 'L3'
export type Netzform = 'TN-C-S' | 'TN-S' | 'TT'

export type ParamWert = string | number | boolean

export interface Kabel {
  typ?: string
  querschnitt?: string
  laenge?: number
}

/** Ein Betriebsmittel im Projekt. Die Topologie ist ein Baum: jede Komponente
 * (außer dem Hausanschluss) hat genau eine `quelle` (vorgeschaltete Komponente). */
export interface Komponente {
  id: string
  typ: string
  name?: string
  quelle?: string
  /** 1 = einphasig, 3 = dreiphasig. Wird ohne Angabe aus Bibliothek bzw. Quelle abgeleitet. */
  pole?: 1 | 3
  /** Phase bei einphasigen Komponenten */
  phase?: Phase
  kabel?: Kabel
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
}

export interface Projekt {
  projekt: ProjektInfo
  netz: { form: Netzform; spannung?: string }
  komponenten: Komponente[]
  datenverbindungen?: Datenverbindung[]
  /** Positionen im Node-Editor, rein visuell */
  editor?: Record<string, { x: number; y: number }>
}
