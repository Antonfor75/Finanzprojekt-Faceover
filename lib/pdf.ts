// jsPDF + autotable sind groß und werden nur für den PDF-Export gebraucht. Sie gehören
// daher nicht ins Startpaket der App, sondern werden nachgeladen, sobald eine Ansicht mit
// PDF-Knopf sichtbar ist (preloadPdf). Beim Klick sind sie dann schon da und der Export
// läuft wie bisher synchron im Klick — wichtig, damit iOS den Download nicht blockiert.
import type jsPDFType from 'jspdf'
import type autoTableType from 'jspdf-autotable'

export type PdfLib = { jsPDF: typeof jsPDFType; autoTable: typeof autoTableType }

let loaded: PdfLib | null = null
let loading: Promise<PdfLib> | null = null

export function preloadPdf(): Promise<PdfLib> {
    if (!loading) {
        loading = Promise.all([import('jspdf'), import('jspdf-autotable')])
            .then(([pdf, table]) => (loaded = { jsPDF: pdf.default, autoTable: table.default }))
            .catch(err => {
                loading = null // nächster Versuch lädt erneut (z. B. nach Funkloch)
                throw err
            })
    }
    return loading
}

/** Führt fn sofort aus, wenn die Bibliothek schon geladen ist, sonst nach dem Nachladen. */
export function withPdf(fn: (pdf: PdfLib) => void): void {
    if (loaded) {
        fn(loaded)
        return
    }
    preloadPdf().then(fn).catch(err => {
        console.error('PDF-Bibliothek konnte nicht geladen werden', err)
        alert('PDF-Export gerade nicht möglich. Bitte Internetverbindung prüfen und erneut versuchen.')
    })
}
