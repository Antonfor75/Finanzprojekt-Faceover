import { test, expect } from '@playwright/test'
import { budgetRing, navigateAllViews, addFindAndDeleteExpense } from './dashboard-flow'

// Echter Login gegen Supabase. Braucht ein eigenes Testkonto in der .env:
//   TEST_EMAIL=...   TEST_PASSWORD=...
// Ohne diese Werte wird der Test übersprungen (statt fehlzuschlagen).
const TEST_EMAIL = process.env.TEST_EMAIL
const TEST_PASSWORD = process.env.TEST_PASSWORD

test.use({ viewport: { width: 375, height: 812 } })

test.describe('Hauptablauf mit echtem Konto', () => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'TEST_EMAIL / TEST_PASSWORD fehlen in der .env')

    test('Anmelden, alle Ansichten, Ausgabe anlegen und löschen, Abmelden', async ({ page }) => {
        await page.goto('/')
        await expect(page.getByRole('heading', { name: 'Finanzen' })).toBeVisible()
        await page.locator('input[type="email"]').fill(TEST_EMAIL!)
        await page.locator('input[type="password"]').fill(TEST_PASSWORD!)
        await page.getByRole('button', { name: 'Anmelden' }).click()
        await expect(budgetRing(page)).toBeVisible({ timeout: 20_000 })

        await navigateAllViews(page)
        // Betrag mit Zufallsanteil, damit er sich nicht mit echten Buchungen verwechseln lässt
        await addFindAndDeleteExpense(page, `9${Math.floor(Math.random() * 90 + 10)}.37`)

        await page.locator('[data-tour="nav-settings"]').click()
        await page.getByRole('button', { name: 'Abmelden' }).click()
        await expect(page.getByRole('heading', { name: 'Finanzen' })).toBeVisible()
        // Zwischengespeicherte Finanzdaten sind nach dem Abmelden vom Gerät entfernt
        expect(await page.evaluate(() => localStorage.getItem('cashflow:last-data:v1'))).toBeNull()
    })
})
