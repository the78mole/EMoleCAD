import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analysiere } from './model/analyse'
import { BEISPIEL_YAML } from './model/beispiel'
import type { Projekt } from './model/types'
import { leeresProjekt, parseYaml, toYaml, YamlFehler } from './model/yaml'
import { NodeEditor } from './editor/NodeEditor'
import { PlanAnsicht } from './ui/PlanAnsicht'
import { YamlEditor } from './ui/YamlEditor'
import { dateiname } from './ui/export'
import { aktuelleDatei, merkeZuletzt, setzeAktuelleDatei, speicherort, zuletzt, type DateiRef } from './speicher'
import { DateiMenue } from './ui/DateiMenue'

const SPEICHER = 'molecad.yaml'
const GESPEICHERT = 'molecad.gespeichert'

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
  const [datei, setDatei] = useState<DateiRef | undefined>(aktuelleDatei)
  const [gespeichert, setGespeichert] = useState<string | null>(() => { try { return localStorage.getItem(GESPEICHERT) } catch { return null } })
  const [status, setStatus] = useState<{ text: string; fehler?: boolean }>()
  const geaendert = gespeichert === null ? yamlText !== BEISPIEL_YAML : yamlText !== gespeichert

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

  const melde = (text: string, fehler = false) => {
    setStatus({ text, fehler })
    window.setTimeout(() => setStatus((s) => (s?.text === text ? undefined : s)), fehler ? 6000 : 2500)
  }

  /** Stand als „gespeichert“ markieren und Datei als aktuelle merken. */
  const sauber = (ref: DateiRef | undefined, text: string | null) => {
    setDatei(ref)
    setzeAktuelleDatei(ref)
    setGespeichert(text)
    try { if (text === null) localStorage.removeItem(GESPEICHERT); else localStorage.setItem(GESPEICHERT, text) } catch { /* egal */ }
    if (ref) merkeZuletzt(ref)
  }

  const verwerfenOk = (was: string) => !geaendert || confirm(`${was}? Ungespeicherte Änderungen gehen verloren.`)

  const neu = () => {
    if (!verwerfenOk('Neues leeres Projekt anlegen')) return
    const t = toYaml(leeresProjekt())
    vonYaml(t)
    sauber(undefined, t)
  }
  const beispiel = () => {
    if (!verwerfenOk('Beispielprojekt laden')) return
    vonYaml(BEISPIEL_YAML)
    sauber(undefined, BEISPIEL_YAML)
  }

  const oeffnen = async (ref?: DateiRef) => {
    if (!verwerfenOk(ref ? `${ref.name} öffnen` : 'Andere Datei öffnen')) return
    try {
      const ort = speicherort(ref?.ort ?? 'lokal')
      const d = ref ? await ort.laden(ref) : await ort.oeffnen()
      if (!d) return
      vonYaml(d.text)
      sauber(d.ref, d.text)
      melde(`${d.ref.name} geöffnet`)
    } catch (e) {
      melde((e as Error).message, true)
    }
  }

  const speichernUnter = async () => {
    try {
      const ort = speicherort(datei?.ort ?? 'lokal')
      const ref = await ort.speichernUnter(datei?.name ?? dateiname(projekt.projekt.titel, 'yaml'), yamlText)
      if (!ref) return
      sauber(ref, yamlText)
      melde(ort.zurueckschreiben ? `Gespeichert: ${ref.name}` : `${ref.name} heruntergeladen`)
    } catch (e) {
      melde((e as Error).message, true)
    }
  }

  const speichernDatei = async () => {
    if (!datei) return speichernUnter()
    try {
      const ort = speicherort(datei.ort)
      const ref = await ort.speichern(datei, yamlText)
      sauber(ref, yamlText)
      melde(ort.zurueckschreiben ? `Gespeichert: ${ref.name}` : `${ref.name} heruntergeladen`)
    } catch (e) {
      melde((e as Error).message, true)
    }
  }

  // Tastenkürzel und Warnung beim Verlassen
  const aktionen = useRef({ speichernDatei, speichernUnter, oeffnen })
  useEffect(() => { aktionen.current = { speichernDatei, speichernUnter, oeffnen } })
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); void (e.shiftKey ? aktionen.current.speichernUnter() : aktionen.current.speichernDatei()) }
      else if (k === 'o') { e.preventDefault(); void aktionen.current.oeffnen() }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])
  useEffect(() => {
    if (!geaendert) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [geaendert])
  useEffect(() => {
    document.title = `${geaendert ? '• ' : ''}${datei?.name ?? projekt.projekt.titel ?? 'Unbenannt'} – MoleCAD`
  }, [geaendert, datei, projekt.projekt.titel])

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
        <DateiMenue
          datei={datei}
          geaendert={geaendert}
          zuletzt={zuletzt()}
          status={status}
          onNeu={neu}
          onBeispiel={beispiel}
          onOeffnen={oeffnen}
          onSpeichern={speichernDatei}
          onSpeichernUnter={speichernUnter}
        />
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
