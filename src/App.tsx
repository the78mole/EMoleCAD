import { useCallback, useMemo, useRef, useState } from 'react'
import { analysiere } from './model/analyse'
import { BEISPIEL_YAML } from './model/beispiel'
import type { Projekt } from './model/types'
import { leeresProjekt, parseYaml, toYaml, YamlFehler } from './model/yaml'
import { NodeEditor } from './editor/NodeEditor'
import { PlanAnsicht } from './ui/PlanAnsicht'
import { YamlEditor } from './ui/YamlEditor'
import { dateiname, herunterladen } from './ui/export'

const SPEICHER = 'molecad.yaml'

function startText(): string {
  try {
    return localStorage.getItem(SPEICHER) ?? BEISPIEL_YAML
  } catch {
    return BEISPIEL_YAML
  }
}

function sicherParsen(t: string): Projekt {
  try {
    return parseYaml(t)
  } catch {
    return parseYaml(BEISPIEL_YAML)
  }
}

type Tab = 'grafisch' | 'yaml'

export default function App() {
  const [yamlText, setYamlText] = useState(startText)
  const [projekt, setProjekt] = useState<Projekt>(() => sicherParsen(yamlText))
  const [fehler, setFehler] = useState<{ text: string; zeile?: number }>()
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('molecad.tab') as Tab) || 'grafisch')
  const [links, setLinks] = useState(() => Number(localStorage.getItem('molecad.split')) || 55)
  const [eingeklappt, setEingeklappt] = useState<'keins' | 'editor' | 'plan'>(() => (localStorage.getItem('molecad.eingeklappt') as 'keins' | 'editor' | 'plan') || 'keins')
  const klappe = (w: 'keins' | 'editor' | 'plan') => {
    setEingeklappt(w)
    try { localStorage.setItem('molecad.eingeklappt', w) } catch { /* egal */ }
  }
  const [meldungenOffen, setMeldungenOffen] = useState(true)
  const dateiInput = useRef<HTMLInputElement>(null)

  const analyse = useMemo(() => analysiere(projekt), [projekt])

  const speichern = (t: string) => {
    try { localStorage.setItem(SPEICHER, t) } catch { /* voll/privat */ }
  }

  const vonYaml = useCallback((t: string) => {
    setYamlText(t)
    speichern(t)
    try {
      setProjekt(parseYaml(t))
      setFehler(undefined)
    } catch (e) {
      setFehler({ text: (e as Error).message, zeile: e instanceof YamlFehler ? e.zeile : undefined })
    }
  }, [])

  const vonEditor = useCallback((p: Projekt) => {
    setProjekt(p)
    const t = toYaml(p)
    setYamlText(t)
    speichern(t)
    setFehler(undefined)
  }, [])

  const tabWechsel = (t: Tab) => {
    setTab(t)
    try { localStorage.setItem('molecad.tab', t) } catch { /* egal */ }
  }

  const oeffnen = (f: File) => {
    f.text().then((t) => {
      vonYaml(t)
    })
  }

  const ziehen = (e: React.PointerEvent) => {
    const start = e.clientX
    const startLinks = links
    const breite = window.innerWidth
    const move = (ev: PointerEvent) => setLinks(Math.min(80, Math.max(20, startLinks + ((ev.clientX - start) / breite) * 100)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLinks((l) => { localStorage.setItem('molecad.split', String(l)); return l })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const zaehl = { fehler: 0, warnung: 0, info: 0 }
  analyse.meldungen.forEach((m) => zaehl[m.stufe]++)

  return (
    <div className="app">
      <header className="kopf">
        <div className="logo">Mole<span>CAD</span></div>
        <input
          className="titel"
          value={projekt.projekt.titel ?? ''}
          onChange={(e) => vonEditor({ ...projekt, projekt: { ...projekt.projekt, titel: e.target.value } })}
          placeholder="Projekttitel"
        />
        <span className="spacer" />
        <button onClick={() => { if (confirm('Neues leeres Projekt anlegen? Ungespeicherte Änderungen gehen verloren.')) vonEditor(leeresProjekt()) }}>Neu</button>
        <button onClick={() => { if (confirm('Beispielprojekt laden? Das aktuelle Projekt wird ersetzt.')) vonYaml(BEISPIEL_YAML) }}>Beispiel</button>
        <button onClick={() => dateiInput.current?.click()}>Öffnen…</button>
        <button onClick={() => herunterladen(yamlText, dateiname(projekt.projekt.titel, 'yaml'), 'text/yaml')}>YAML speichern</button>
        <input ref={dateiInput} type="file" accept=".yaml,.yml,text/yaml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) oeffnen(f); e.target.value = '' }} />
      </header>
      <main className="haupt">
        {eingeklappt === 'editor' ? (
          <button className="leiste-zu" onClick={() => klappe('keins')} title="Editor einblenden"><span>Editor ▸</span></button>
        ) : (
        <section className="links" style={eingeklappt === 'plan' ? { flex: 1 } : { width: `${links}%` }}>
            <div className="tabs">
              <button className="einklappen" onClick={() => klappe('editor')} title="Editor einklappen (Plan bekommt die volle Breite)">◂ Einklappen</button>
              <button className={tab === 'grafisch' ? 'aktiv' : ''} onClick={() => tabWechsel('grafisch')}>Grafischer Editor</button>
              <button className={tab === 'yaml' ? 'aktiv' : ''} onClick={() => tabWechsel('yaml')}>YAML{fehler ? ' ⚠' : ''}</button>
              <span className="spacer" />
              <button className={`meldungen-knopf ${zaehl.fehler ? 'fehler' : zaehl.warnung ? 'warnung' : 'ok'}`} onClick={() => setMeldungenOffen((o) => !o)}>
                {zaehl.fehler || zaehl.warnung ? `${zaehl.fehler} Fehler · ${zaehl.warnung} Warnungen` : 'Keine Probleme'}
              </button>
            </div>
            <div className="tab-inhalt">
              {tab === 'grafisch' ? <NodeEditor projekt={projekt} analyse={analyse} onChange={vonEditor} /> : <YamlEditor text={yamlText} onChange={vonYaml} fehler={fehler} />}
            </div>
            {meldungenOffen && analyse.meldungen.length > 0 && (
              <div className="meldungen">
                {analyse.meldungen.map((m, i) => <div key={i} className={`meldung ${m.stufe}`}>{m.text}</div>)}
              </div>
            )}
          </section>
        )}
        {eingeklappt === 'keins' && <div className="trenner" onPointerDown={ziehen} />}
        {eingeklappt === 'plan' ? (
          <button className="leiste-zu" onClick={() => klappe('keins')} title="Plan einblenden"><span>◂ Plan</span></button>
        ) : (
          <PlanAnsicht projekt={projekt} analyse={analyse} onEinklappen={() => klappe('plan')} />
        )}
      </main>
    </div>
  )
}
