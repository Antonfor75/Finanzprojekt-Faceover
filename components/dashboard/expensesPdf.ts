import { startOfWeek, format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { PdfLib } from '@/lib/pdf'
import type { Expense } from '@/app/types'

const getDate = (e: Expense) => new Date(e.expense_date || e.created_at)

/** PDF "Meine Ausgaben Übersicht" (Historie → Liste → PDF), nach Wochen gruppiert. Läuft synchron im Klick (iOS). */
export function downloadExpensesPdf({ jsPDF, autoTable }: PdfLib, expenses: Expense[], weeklyBudget: number) {
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text("Meine Ausgaben Übersicht", 14, 22)
    doc.setFontSize(10)
    doc.text(`Wochenbudget: €${weeklyBudget.toFixed(2)}`, 14, 28)

    const sortedExpenses = [...expenses].sort((a, b) => getDate(b).getTime() - getDate(a).getTime())
    const grouped: { [key: string]: { expenses: Expense[], total: number, start: Date } } = {}
    const weekKeys: string[] = []

    sortedExpenses.forEach(e => {
        const date = getDate(e)
        const start = startOfWeek(date, { weekStartsOn: 1 })
        const key = start.toISOString()
        if (!grouped[key]) {
            grouped[key] = { expenses: [], total: 0, start }
            weekKeys.push(key)
        }
        grouped[key].expenses.push(e)
        grouped[key].total += Number(e.amount)
    })

    weekKeys.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    const tableBody: any[] = []

    weekKeys.forEach(key => {
        const group = grouped[key]
        const groupWeekNum = format(group.start, 'w', { locale: de })
        const groupIsOverBudget = group.total > weeklyBudget
        group.expenses.forEach(e => {
            tableBody.push([
                format(getDate(e), 'dd.MM.yyyy'),
                e.description || e.category || 'Ausgabe',
                `€${e.amount.toFixed(2)}`
            ])
        })
        tableBody.push([
            {
                content: `Summe KW ${groupWeekNum}:`,
                colSpan: 2,
                styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 240] }
            },
            {
                content: `€${group.total.toFixed(2)}`,
                styles: {
                    fontStyle: 'bold',
                    textColor: groupIsOverBudget ? [220, 38, 38] : [22, 163, 74],
                    fillColor: [240, 240, 240]
                }
            }
        ])
    })

    autoTable(doc, {
        head: [['Datum', 'Beschreibung', 'Betrag']],
        body: tableBody,
        startY: 35,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0] },
        styles: { fontSize: 10, cellPadding: 3 },
    })
    doc.save('Finanzbericht.pdf')
}
