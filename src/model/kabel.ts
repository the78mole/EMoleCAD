import type { Kabel } from './types'

export type KabelFeld = 'typ' | 'querschnitt'

/** Standardauswahl für die Zuleitung im Eigenschaften-Panel */
export const KABEL_STANDARD: Record<KabelFeld, string[]> = {
  typ: ['NYM-J', 'H07V-K', 'H07V-U', 'H07RN-F', 'YSLY-JB', 'ÖLFLEX'],
  querschnitt: ['3G1,5', '5G1,5', '5G2,5', '5G4', '5G6', '5G16'],
}

/**
 * Auswahlliste für Kabeltyp bzw. Querschnitt: erst die Standardwerte, dann
 * eigene Werte (im Browser gespeicherte und im Projekt verwendete), alphabetisch
 * und ohne Doppelte.
 */
export function kabelOptionen(feld: KabelFeld, komponenten: { kabel?: Kabel }[], gespeichert: readonly string[] = []): string[] {
  const fest = KABEL_STANDARD[feld]
  const eigene = new Set<string>()
  // Werte unverändert übernehmen (auch mit Leerzeichen), damit die Auswahl den Projektwert genau trifft
  const dazu = (w: string | undefined) => {
    if (w && w.trim() && !fest.includes(w)) eigene.add(w)
  }
  gespeichert.forEach(dazu)
  for (const k of komponenten) dazu(k.kabel?.[feld])
  return [...fest, ...[...eigene].sort((a, b) => a.localeCompare(b, 'de'))]
}
