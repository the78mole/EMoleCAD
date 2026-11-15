import { useMemo, useState } from 'react'
import type { Analyse } from '../model/analyse'
import type { Projekt } from '../model/types'
import { erzeugeBlatt, VORLAGEN, type Blatt } from '../schematic/blatt'
import { zeichnePlan, type Anordnung, type Modus } from '../schematic/render'
import { dateiname, exportierePdf, herunterladen } from './export'

interface Props {
  projekt: Projekt
  analyse: Analyse
  onEinklappen: () => void
}

export interface DarstellungsOptionen {
  vorlage: string
  farbig: boolean
  anordnung: Anordnung
  tabelle: boolean
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

export function erzeugeBlaetter(projekt: Projekt, analyse: Analyse, d: DarstellungsOptionen, modi: Modus[]): Blatt[] {
  const v = VORLAGEN.find((x) => x.id === d.vorlage) ?? VORLAGEN[0]
  return modi.map((m, i) =>
    erzeugeBlatt(zeichnePlan(analyse, { modus: m, farbig: d.farbig, netz: projekt.netz, anordnung: d.anordnung, tabelle: d.tabelle }), projekt, m, v, i + 1, modi.length, d.farbig),
  )
}

export function PlanAnsicht({ projekt, analyse, onEinklappen }: Props) {
  const [modus, setModus] = useState<Modus>(() => lese('molecad.modus', 'einpolig'))
  const [vorlage, setVorlage] = useState<string>(() => lese('molecad.vorlage', 'a3'))
  const [farbig, setFarbig] = useState<boolean>(() => lese('molecad.farbig', true))
  const [anordnung, setAnordnung] = useState<Anordnung>(() => lese('molecad.anordnung', 'hager'))
  const [tabelle, setTabelle] = useState<boolean>(() => lese('molecad.tabelle', true))
  const d: DarstellungsOptionen = { vorlage, farbig, anordnung, tabelle }
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [exportiert, setExportiert] = useState(false)

  const blatt = useMemo(() => erzeugeBlaetter(projekt, analyse, { vorlage, farbig, anordnung, tabelle }, [modus])[0], [projekt, analyse, vorlage, farbig, anordnung, tabelle, modus])

  const pdf = async (beide: boolean) => {
    setExportiert(true)
    try {
      const blaetter = erzeugeBlaetter(projekt, analyse, d, beide ? ['einpolig', 'allpolig'] : [modus])
      await exportierePdf(blaetter, dateiname(projekt.projekt.titel, 'pdf'))
    } catch (e) {
      alert('PDF-Export fehlgeschlagen: ' + (e as Error).message)
    } finally {
      setExportiert(false)
    }
  }

  const stilBreite = zoom === 'fit' ? `min(100%, calc((100vh - 140px) * ${(blatt.breite / blatt.hoehe).toFixed(4)}))` : `${blatt.breite * 3.78 * zoom}px`

  return (
    <section className="plan">
      <div className="plan-leiste">
        <button className="einklappen" onClick={onEinklappen} title="Plan einklappen (Editor bekommt die volle Breite)">Einklappen ▸</button>
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
        <select value={anordnung} onChange={(e) => { const v = e.target.value as Anordnung; setAnordnung(v); schreibe('molecad.anordnung', v) }} title="Anordnung des Plans">
          <option value="hager">Einspeisung links, Spalten</option>
          <option value="baum">Baum von oben</option>
        </select>
        {anordnung === 'hager' && (
          <label className="check" title="Stromkreistabelle unter dem Plan">
            <input type="checkbox" checked={tabelle} onChange={(e) => { setTabelle(e.target.checked); schreibe('molecad.tabelle', e.target.checked) }} /> Tabelle
          </label>
        )}
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
