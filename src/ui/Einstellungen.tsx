import { useEffect, useRef, useState } from 'react'
import { LOGO_TYPEN, logoAusDatei, logoSetzen, useLogo } from '../einstellungen/logo'

interface Props {
  onSchliessen(): void
}

/** App-Einstellungen; gelten für alle Projekte und liegen nur in diesem Browser. */
export function Einstellungen({ onSchliessen }: Props) {
  const logo = useLogo()
  const [fehler, setFehler] = useState<string>()
  const [laedt, setLaedt] = useState(false)
  const eingabe = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') onSchliessen() }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [onSchliessen])

  const gewaehlt = async (f: File | undefined) => {
    if (!f) return
    setFehler(undefined)
    setLaedt(true)
    try {
      logoSetzen(await logoAusDatei(f))
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setLaedt(false)
      if (eingabe.current) eingabe.current.value = ''
    }
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
            Das Logo wird nur in diesem Browser gespeichert, gilt für alle Projekte und wird nicht hochgeladen.
          </p>
          <div className="logo-vorschau">
            {logo ? <img src={logo.daten} alt="Logo" /> : <span>Kein Logo hinterlegt</span>}
          </div>
          {logo && <div className="dialog-hinweis">{logo.name}</div>}
          <div className="dialog-knoepfe">
            <input ref={eingabe} type="file" accept={[...LOGO_TYPEN, '.svg', '.png', '.jpg', '.jpeg'].join(',')} hidden onChange={(e) => void gewaehlt(e.target.files?.[0])} />
            <button className="primaer" onClick={() => eingabe.current?.click()} disabled={laedt}>{laedt ? 'Lese…' : logo ? 'Anderes Logo wählen…' : 'Logo wählen…'}</button>
            {logo && <button onClick={() => { setFehler(undefined); logoSetzen(undefined) }}>Logo entfernen</button>}
          </div>
          {fehler && <div className="dialog-fehler">{fehler}</div>}
        </section>
      </div>
    </div>
  )
}
