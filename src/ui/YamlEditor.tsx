import CodeMirror from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { useMemo } from 'react'

export function YamlEditor({ text, onChange, fehler }: { text: string; onChange: (t: string) => void; fehler?: { text: string; zeile?: number } }) {
  const ext = useMemo(() => [yaml()], [])
  return (
    <div className="yaml-editor">
      <CodeMirror value={text} onChange={onChange} extensions={ext} height="100%" basicSetup={{ foldGutter: true, tabSize: 2 }} />
      {fehler && <div className="yaml-fehler">{fehler.zeile ? `Zeile ${fehler.zeile}: ` : ''}{fehler.text}</div>}
    </div>
  )
}
