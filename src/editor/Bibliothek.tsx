import { BIBLIOTHEK, type TypDef } from '../model/library'
import { TypIcon } from './TypIcon'

const KATEGORIEN: TypDef['kategorie'][] = ['Einspeisung', 'Schutz', 'Erzeugung', 'Verbraucher', 'Sonstiges']

export function Bibliothek({ onHinzufuegen }: { onHinzufuegen: (typ: string) => void }) {
  return (
    <aside className="bibliothek">
      <div className="bib-titel">Bibliothek</div>
      <div className="bib-hinweis">Ziehen oder doppelklicken</div>
      {KATEGORIEN.map((kat) => (
        <div key={kat} className="bib-gruppe">
          <div className="bib-kat">{kat}</div>
          {BIBLIOTHEK.filter((t) => t.kategorie === kat).map((t) => (
            <div
              key={t.typ}
              className="bib-eintrag"
              draggable
              style={{ ['--farbe' as string]: t.farbe }}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/molecad', t.typ)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDoubleClick={() => onHinzufuegen(t.typ)}
              title={`${t.label} – ziehen zum Einfügen`}
            >
              <TypIcon art={t.symbol} />
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      ))}
    </aside>
  )
}
