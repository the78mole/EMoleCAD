import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Analyse } from '../model/analyse'
import type { Projekt } from '../model/types'
import { erzeugeBlatt, VORLAGEN, type Blatt, type BlattLogo } from '../schematic/blatt'
import { useLogo } from '../einstellungen/logo'
import { zeichnePlaene } from '../schematic/blaetter'
import type { Anordnung, Modus } from '../schematic/render'
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
  /** Endstromkreise je Blatt: 'auto' richtet sich nach der Blattvorlage, 0 = unbegrenzt */
  abgaenge: number | 'auto'
  /** Logo im Schriftfeld (App-Einstellung) */
  logo?: BlattLogo
}

/** Endstromkreise je Blatt, bevor auf ein Folgeblatt umgebrochen wird */
const AUTO_ABGAENGE: Record<string, number> = { a3: 16, a3k: 16, a4: 10, a4k: 10, frei: 0 }
const ABGAENGE_WAHL = [6, 8, 10, 12, 16, 20, 24, 32]
const ZOOM_MIN = 0.1
const ZOOM_MAX = 4
/** Pixel je Millimeter bei Zoom 1 (96 dpi) */
const PX_JE_MM = 3.78

/** Zoomschritt je Wheel-Ereignis, gleich gerechnet wie im grafischen Editor (React Flow) */
function radFaktor(e: WheelEvent): number {
  const mac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
  const schritt = e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002
  return Math.pow(2, -e.deltaY * schritt * (mac ? 10 : 1))
}

// oxlint-disable-next-line react/only-export-components -- Hilfsfunktion; betrifft nur Fast Refresh im Entwicklungsserver
export function maxAbgaenge(d: Pick<DarstellungsOptionen, 'vorlage' | 'abgaenge'>): number {
  return d.abgaenge === 'auto' ? (AUTO_ABGAENGE[d.vorlage] ?? 16) : d.abgaenge
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

// oxlint-disable-next-line react/only-export-components -- Hilfsfunktion für den Export; betrifft nur Fast Refresh im Entwicklungsserver
export function erzeugeBlaetter(projekt: Projekt, analyse: Analyse, d: DarstellungsOptionen, modi: Modus[]): Blatt[] {
  const v = VORLAGEN.find((x) => x.id === d.vorlage) ?? VORLAGEN[0]
  // je Darstellung ggf. mehrere Blätter (weitere Zählerstränge, Folgeblätter); fortlaufend nummeriert
  const plaene: { m: Modus; plan: ReturnType<typeof zeichnePlaene>[number] }[] = []
  for (const m of modi) {
    const opt = { modus: m, farbig: d.farbig, netz: projekt.netz, anordnung: d.anordnung, tabelle: d.tabelle, maxAbgaenge: maxAbgaenge(d), daten: projekt.datenverbindungen, pa: projekt.potentialausgleich }
    for (const plan of zeichnePlaene(analyse, opt, plaene.length + 1, v)) plaene.push({ m, plan })
  }
  return plaene.map(({ m, plan }, i) => erzeugeBlatt(plan, projekt, m, v, i + 1, plaene.length, d.farbig, d.logo))
}

export function PlanAnsicht({ projekt, analyse, onEinklappen }: Props) {
  const [modus, setModus] = useState<Modus>(() => lese('molecad.modus', 'einpolig'))
  const [vorlage, setVorlage] = useState<string>(() => lese('molecad.vorlage', 'a3'))
  const [farbig, setFarbig] = useState<boolean>(() => lese('molecad.farbig', true))
  const [anordnung, setAnordnung] = useState<Anordnung>(() => lese('molecad.anordnung', 'hager'))
  const [tabelle, setTabelle] = useState<boolean>(() => lese('molecad.tabelle', true))
  const [abgaenge, setAbgaenge] = useState<number | 'auto'>(() => { const v = lese<unknown>('molecad.abgaenge', 'auto'); return typeof v === 'number' && v >= 0 ? v : 'auto' })
  const logo = useLogo()
  const d: DarstellungsOptionen = { vorlage, farbig, anordnung, tabelle, abgaenge, logo }
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [exportiert, setExportiert] = useState(false)

  const blaetter = useMemo(() => erzeugeBlaetter(projekt, analyse, { vorlage, farbig, anordnung, tabelle, abgaenge, logo }, [modus]), [projekt, analyse, vorlage, farbig, anordnung, tabelle, abgaenge, logo, modus])
  const [blattWahl, setBlattWahl] = useState(0)
  const blattNr = Math.min(blattWahl, blaetter.length - 1)
  const blatt = blaetter[blattNr]

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

  const stilBreite = zoom === 'fit' ? `min(100%, calc((100vh - 140px) * ${(blatt.breite / blatt.hoehe).toFixed(4)}))` : `${blatt.breite * PX_JE_MM * zoom}px`

  // Mausrad: Rad und Shift+Rad scrollen nativ (hoch/runter bzw. links/rechts);
  // Strg+Rad und Touchpad-Pinch zoomen zum Mauszeiger, statt den Browser zu zoomen
  const flaeche = useRef<HTMLDivElement>(null)
  const blattEl = useRef<HTMLDivElement>(null)
  const aktZoom = useRef<number | null>(null)
  const anker = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null)
  const breiteMm = useRef(blatt.breite)
  useEffect(() => { breiteMm.current = blatt.breite }, [blatt.breite])
  /** setzt den Zoom; die Ref ist sofort aktuell, damit schnelle Radschritte nicht auf einem alten Wert aufsetzen */
  const zoomSetzen = (z: number | 'fit') => {
    aktZoom.current = typeof z === 'number' ? z : null
    setZoom(z)
  }
  /** Untergrenze: ZOOM_MIN, aber nie größer als der aktuelle Zoom (Fit kann kleiner sein) */
  const begrenze = (z: number, alt: number) => Math.min(ZOOM_MAX, Math.max(Math.min(ZOOM_MIN, alt), z))
  /** tatsächlich dargestellter Zoom, auch bei „Fit“ */
  const istZoom = (): number => {
    if (aktZoom.current != null) return aktZoom.current
    const w = blattEl.current?.getBoundingClientRect().width
    return w ? w / (breiteMm.current * PX_JE_MM) : 0.5
  }
  useEffect(() => {
    const f = flaeche.current
    if (!f) return
    const onRad = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const b = blattEl.current
      if (!b) return
      const r = b.getBoundingClientRect()
      if (!r.width || !r.height) return
      const alt = istZoom()
      const neu = begrenze(alt * radFaktor(e), alt)
      if (neu === alt) return
      // Punkt unter dem Mauszeiger merken (relativ zum Blatt), damit er nach dem Zoomen dort bleibt
      if (!anker.current) anker.current = { x: e.clientX, y: e.clientY, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height }
      zoomSetzen(neu)
    }
    f.addEventListener('wheel', onRad, { passive: false })
    return () => f.removeEventListener('wheel', onRad)
  }, [])
  useLayoutEffect(() => {
    const a = anker.current
    const f = flaeche.current
    const b = blattEl.current
    anker.current = null
    if (!a || !f || !b) return
    const r = b.getBoundingClientRect()
    f.scrollLeft += r.left + a.fx * r.width - a.x
    f.scrollTop += r.top + a.fy * r.height - a.y
  }, [zoom])

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
        {anordnung === 'hager' && (
          <select value={String(abgaenge)} onChange={(e) => { const v = e.target.value === 'auto' ? 'auto' : Number(e.target.value); setAbgaenge(v); schreibe('molecad.abgaenge', v) }} title="Stromkreise je Blatt: Danach geht der Plan auf einem Folgeblatt weiter (umgebrochen wird an ganzen Teilbäumen, z.B. einem FI)">
            <option value="auto">Stromkreise/Blatt: auto ({maxAbgaenge({ vorlage, abgaenge: 'auto' }) || 'alle'})</option>
            {ABGAENGE_WAHL.map((n) => <option key={n} value={n}>{n} je Blatt</option>)}
            <option value="0">alle auf ein Blatt</option>
          </select>
        )}
        <label className="check" title="Leiterfarben im allpoligen Plan; im einpoligen Plan N/PE-Marken und Potentialausgleich grün">
          <input type="checkbox" checked={farbig} onChange={(e) => { setFarbig(e.target.checked); schreibe('molecad.farbig', e.target.checked) }} /> Farbig
        </label>
        <div className="segment klein">
          <button onClick={() => { const z = istZoom(); zoomSetzen(begrenze(z / 1.25, z)) }} title="Verkleinern (Strg+Mausrad)">−</button>
          <button className={zoom === 'fit' ? 'aktiv' : ''} onClick={() => zoomSetzen('fit')} title="Einpassen">Fit</button>
          <button onClick={() => { const z = istZoom(); zoomSetzen(begrenze(z * 1.25, z)) }} title="Vergrößern (Strg+Mausrad)">+</button>
        </div>
        {blaetter.length > 1 && (
          <div className="segment klein" title="Blatt (weitere Zählerstränge und Folgeblätter)">
            {blaetter.map((_, i) => (
              <button key={i} className={i === blattNr ? 'aktiv' : ''} onClick={() => setBlattWahl(i)}>Blatt {i + 1}</button>
            ))}
          </div>
        )}
        <span className="spacer" />
        <button onClick={() => herunterladen(blatt.svg, dateiname(projekt.projekt.titel + '_' + modus + (blaetter.length > 1 ? `_blatt${blattNr + 1}` : ''), 'svg'), 'image/svg+xml')}>SVG</button>
        <button onClick={() => pdf(false)} disabled={exportiert}>PDF</button>
        <button className="primaer" onClick={() => pdf(true)} disabled={exportiert}>{exportiert ? 'Exportiere…' : 'PDF (beide Pläne)'}</button>
      </div>
      <div className="plan-flaeche" ref={flaeche}>
        <div className="blatt" ref={blattEl} style={{ width: stilBreite }} dangerouslySetInnerHTML={{ __html: blatt.svg.replace(/width="[^"]*mm" height="[^"]*mm"/, 'width="100%"') }} />
      </div>
    </section>
  )
}
