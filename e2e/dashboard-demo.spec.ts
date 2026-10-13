import { test, expect } from '@playwright/test'
import { budgetRing, navigateAllViews, addFindAndDeleteExpense } from './dashboard-flow'

// Gleicher Hauptablauf wie main-flow.spec.ts, aber in der Demo (läuft ohne Konto und ohne Netz).
test.use({ viewport: { width: 375, height: 812 } })

test('Demo: alle Ansichten, Ausgabe anlegen, finden und löschen', async ({ page }) => {
    await page.goto('/demo')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByRole('button', { name: 'Überspringen' }).click()
    await expect(budgetRing(page)).toBeVisible()

    await navigateAllViews(page)
    await addFindAndDeleteExpense(page, '987.65')
})
