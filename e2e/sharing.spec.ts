import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { budgetRing } from './dashboard-flow'

// Zwei echte Konten gegen Supabase. Zugänge in der .env:
//   TEST_EMAIL / TEST_PASSWORD     (Konto 1, schickt die Anfrage)
//   TEST2_EMAIL / TEST2_PASSWORD   (Konto 2, nimmt sie an)
// Ohne diese Werte wird übersprungen (statt fehlzuschlagen), wie main-flow.spec.ts.
const E1 = process.env.TEST_EMAIL
const P1 = process.env.TEST_PASSWORD
const E2 = process.env.TEST2_EMAIL
const P2 = process.env.TEST2_PASSWORD

test.use({ viewport: { width: 375, height: 812 } })

// Kontonamen sind je Lauf eindeutig (3-20 Zeichen, a-z 0-9 . _). Fehlt der Name beim Konto, wird er gesetzt.
const SUFFIX = Math.random().toString(36).slice(2, 7)
const HANDLE_1 = `e2e.a${SUFFIX}`
const HANDLE_2 = `e2e.b${SUFFIX}`

async function login(page: Page, email: string, password: string) {
    await page.goto('/')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.getByRole('button', { name: 'Anmelden' }).click()
}

async function openFriendLink(page: Page) {
    await page.locator('[data-tour="nav-settings"]').click()
    await page.getByRole('button', { name: /Gemeinsam teilen/ }).click()
}

/** Wartet, bis der Verknüpfen-Bildschirm geladen ist ("Lädt …" vorbei): Namensfeld oder eigener Kontoname. */
async function friendLinkSettled(page: Page) {
    const field = page.getByLabel('Dein Kontoname')
    await expect(field.or(page.locator('[data-testid="own-handle"]'))).toBeVisible({ timeout: 20_000 })
    return field
}

async function setHandleIfAsked(page: Page, handle: string) {
    const field = await friendLinkSettled(page)
    if (await field.isVisible()) {
        await field.fill(handle)
        await page.getByRole('button', { name: 'Speichern' }).click()
        await expect(page.locator('[data-testid="own-handle"]')).toBeVisible()
    }
}

const letterDialog = (page: Page) => page.getByRole('dialog', { name: 'Freundschaftsanfrage' })

/**
 * Öffnet "Gemeinsam teilen". Ein Brief erscheint erst, wenn der Freundschaftsstand geladen ist, und
 * verdeckt dann alles: Liegt er vor, wird er abgelehnt und der Weg erneut versucht (wiederholt bis es klappt).
 */
async function openFriendLinkClearingLetter(page: Page) {
    await expect(async () => {
        if (await letterDialog(page).isVisible()) {
            await page.getByRole('button', { name: 'Brief öffnen' }).click({ timeout: 2_000 })
            await page.getByRole('button', { name: 'Ablehnen' }).click({ timeout: 5_000 })
            await expect(letterDialog(page)).toBeHidden({ timeout: 5_000 })
        }
        await page.locator('[data-tour="nav-settings"]').click({ timeout: 2_000 })
        await page.getByRole('button', { name: /Gemeinsam teilen/ }).click({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await friendLinkSettled(page)
}

/** Räumt über die Oberfläche auf: eine bestehende Verbindung bzw. offene Anfrage lösen. */
async function cleanUp(page: Page) {
    await page.goto('/')
    await expect(budgetRing(page)).toBeVisible({ timeout: 20_000 })
    await openFriendLinkClearingLetter(page)
    await expect(page.getByText(/Noch nicht verbunden|Anfrage gesendet|Verbunden mit/)).toBeVisible()
    if (await page.getByRole('button', { name: 'Verbindung trennen' }).isVisible()) {
        await page.getByRole('button', { name: 'Verbindung trennen' }).click()
        await page.getByRole('button', { name: 'Ja, trennen' }).click()
    } else if (await page.getByRole('button', { name: 'Anfrage zurückziehen' }).isVisible()) {
        await page.getByRole('button', { name: 'Anfrage zurückziehen' }).click()
    }
    await expect(page.getByText('Noch nicht verbunden')).toBeVisible()
}

test.describe('Geteilte Einkäufe: Freund verknüpfen', () => {
    test.skip(!E1 || !P1 || !E2 || !P2, 'TEST_EMAIL/TEST_PASSWORD und TEST2_EMAIL/TEST2_PASSWORD fehlen in der .env')
    test.describe.configure({ mode: 'serial' })

    let ctx1: BrowserContext
    let ctx2: BrowserContext
    let page1: Page
    let page2: Page

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
        ctx1 = await browser.newContext({ viewport: { width: 375, height: 812 } })
        ctx2 = await browser.newContext({ viewport: { width: 375, height: 812 } })
        page1 = await ctx1.newPage()
        page2 = await ctx2.newPage()
    })

    test.afterAll(async () => {
        // Aufräumen über die Oberfläche („Verbindung trennen“), nicht über Server Actions
        for (const [page, email, password] of [[page1, E1, P1], [page2, E2, P2]] as const) {
            try {
                if (!page || !email || !password) continue
                await page.goto('/')
                // Erst abwarten, ob Anmeldemaske oder Startseite erscheint, dann entscheiden
                const emailField = page.locator('input[type="email"]')
                await expect(emailField.or(budgetRing(page))).toBeVisible({ timeout: 20_000 })
                if (await emailField.isVisible()) await login(page, email, password)
                await cleanUp(page)
            } catch (e) {
                console.warn('Aufräumen fehlgeschlagen:', e)
            }
        }
        await ctx1?.close()
        await ctx2?.close()
    })

    test('Anfrage senden, Taube fliegt, Empfänger sieht Brief und nimmt an', async () => {
        // Konto 2 braucht seinen Namen, bevor Konto 1 ihn anschreiben kann
        await login(page2, E2!, P2!)
        await expect(budgetRing(page2)).toBeVisible({ timeout: 20_000 })
        await openFriendLink(page2)
        await setHandleIfAsked(page2, HANDLE_2)
        const handle2 = await readOwnHandle(page2)

        // Konto 1 setzt den Namen und schickt die Anfrage
        await login(page1, E1!, P1!)
        await expect(budgetRing(page1)).toBeVisible({ timeout: 20_000 })
        await openFriendLink(page1)
        await setHandleIfAsked(page1, HANDLE_1)
        await expect(page1.getByText('Noch nicht verbunden')).toBeVisible()
        await page1.getByLabel('Kontoname suchen').fill(handle2)
        await page1.getByRole('button', { name: 'Verbinden' }).click()
        await expect(page1.locator('[data-testid="dove"]')).toBeVisible()
        await expect(page1.locator('[data-testid="dove"]')).toBeHidden({ timeout: 8_000 })
        await expect(page1.getByText(/Anfrage gesendet/)).toBeVisible()

        // Konto 2 sieht den Brief nach dem Neuladen, öffnet ihn und nimmt an
        await page2.reload()
        await expect(page2.getByText('hat dir eine Taube geschickt')).toBeVisible({ timeout: 20_000 })
        await page2.getByRole('button', { name: 'Brief öffnen' }).click()
        await page2.getByRole('button', { name: 'Annehmen & verbinden' }).click()
        // Der Startseiten-Ring liegt schon hinter dem Brief sichtbar: erst wenn der Brief weg ist, steht die Annahme auf dem Server
        await expect(letterDialog(page2)).toBeHidden({ timeout: 20_000 })

        // Konto 1 sieht nach dem Neuladen die Verbindung
        await page1.reload()
        await expect(budgetRing(page1)).toBeVisible({ timeout: 20_000 })
        await openFriendLink(page1)
        await expect(page1.getByText(/Verbunden mit/)).toBeVisible()
    })
})

/** Der eigene Kontoname steht im Verknüpfen-Bildschirm links unter dem Avatar. */
async function readOwnHandle(page: Page): Promise<string> {
    const label = page.locator('[data-testid="own-handle"]')
    await expect(label).toBeVisible()
    return ((await label.textContent()) ?? '').replace(/^@/, '').trim()
}
