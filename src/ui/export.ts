import type { Blatt } from '../schematic/blatt'

export async function exportierePdf(blaetter: Blatt[], dateiname: string) {
  const { jsPDF } = await import('jspdf')
  await import('svg2pdf.js')
  const erst = blaetter[0]
  const ausrichtung = (b: Blatt) => (b.breite >= b.hoehe ? 'landscape' : 'portrait')
  const doc = new jsPDF({ orientation: ausrichtung(erst), unit: 'mm', format: [erst.breite, erst.hoehe], compress: true })
  const halter = document.createElement('div')
  halter.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden'
  document.body.appendChild(halter)
  try {
    for (let i = 0; i < blaetter.length; i++) {
      const b = blaetter[i]
      if (i > 0) doc.addPage([b.breite, b.hoehe], ausrichtung(b))
      halter.innerHTML = b.svg
      const el = halter.querySelector('svg')!
      await doc.svg(el, { x: 0, y: 0, width: b.breite, height: b.hoehe })
    }
  } finally {
    halter.remove()
  }
  doc.setProperties({ creator: 'EMoleCAD' })
  doc.save(dateiname)
}

export function herunterladen(inhalt: string, dateiname: string, mime: string) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = dateiname
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function dateiname(titel: string | undefined, endung: string) {
  const basis = (titel || 'schaltplan').replace(/[^\wäöüÄÖÜß-]+/g, '_').replace(/^_+|_+$/g, '')
  return `${basis || 'schaltplan'}.${endung}`
}
