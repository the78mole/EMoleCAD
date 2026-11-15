import { useEffect, useState } from 'react'
import type { Analyse } from '../model/analyse'
import { typDef } from '../model/library'
import type { Komponente, ParamWert, Projekt } from '../model/types'
import { datenArtSetzen, datenTrennen, datenVerbinden } from '../model/ops'

interface Props {
  projekt: Projekt
  analyse: Analyse
  id: string
  onAendern: (alteId: string, neu: Komponente) => void
  onProjekt: (p: Projekt) => void
  onLoeschen: (id: string) => void
  onSchliessen: () => void
}

export function Eigenschaften({ projekt, analyse, id, onAendern, onProjekt, onLoeschen, onSchliessen }: Props) {
  const k = projekt.komponenten.find((x) => x.id === id)
  const [idEntwurf, setIdEntwurf] = useState(id)
  useEffect(() => setIdEntwurf(id), [id])
  if (!k) return null
  const def = typDef(k.typ)
  const knoten = analyse.knoten.get(id)
  const meldungen = analyse.meldungen.filter((m) => m.id === id)
  const setze = (patch: Partial<Komponente>) => onAendern(id, { ...k, ...patch })
  const setzeParam = (key: string, wert: ParamWert | undefined) => {
    const params = { ...(k.params ?? {}) }
    if (wert === undefined || wert === '') delete params[key]
    else params[key] = wert
    setze({ params: Object.keys(params).length ? params : undefined })
  }
  const setzeKabel = (key: 'typ' | 'querschnitt' | 'laenge', wert: string) => {
    const kabel = { ...(k.kabel ?? {}) } as Record<string, string | number>
    if (wert === '') delete kabel[key]
    else kabel[key] = key === 'laenge' ? Number(wert) : wert
    setze({ kabel: Object.keys(kabel).length ? kabel : undefined })
  }
  const idUebernehmen = () => {
    const neu = idEntwurf.trim()
    if (!neu || neu === id) return setIdEntwurf(id)
    if (projekt.komponenten.some((x) => x.id === neu)) {
      alert(`ID "${neu}" ist bereits vergeben`)
      return setIdEntwurf(id)
    }
    onAendern(id, { ...k, id: neu })
  }
  const quellen = projekt.komponenten.filter((x) => x.id !== id && typDef(x.typ).kinder)

  return (
    <aside className="eigenschaften">
      <div className="eig-kopf" style={{ borderColor: def.farbe }}>
        <div>
          <div className="eig-typ">{def.label}</div>
          <div className="eig-bmk">{knoten?.bmk ?? id}</div>
        </div>
        <button className="icon-btn" onClick={onSchliessen} title="Schließen">×</button>
      </div>
      {meldungen.map((m, i) => <div key={i} className={`meldung ${m.stufe}`}>{m.text}</div>)}
      <label>ID (BMK)
        <input value={idEntwurf} onChange={(e) => setIdEntwurf(e.target.value)} onBlur={idUebernehmen} onKeyDown={(e) => e.key === 'Enter' && idUebernehmen()} />
      </label>
      <label className="haken" title="„Neu nummerieren“ lässt diese ID unverändert und vergibt sie nicht an andere Komponenten">
        <input type="checkbox" checked={!!k.fest} onChange={(e) => setze({ fest: e.target.checked || undefined })} />
        ID festschreiben
      </label>
      <label>Bezeichnung
        <input value={k.name ?? ''} placeholder={def.label} onChange={(e) => setze({ name: e.target.value || undefined })} />
      </label>
      {!def.wurzel && (
        <label>Quelle (vorgeschaltet)
          <select value={k.quelle ?? ''} onChange={(e) => setze({ quelle: e.target.value || undefined })}>
            <option value="">– nicht angeschlossen –</option>
            {quellen.map((q) => <option key={q.id} value={q.id}>{q.id}{q.name ? ` – ${q.name}` : ''}</option>)}
          </select>
        </label>
      )}
      {!def.dc && (
        <div className="reihe">
          <label>Polzahl
            <select value={k.pole ?? ''} disabled={!def.poleWaehlbar} onChange={(e) => setze({ pole: e.target.value ? (Number(e.target.value) as 1 | 3) : undefined })}>
              <option value="">Standard ({def.pole}-polig)</option>
              <option value="1">1-polig (L/N/PE)</option>
              <option value="3">3-polig (3/N/PE)</option>
            </select>
          </label>
          {knoten?.pole === 1 && !knoten.dc && (
            <label>Phase
              <select value={k.phase ?? ''} onChange={(e) => setze({ phase: (e.target.value || undefined) as Komponente['phase'] })}>
                <option value="">auto ({knoten.phase})</option>
                <option>L1</option><option>L2</option><option>L3</option>
              </select>
            </label>
          )}
        </div>
      )}
      {def.params.length > 0 && <div className="eig-abschnitt">Parameter</div>}
      {def.params.map((pd) => {
        const wert = k.params?.[pd.key]
        const titel = pd.label + (pd.einheit ? ` [${pd.einheit}]` : '')
        if (pd.art === 'bool')
          return (
            <label key={pd.key} className="check">
              <input type="checkbox" checked={!!wert} onChange={(e) => setzeParam(pd.key, e.target.checked)} /> {pd.label}
            </label>
          )
        if (pd.art === 'auswahl')
          return (
            <label key={pd.key}>{titel}
              <select value={wert === undefined ? '' : String(wert)} onChange={(e) => setzeParam(pd.key, e.target.value)}>
                <option value="">–</option>
                {pd.optionen!.map((o) => <option key={o}>{o}</option>)}
                {wert !== undefined && !pd.optionen!.includes(String(wert)) && <option>{String(wert)}</option>}
              </select>
            </label>
          )
        return (
          <label key={pd.key}>{titel}
            <input
              type={pd.art === 'zahl' ? 'number' : 'text'}
              step="any"
              value={wert === undefined ? '' : String(wert)}
              onChange={(e) => setzeParam(pd.key, pd.art === 'zahl' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
            />
          </label>
        )
      })}
      {!def.wurzel && (
        <>
          <div className="eig-abschnitt">Zuleitung</div>
          <div className="reihe">
            <label>Kabeltyp<input value={k.kabel?.typ ?? ''} placeholder="NYM-J" onChange={(e) => setzeKabel('typ', e.target.value)} /></label>
            <label>Querschnitt<input value={k.kabel?.querschnitt ?? ''} placeholder="5x2,5" onChange={(e) => setzeKabel('querschnitt', e.target.value)} /></label>
          </div>
          <label>Länge [m]<input type="number" value={k.kabel?.laenge ?? ''} onChange={(e) => setzeKabel('laenge', e.target.value)} /></label>
        </>
      )}
      {def.daten && (
        <>
          <div className="eig-abschnitt">Datenverbindungen</div>
          {(projekt.datenverbindungen ?? []).filter((d) => d.von === id || d.nach === id).map((d) => {
            const anderer = d.von === id ? d.nach : d.von
            return (
              <div key={`${d.von}-${d.nach}`} className="reihe daten-zeile">
                <span className="daten-ziel">{d.von === id ? '→' : '←'} {anderer}</span>
                <input value={d.art ?? ''} placeholder="Art (LMN, CLS…)" onChange={(e) => onProjekt(datenArtSetzen(projekt, d.von, d.nach, e.target.value))} />
                <button className="icon-btn" title="Datenverbindung entfernen" onClick={() => onProjekt(datenTrennen(projekt, d.von, d.nach))}>×</button>
              </div>
            )
          })}
          <label>Verbinden mit
            <select value="" onChange={(e) => e.target.value && onProjekt(datenVerbinden(projekt, id, e.target.value))}>
              <option value="">– Gerät wählen –</option>
              {projekt.komponenten.filter((x) => x.id !== id && typDef(x.typ).daten).map((x) => <option key={x.id} value={x.id}>{x.id}{x.name ? ` – ${x.name}` : ''}</option>)}
            </select>
          </label>
        </>
      )}
      <button className="gefahr" onClick={() => onLoeschen(id)}>Komponente löschen</button>
    </aside>
  )
}
