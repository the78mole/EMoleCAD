import { useMemo, useState } from 'react'
import type { Analyse } from '../model/analyse'
import type { Projekt } from '../model/types'
import { erzeugeBlatt, VORLAGEN, type Blatt } from '../schematic/blatt'
import { zeichnePlan, type Modus } from '../schematic/render'
import { dateiname, exportierePdf, herunterladen } from './export'

interface Props {
  projekt: Projekt
  analyse: Analyse
}

function lese<T>(key: string, std: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : std
  } catch {
    return std
  }
}
function schreibe(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* egal */ }
}

export function erzeugeBlaetter(projekt: Projekt, analyse: Analyse, vorlageId: string, farbig: boolean, modi: Modus[]): Blatt[] {
  const v = VORLAGEN.find((x) => x.id === vorlageId) ?? VORLAGEN[0]
  return modi.map((m, i) => erzeugeBlatt(zeichnePlan(analyse, { modus: m, farbig, netz: projekt.netz }), projekt, m, v, i + 1, modi.length, farbig))
}

export function PlanAnsicht({ projekt, analyse }: Props) {
  const [modus, setModus] = useState<Modus>(() => lese('molecad.modus', 'einpolig'))
  const [vorlage, setVorlage] = useState<string>(() => lese('molecad.vorlage', 'a3'))
  const [farbig, setFarbig] = useState<boolean>(() => lese('molecad.farbig', true))
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [exportiert, setExportiert] = useState(false)

  const blatt = useMemo(() => erzeugeBlaetter(projekt, analyse, vorlage, farbig, [modus])[0], [projekt, analyse, vorlage, farbig, modus])

  const pdf = async (beide: boolean) => {
    setExportiert(true)
    try {
      const blaetter = erzeugeBlaetter(projekt, analyse, vorlage, farbig, beide ? ['einpolig', 'allpolig'] : [modus])
      await exportierePdf(blaetter, dateiname(projekt.projekt.titel, 'pdf'))
    } catch (e) {
      alert('PDF-Export fehlgeschlagen: ' + (e as Error).message)
    } finally {
      setExportiert(false)
    }
  }

  const stilBreite = zoom === 'fit' ? '100%' : `${blatt.breite * 3.78 * zoom}px`

  return (
    <section className="plan">
      <div className="plan-leiste">
        <div className="segment">
          {(['einpolig', 'allpolig'] as Modus[]).map((m) => (
            <button key={m} className={m === modus ? 'aktiv' : ''} onClick={() => { setModus(m); schreibe('molecad.modus', m) }}>
              {m === 'einpolig' ? 'Einpolig' : 'Allpolig'}
            </button>
          ))}
        </div>
        <select value={vorlage} onChange={(e) => { setVorlage(e.target.value); schreibe('molecad.vorlage', e.target.value) }} title="Blattvorlage">
          {VORLAGEN.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <label className="check" title="Leiterfarben im allpoligen Plan">
          <input type="checkbox" checked={farbig} onChange={(e) => { setFarbig(e.target.checked); schreibe('molecad.farbig', e.target.checked) }} /> Farbig
        </label>
        <div className="segment klein">
          <button onClick={() => setZoom((z) => Math.max(0.25, (z === 'fit' ? 0.5 : z) / 1.25))} title="Verkleinern">−</button>
          <button className={zoom === 'fit' ? 'aktiv' : ''} onClick={() => setZoom('fit')} title="Einpassen">Fit</button>
          <button onClick={() => setZoom((z) => Math.min(4, (z === 'fit' ? 0.5 : z) * 1.25))} title="Vergrößern">+</button>
        </div>
        <span className="spacer" />
        <button onClick={() => herunterladen(blatt.svg, dateiname(projekt.projekt.titel + '_' + modus, 'svg'), 'image/svg+xml')}>SVG</button>
        <button onClick={() => pdf(false)} disabled={exportiert}>PDF</button>
        <button className="primaer" onClick={() => pdf(true)} disabled={exportiert}>{exportiert ? 'Exportiere…' : 'PDF (beide Pläne)'}</button>
      </div>
      <div className="plan-flaeche">
        <div className="blatt" style={{ width: stilBreite }} dangerouslySetInnerHTML={{ __html: blatt.svg.replace(/width="[^"]*mm" height="[^"]*mm"/, 'width="100%"') }} />
      </div>
    </section>
  )
}
