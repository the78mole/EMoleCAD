import type { SymbolArt } from '../model/library'

/** Kleine Piktogramme für Bibliothek und Knoten */
export function TypIcon({ art, groesse = 18 }: { art: SymbolArt; groesse?: number }) {
  const s = { stroke: 'currentColor', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' as const }
  let inhalt
  switch (art) {
    case 'klemme':
      inhalt = <><line x1="10" y1="1" x2="10" y2="19" {...s} /><rect x="4" y="6" width="12" height="8" {...s} /><circle cx="10" cy="10" r="2.2" {...s} fill="#fff" /></>
      break
    case 'hak':
    case 'sicherung':
      inhalt = <><line x1="10" y1="1" x2="10" y2="19" {...s} /><rect x="7" y="5" width="6" height="10" {...s} /></>
      break
    case 'zaehler':
      inhalt = <><rect x="2" y="4" width="16" height="12" {...s} /><text x="10" y="13" fontSize="6.5" textAnchor="middle" fill="currentColor" fontWeight="bold">kWh</text></>
      break
    case 'sls': case 'ls': case 'trenner':
      inhalt = <><line x1="10" y1="1" x2="10" y2="6" {...s} /><line x1="10" y1="14" x2="10" y2="19" {...s} /><line x1="10" y1="14" x2="5" y2="6" {...s} />{art !== 'trenner' && <><line x1="8" y1="4" x2="12" y2="8" {...s} /><line x1="8" y1="8" x2="12" y2="4" {...s} /></>}{art === 'trenner' && <circle cx="10" cy="5" r="1.4" {...s} />}</>
      break
    case 'rcd': case 'rcbo':
      inhalt = <><line x1="10" y1="1" x2="10" y2="5" {...s} /><line x1="10" y1="11" x2="10" y2="19" {...s} /><line x1="10" y1="11" x2="5" y2="5" {...s} /><ellipse cx="10" cy="15" rx="5" ry="2" {...s} /></>
      break
    case 'spd':
      inhalt = <><rect x="7" y="3" width="6" height="11" {...s} /><line x1="5" y1="13" x2="15" y2="4" {...s} /><line x1="5" y1="17" x2="15" y2="17" {...s} /><line x1="7.5" y1="19" x2="12.5" y2="19" {...s} /></>
      break
    case 'wechselrichter': case 'pvgen':
      inhalt = <><rect x="2" y="2" width="16" height="16" {...s} /><line x1="2" y1="18" x2="18" y2="2" {...s} /><text x="4" y="8" fontSize="6" fill="currentColor">{art === 'pvgen' ? 'PV' : '='}</text><text x="16" y="16" fontSize="6" textAnchor="end" fill="currentColor">{art === 'pvgen' ? '=' : '~'}</text></>
      break
    case 'speicher':
      inhalt = <><rect x="2" y="4" width="16" height="12" {...s} /><line x1="6" y1="9" x2="14" y2="9" {...s} /><line x1="8" y1="12" x2="12" y2="12" {...s} strokeWidth={2.2} /></>
      break
    case 'verteiler':
      inhalt = <><rect x="2" y="3" width="16" height="14" {...s} strokeDasharray="2 1.5" /><text x="10" y="13" fontSize="6.5" textAnchor="middle" fill="currentColor" fontWeight="bold">UV</text></>
      break
    default: {
      const t = { wallbox: 'EV', waermepumpe: 'WP', steuerbox: 'SB', smgw: 'GW' }[art as string]
      inhalt = <><rect x="2" y="3" width="16" height="14" {...s} />{t ? <text x="10" y="13" fontSize="6.5" textAnchor="middle" fill="currentColor" fontWeight="bold">{t}</text> : <><line x1="6" y1="6" x2="14" y2="14" {...s} /><line x1="6" y1="14" x2="14" y2="6" {...s} /></>}</>
    }
  }
  return <svg width={groesse} height={groesse} viewBox="0 0 20 20" className="typ-icon">{inhalt}</svg>
}
