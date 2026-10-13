// Gemeinsame Schritte für den Hauptablauf — laufen gegen die echte App (main-flow.spec.ts,
// braucht ein Testkonto) und gegen die Demo (dashboard-demo.spec.ts, ohne Konto).
import { expect, type Page } from '@playwright/test'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export const budgetRing = (page: Page) => page.locator('[data-tour="budget-ring"]')

/** Historie-Tab wählen. Per Tastatur, weil in der Demo das Banner oben die Tab-Mitte überdeckt. */
async function selectHistoryTab(page: Page, name: 'Kalender' | 'Liste' | 'Analyse') {
    const tab = page.locator('[data-tour="history-tabs"]').getByRole('tab', { name })
    await tab.focus()
    await tab.press('Enter')
    await expect(tab).toHaveAttribute('data-state', 'active')
}

/** Historie → Analyse → Startseite → Einstellungen → zurück. */
export async function navigateAllViews(page: Page) {
    await page.locator('[data-tour="nav-history"]').click()
    const tabs = page.locator('[data-tour="history-tabs"]')
    await expect(tabs).toBeVisible()

    await selectHistoryTab(page, 'Analyse')
    await selectHistoryTab(page, 'Liste')

    // Mittlerer Knopf führt außerhalb der Startseite zurück zur Startseite
    await page.locator('[data-tour="add-button"]').click()
    await expect(budgetRing(page)).toBeVisible()

    await page.locator('[data-tour="nav-settings"]').click()
    await expect(page.locator('[data-tour="settings-finance"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Abmelden' })).toBeVisible()

    await page.locator('[data-tour="add-button"]').click()
    await expect(budgetRing(page)).toBeVisible()
}

/** Ausgabe mit eindeutigem Betrag anlegen, in der Liste finden und wieder löschen. */
export async function addFindAndDeleteExpense(page: Page, amount: string) {
    const shown = `€${Number(amount).toFixed(2)}`

    // Anlegen (Startseite → Plus → Betrag → Speichern)
    await page.locator('[data-tour="add-button"]').click()
    await page.locator('[data-tour="amount-input"]').fill(amount)
    await page.locator('[data-tour="save-expense"]').click()
    await expect(page.locator('[data-tour="amount-input"]')).toHaveCount(0) // Formular schließt sofort

    // In der Liste finden: aktuelle Woche → heute → Buchung
    const today = new Date()
    await page.locator('[data-tour="nav-history"]').click()
    await selectHistoryTab(page, 'Liste')
    const weekLabel = page.locator('p', { hasText: new RegExp(`^KW ${format(today, 'w', { locale: de })}$`) })
    await page.locator('button.ledger-row').filter({ has: weekLabel }).first().click()
    await page.locator('button.ledger-row', { hasText: format(today, 'EEEE', { locale: de }) }).first().click()
    const row = page.locator('div.ledger-row', { hasText: shown })
    await expect(row).toHaveCount(1)

    // Löschen (mit Rückfrage) — danach ist die Buchung weg
    page.once('dialog', dialog => dialog.accept())
    await row.locator('button').nth(1).click()
    await expect(row).toHaveCount(0)

    await page.locator('[data-tour="add-button"]').click()
    await expect(budgetRing(page)).toBeVisible()
}
