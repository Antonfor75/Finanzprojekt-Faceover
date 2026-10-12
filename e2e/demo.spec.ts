import { test, expect, type Page, type Request } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 } })

/** Sammelt alles, was in der Demo NICHT passieren darf: Supabase-Aufrufe und Server Actions. */
function watchForbiddenRequests(page: Page) {
    const forbidden: string[] = []
    page.on('request', (req: Request) => {
        const isSupabase = req.url().includes('supabase.co')
        const isServerAction = req.method() === 'POST' && !!req.headers()['next-action']
        if (isSupabase || isServerAction) forbidden.push(`${req.method()} ${req.url()}`)
    })
    return forbidden
}

const card = (page: Page) => page.locator('[aria-labelledby="tour-title"]')
const weiter = (page: Page) => card(page).locator('button', { hasText: 'Weiter' })
const expectStep = (page: Page, n: number) => expect(card(page).getByText(`Einführung · ${n}/17`)).toBeVisible()

test('Demo: geführte Einführung komplett, Eingabe bleibt lokal, kein Supabase-Zugriff', async ({ page }) => {
    await page.goto('/')
    // Ab hier zählt: die Demo selbst darf keine einzige verbotene Anfrage auslösen.
    await page.getByRole('link', { name: /App ausprobieren/ }).click()
    await page.waitForURL('**/demo')
    const forbidden = watchForbiddenRequests(page)
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    await expectStep(page, 1)
    await weiter(page).click()
    await expectStep(page, 2)
    await weiter(page).click()
    await expectStep(page, 3)
    await weiter(page).click()

    // 4: Plus antippen (daneben tippen bewirkt nichts)
    await expectStep(page, 4)
    await page.mouse.click(10, 300)
    await expectStep(page, 4)
    await page.locator('[data-tour="add-button"]').click()

    // 5: Betrag — „Weiter“ erst nach Eingabe
    await expectStep(page, 5)
    await expect(weiter(page)).toBeDisabled()
    await page.locator('[data-tour="amount-input"]').fill('4.5')
    await weiter(page).click()

    // 6: Kategorie — der Dialog bleibt dabei offen
    await expectStep(page, 6)
    await expect(page.locator('[data-tour="amount-input"]')).toHaveValue('4.5')
    await weiter(page).click()

    // 7: Speichern
    await expectStep(page, 7)
    await page.locator('[data-tour="save-expense"]').click()
    await expectStep(page, 8)
    await weiter(page).click()
    await expectStep(page, 9)
    await weiter(page).click()

    await expectStep(page, 10)
    await page.locator('[data-tour="giro-card"]').click()
    await expectStep(page, 11)
    await page.locator('[data-tour="giro-back"]').click()
    await expectStep(page, 12)
    await page.locator('[data-tour="nav-history"]').click()
    await expectStep(page, 13)
    await weiter(page).click()
    await expectStep(page, 14)
    await page.locator('[data-tour="nav-settings"]').click()
    await expectStep(page, 15)
    await weiter(page).click()
    await expectStep(page, 16)
    await weiter(page).click()
    await expectStep(page, 17)
    await card(page).getByRole('button', { name: 'Erkunden' }).click()
    await expect(card(page)).toHaveCount(0)

    // In der Demo gibt es kein „Konto löschen“.
    await expect(page.getByText('Konto löschen')).toHaveCount(0)

    // Eingabe liegt im localStorage und übersteht ein Neuladen; die Tour startet nicht erneut.
    const hasEntry = () => page.evaluate(() =>
        JSON.parse(localStorage.getItem('cashflow-demo:v1') || '{}').tables?.expenses?.some((e: { amount: number }) => e.amount === 4.5))
    expect(await hasEntry()).toBe(true)
    await page.reload()
    await expect(page.locator('[data-tour="budget-ring"]')).toBeVisible()
    await expect(card(page)).toHaveCount(0)
    expect(await hasEntry()).toBe(true)

    // Zurücksetzen stellt die Beispieldaten wieder her.
    await page.getByRole('button', { name: 'Demo-Menü' }).click()
    await page.getByRole('menuitem', { name: /Beispieldaten zurücksetzen/ }).click()
    await page.getByRole('menuitem', { name: /Wirklich zurücksetzen/ }).click()
    await expect.poll(hasEntry).toBe(false)

    expect(forbidden, 'Die Demo darf weder Supabase noch Server Actions aufrufen').toEqual([])
})
