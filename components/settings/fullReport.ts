import type { PdfLib } from '@/lib/pdf'
import { Expense, FixedCost, Settings, Account, IncomeSource } from '@/app/types'

type ReportData = {
    budget: number
    fixedCosts: FixedCost[]
    incomeSources: IncomeSource[]
    accounts: Account[]
    expenses: Expense[]
    settings: Settings
}

/** PDF-Report mit eingebettetem Backup (Einstellungen → Download). Läuft synchron, damit iOS den Download zulässt. */
export function downloadFullReport({ jsPDF, autoTable }: PdfLib, { budget, fixedCosts, incomeSources, accounts, expenses, settings }: ReportData) {
    const doc = new jsPDF()
    // FIXED: Filter out expired costs for PDF
    const activeFixedCostsForPdf = fixedCosts.filter(fc => {
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const to = fc.valid_to ? new Date(fc.valid_to) : null
        if (to) {
            const toDate = new Date(to)
            toDate.setHours(23, 59, 59, 999)
            if (toDate < now) return false
        }
        return true
    })

    const totalFixed = activeFixedCostsForPdf.reduce((acc, curr) => acc + Number(curr.amount), 0)
    const available = Number(budget) - totalFixed

    // Header
    doc.setFontSize(22)
    doc.setTextColor(33, 33, 33)
    doc.text('Finanzübersicht', 14, 22)

    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(`Erstellt am: ${new Date().toLocaleDateString('de-DE')}`, 14, 28)

    // Summary Section
    doc.setFontSize(14)
    doc.setTextColor(33, 33, 33)
    doc.text('Zusammenfassung', 14, 40)

    const summaryData = [
        ['Monatsbudget (Einnahmen)', `€${Number(budget).toFixed(2)}`],
        ['Fixkosten Gesamt', `€${totalFixed.toFixed(2)}`],
        ['Verfügbar (Monat)', `€${available.toFixed(2)}`],
        ['Verfügbar (Woche)', `€${(available / 4.33).toFixed(2)}`]
    ]

    autoTable(doc, {
        startY: 45,
        head: [],
        body: summaryData,
        theme: 'plain',
        styles: { fontSize: 11, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { cellWidth: 50 } },
    })

    // Income Sources Section
    let currentY = (doc as any).lastAutoTable.finalY + 15
    doc.setFontSize(14)
    doc.text('Einnahmequellen', 14, currentY)

    const incomeData = incomeSources.map(src => [
        src.title,
        `€${Number(src.amount).toFixed(2)}`,
        src.frequency || 'monthly',
        src.valid_from ? new Date(src.valid_from).toLocaleDateString('de-DE') : '-',
        src.valid_to ? new Date(src.valid_to).toLocaleDateString('de-DE') : '-'
    ])

    autoTable(doc, {
        startY: currentY + 5,
        head: [['Quelle', 'Betrag', 'Intervall', 'Von', 'Bis']],
        body: incomeData.length ? incomeData : [['Keine Einnahmequellen', '-', '-', '-', '-']],
        theme: 'grid',
        headStyles: { fillColor: [22, 163, 74] }, // Green
    })

    // Account Overview Section
    currentY = (doc as any).lastAutoTable.finalY + 15
    doc.setFontSize(14)
    doc.text('Konten Übersicht', 14, currentY)

    const accountsData = accounts.map(acc => [
        acc.name,
        acc.type === 'savings' ? 'Sparkonto' : acc.type === 'fun' ? 'Spaßkonto' : 'Aufteilung',
        `€${acc.amount.toFixed(2)}`,
        acc.type === 'distribution' ? acc.months.toString() : '-',
        acc.valid_from ? new Date(acc.valid_from).toLocaleDateString('de-DE') : '-'
    ])

    autoTable(doc, {
        startY: currentY + 5,
        head: [['Name', 'Typ', 'Betrag', 'Monate', 'Startdatum']],
        body: accountsData.length ? accountsData : [['Keine Konten vorhanden', '-', '-', '-', '-']],
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] }, // Blue
    })

    // Fixed Costs Section
    currentY = (doc as any).lastAutoTable.finalY + 15

    // Check if we need a new page
    if (currentY > 250) {
        doc.addPage()
        currentY = 20
    }

    doc.setFontSize(14)
    doc.text('Fixkosten Details', 14, currentY)

    const fixedCostsData = activeFixedCostsForPdf.map(cost => [
        cost.title,
        `€${cost.amount.toFixed(2)}`
    ])

    autoTable(doc, {
        startY: currentY + 5,
        head: [['Titel', 'Betrag']],
        body: fixedCostsData.length ? fixedCostsData : [['Keine Fixkosten', '-']],
        theme: 'grid',
        headStyles: { fillColor: [219, 39, 119] }, // Pink
    })

    // Expenses Section
    currentY = (doc as any).lastAutoTable.finalY + 15
    if (currentY > 250) {
        doc.addPage()
        currentY = 20
    }

    doc.setFontSize(14)
    doc.text('Ausgaben Übersicht', 14, currentY)

    // Sort expenses by date desc
    const sortedExpenses = [...expenses].sort((a, b) => new Date(b.expense_date || b.created_at).getTime() - new Date(a.expense_date || a.created_at).getTime())

    const expensesData = sortedExpenses.map(e => [
        new Date(e.expense_date || e.created_at).toLocaleDateString('de-DE'),
        e.description || e.category || '',
        e.category || '-',
        `€${e.amount.toFixed(2)}`
    ])

    autoTable(doc, {
        startY: currentY + 5,
        head: [['Datum', 'Beschreibung', 'Kategorie', 'Betrag']],
        body: expensesData.length ? expensesData : [['Keine Ausgaben', '-', '-', '-']],
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] }, // Green
        styles: { fontSize: 9 }
    })

    // --- EMBED BACKUP DATA ---
    // Export complete objects including legacy fields and relationships
    const backupData = {
        settings: settings,
        accounts: accounts,
        fixedCosts: fixedCosts,
        expenses: expenses,
        incomeSources: incomeSources,
        timestamp: Date.now(),
        version: '1.1'
    }
    const backupString = `BACKUP_DATA_START:${JSON.stringify(backupData)}:BACKUP_DATA_END`

    doc.addPage()
    doc.setFontSize(8)
    doc.setTextColor(200, 200, 200)
    doc.text(backupString, 10, 10, { maxWidth: 190 })

    doc.save(`Finanzen_Report_${new Date().toISOString().split('T')[0]}.pdf`)
}
