import { useEffect, useRef, useState } from 'react'
import { LOGO_TYPEN, logoAusDatei, logoSetzen, useLogo } from '../einstellungen/logo'
import { kabelWertVergessen, useKabelWerte } from '../einstellungen/kabelwerte'

interface Props {
  onSchliessen(): void
}

/** App-Einstellungen; gelten für alle Projekte und liegen nur in diesem Browser. */
export function Einstellungen({ onSchliessen }: Props) {
  const logo = useLogo()
  const kabelWerte = useKabelWerte()
  const [kabelFehler, setKabelFehler] = useState<string>()
  const [fehler, setFehler] = useState<string>()
  const [laedt, setLaedt] = useState(false)
  const eingabe = useRef<HTMLInputElement>(null)
  /** zählt Aktionen hoch; ein noch laufendes Einlesen wird verworfen, wenn inzwischen etwas Neueres passiert ist */
  const aktion = useRef(0)

  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') onSchliessen() }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [onSchliessen])

  const gewaehlt = async (f: File | undefined) => {
    if (!f) return
    const nr = ++aktion.current
    setFehler(undefined)
    setLaedt(true)
    try {
      const l = await logoAusDatei(f)
      if (nr === aktion.current) await logoSetzen(l)
    } catch (e) {
      if (nr === aktion.current) setFehler((e as Error).message)
    } finally {
      if (nr === aktion.current) setLaedt(false)
      if (eingabe.current) eingabe.current.value = ''
    }
  }

  const abbrechen = () => {
    ++aktion.current
    setLaedt(false)
  }

  const entfernen = async () => {
    abbrechen()
    setFehler(undefined)
    try { await logoSetzen(undefined) } catch (e) { setFehler((e as Error).message) }
  }

  return (
    <div className="dialog-hintergrund" onMouseDown={(e) => { if (e.target === e.currentTarget) onSchliessen() }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="einstellungen-titel">
        <div className="dialog-kopf">
          <h2 id="einstellungen-titel">Einstellungen</h2>
          <button className="dialog-zu" onClick={onSchliessen} title="Schließen (Esc)" aria-label="Schließen">×</button>
        </div>
        <section className="dialog-abschnitt">
          <h3>Logo im Schriftfeld</h3>
          <p className="dialog-hinweis">
            Erscheint im Schriftfeld jedes Blatts sowie im SVG- und PDF-Export. PNG, JPG oder SVG (SVG bleibt im PDF vektoriell).
            Das Logo wird nur in diesem Browser gespeichert (getrennt vom Projektentwurf), gilt für alle Projekte und wird nicht hochgeladen.
          </p>
          <div className="logo-vorschau">
            {logo ? <img src={logo.daten} alt="Logo" /> : <span>Kein Logo hinterlegt</span>}
          </div>
          {logo && <div className="dialog-hinweis">{logo.name}</div>}
          <div className="dialog-knoepfe">
            <input ref={eingabe} type="file" accept={[...LOGO_TYPEN, '.svg', '.png', '.jpg', '.jpeg'].join(',')} hidden onChange={(e) => void gewaehlt(e.target.files?.[0])} />
            <button className="primaer" onClick={() => eingabe.current?.click()} disabled={laedt}>{laedt ? 'Lese…' : logo ? 'Anderes Logo wählen…' : 'Logo wählen…'}</button>
            {laedt ? <button onClick={abbrechen}>Abbrechen</button> : logo && <button onClick={() => void entfernen()}>Logo entfernen</button>}
          </div>
          {fehler && <div className="dialog-fehler">{fehler}</div>}
        </section>
        <section className="dialog-abschnitt">
          <h3>Eigene Kabeltypen und Querschnitte</h3>
          <p className="dialog-hinweis">
            Werte, die unter „Zuleitung“ als eigener Typ oder Querschnitt eingegeben wurden. Sie stehen in allen Projekten zur Auswahl
            und liegen nur in diesem Browser. Entfernen ändert keine bestehenden Projekte.
          </p>
          {(['typ', 'querschnitt'] as const).map((feld) => (
            <div key={feld} className="kabelwerte">
              <div className="kabelwerte-titel">{feld === 'typ' ? 'Kabeltypen' : 'Querschnitte'}</div>
              {kabelWerte[feld].length === 0 ? <span className="dialog-hinweis">keine</span> : kabelWerte[feld].map((w) => (
                <span key={w} className="kabelwert">
                  {w}
                  <button className="icon-btn" title={`„${w}“ entfernen`} aria-label={`${w} entfernen`} onClick={() => { setKabelFehler(undefined); kabelWertVergessen(feld, w).catch((e: Error) => setKabelFehler(e.message)) }}>×</button>
                </span>
              ))}
            </div>
          ))}
          {kabelFehler && <div className="dialog-fehler">{kabelFehler}</div>}
        </section>
      </div>
    </div>
  )
}
