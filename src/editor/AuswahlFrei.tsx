import { useState } from 'react'

/** Wert der Auswahl-Option „Eigener …“ (kann nicht mit einem echten Wert kollidieren) */
const FREITEXT = '\u0000freitext'

interface Props {
  titel: string
  wert: string
  optionen: string[]
  /** Vorgegebene Werte; alles andere gilt als eigener Text und steht im Freitextfeld (Standard: optionen) */
  standard?: string[]
  onAendern: (wert: string | undefined) => void
  /** Wird beim Verlassen des Freitextfelds mit dem eingegebenen Text aufgerufen */
  onFertig?: (wert: string) => void
  freitextLabel?: string
  platzhalter?: string
}

/**
 * Auswahlliste mit vorgegebenen Werten und „Eigener …“-Eintrag, der ein
 * Freitextfeld öffnet. Eigene Werte (nicht in `standard`, z. B. aus dem YAML)
 * stehen im Freitextfeld. Beim Wechsel der Komponente per `key` neu
 * einhängen, damit der Freitext-Modus nicht mitwandert.
 */
export function AuswahlFrei({ titel, wert, optionen, onAendern, onFertig, standard = optionen, freitextLabel = 'Eigener Text …', platzhalter }: Props) {
  const [frei, setFrei] = useState(false)
  const istEigen = wert !== '' && !standard.includes(wert)
  const feld = istEigen || frei
  return (
    <label>{titel}
      <select
        value={feld && !istEigen ? FREITEXT : wert}
        onChange={(e) => {
          const v = e.target.value
          setFrei(v === FREITEXT)
          onAendern(v === FREITEXT || v === '' ? undefined : v)
        }}
      >
        <option value="">–</option>
        {optionen.map((o) => <option key={o}>{o}</option>)}
        <option value={FREITEXT}>{freitextLabel}</option>
      </select>
      {feld && (
        <input
          autoFocus={!istEigen}
          value={wert}
          placeholder={platzhalter}
          onChange={(e) => onAendern(e.target.value)}
          onBlur={(e) => onFertig?.(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onFertig?.(e.currentTarget.value) }}
        />
      )}
    </label>
  )
}
