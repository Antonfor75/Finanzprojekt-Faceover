import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 } })

test('Impressum und Datenschutz sind ohne Login erreichbar', async ({ page }) => {
    await page.goto('/impressum')
    await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible()
    await expect(page.getByText('Anton Forster').first()).toBeVisible()

    await page.goto('/datenschutz')
    await expect(page.getByRole('heading', { name: 'Datenschutzerklärung' })).toBeVisible()
    await expect(page.getByText(/innerhalb der EU/)).toBeVisible()

    // Kein horizontales Scrollen auf Handybreite.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBe(0)
})

test('Login verlinkt Impressum, Datenschutz und Demo', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Impressum' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Datenschutz' })).toBeVisible()
    await expect(page.getByRole('link', { name: /App ausprobieren/ })).toBeVisible()
})

test('Registrierung geht nur mit Datenschutz-Häkchen (ohne abzuschicken)', async ({ page }) => {
    await page.goto('/?signup=1')
    const submit = page.getByRole('button', { name: /Account erstellen/ })
    await expect(submit).toBeDisabled()
    await page.getByLabel(/zur Kenntnis genommen/).check()
    await expect(submit).toBeEnabled()
})
