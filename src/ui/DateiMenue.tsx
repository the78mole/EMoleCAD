import { useEffect, useRef, useState } from 'react'
import { speicherort, type DateiRef } from '../speicher'

interface Props {
  datei?: DateiRef
  geaendert: boolean
  zuletzt: DateiRef[]
  status?: { text: string; fehler?: boolean }
  onNeu(): void
  onBeispiel(): void
  onOeffnen(ref?: DateiRef): void
  onSpeichern(): void
  onSpeichernUnter(): void
}

const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
const kuerzel = (k: string) => (mac ? `⌘${k}` : `Strg+${k}`)

export function DateiMenue(p: Props) {
  const [offen, setOffen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!offen) return
    const zu = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOffen(false) }
    window.addEventListener('mousedown', zu)
    return () => window.removeEventListener('mousedown', zu)
  }, [offen])
  const tu = (f: () => void) => () => { setOffen(false); f() }
  const zurueck = speicherort(p.datei?.ort ?? 'lokal').zurueckschreiben

  return (
    <>
      {p.status && <span className={`datei-status ${p.status.fehler ? 'fehler' : ''}`}>{p.status.text}</span>}
      <span className="datei-name" title={p.datei ? `${speicherort(p.datei.ort).label}: ${p.datei.name}` : 'Noch nicht gespeichert (Entwurf im Browser)'}>
        {p.datei?.name ?? 'Entwurf'}{p.geaendert && <b title="Ungespeicherte Änderungen"> ●</b>}
      </span>
      <div className="datei-menue" ref={ref}>
        <button onClick={() => setOffen((o) => !o)}>Datei ▾</button>
        {offen && (
          <div className="menue">
            <button onClick={tu(p.onNeu)}>Neu</button>
            <button onClick={tu(() => p.onOeffnen())}>Öffnen…<kbd>{kuerzel('O')}</kbd></button>
            {p.zuletzt.length > 0 && (
              <>
                <div className="menue-titel">Zuletzt verwendet</div>
                {p.zuletzt.map((r) => (
                  <button key={r.schluessel} className="zuletzt" onClick={tu(() => p.onOeffnen(r))} title={`${speicherort(r.ort).label}: ${r.name}`}>{r.name}</button>
                ))}
              </>
            )}
            <hr />
            <button onClick={tu(p.onSpeichern)}>{p.datei && zurueck ? 'Speichern' : 'Speichern…'}<kbd>{kuerzel('S')}</kbd></button>
            <button onClick={tu(p.onSpeichernUnter)}>Speichern unter…<kbd>{kuerzel('⇧S')}</kbd></button>
            <hr />
            <button onClick={tu(p.onBeispiel)}>Beispiel laden</button>
            {!zurueck && <div className="menue-hinweis">Hier kann nicht direkt in Dateien geschrieben werden (Firefox/Safari oder eingebettete Vorschau); Speichern lädt die YAML-Datei herunter. Direkt geöffnet in Chrome oder Edge wird in die geöffnete Datei gespeichert.</div>}
          </div>
        )}
      </div>
      <button className="primaer-kopf" onClick={p.onSpeichern} disabled={!p.geaendert && !!p.datei} title={kuerzel('S')}>Speichern</button>
    </>
  )
}
