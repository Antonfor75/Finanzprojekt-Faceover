import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { budgetRing, selectHistoryTab } from './dashboard-flow'

// Zwei echte Konten gegen Supabase. Zugänge in der .env:
//   TEST_EMAIL / TEST_PASSWORD     (Konto 1, schickt die Anfrage)
//   TEST2_EMAIL / TEST2_PASSWORD   (Konto 2, nimmt sie an)
// Beide Konten brauchen die Freischaltung des Kassenbon-Scans (Chefansicht bzw. /admin): Freunde gibt es nur dafür.
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

// ---------- Teilen nach Artikeln ----------

const SEED_NAME = 'E2E-Teilen'
// Acht Artikel, zusammen 19,48 €. Die ersten vier (9,52 €) wandern zum Freund, die übrigen vier (9,96 €) bleiben.
const FRIEND_ITEMS = [['Bananen', 1.99], ['Hafermilch', 2.49], ['Vollkornbrot', 3.29], ['Spaghetti', 1.75]] as const
const OWN_ITEMS = [['Gouda', 4.19], ['Tomaten', 2.79], ['Spülmittel', 1.95], ['Schokolade', 1.03]] as const

/** Direkter Zugriff auf Supabase als das Testkonto, nur zum Anlegen und Aufräumen der Testdaten. */
async function asUser(email: string, password: string) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error || !data.user) throw new Error(`Anmeldung für Testdaten fehlgeschlagen: ${error?.message}`)
    return { sb, userId: data.user.id }
}

/** Legt "E2E-Teilen" (19,48 €, heute) mit acht Artikeln an. */
async function seedBon(email: string, password: string) {
    const { sb, userId } = await asUser(email, password)
    const { data: expense, error } = await sb.from('expenses')
        .insert({ description: SEED_NAME, amount: 19.48, expense_date: format(new Date(), 'yyyy-MM-dd'), category: 'Essen', user_id: userId })
        .select('id').single()
    if (error || !expense) throw new Error(`Ausgabe anlegen fehlgeschlagen: ${error?.message}`)
    const rows = [...FRIEND_ITEMS, ...OWN_ITEMS].map(([name, price]) => ({
        expense_id: expense.id, user_id: userId, name_raw: name, quantity: 1, unit: 'stk', unit_price: price, total_price: price, source: 'manual',
    }))
    const { error: itemsError } = await sb.from('receipt_items').insert(rows)
    if (itemsError) throw new Error(`Artikel anlegen fehlgeschlagen: ${itemsError.message}`)
}

async function countSeedExpenses(email: string, password: string): Promise<number> {
    const { sb } = await asUser(email, password)
    const { data, error } = await sb.from('expenses').select('id').eq('description', SEED_NAME)
    if (error) throw new Error(error.message)
    return data.length
}

/** Räumt liegengebliebene Testausgaben samt Artikeln weg (nur nötig, wenn ein Lauf mittendrin scheitert). */
async function removeSeedExpenses(email: string, password: string) {
    const { sb } = await asUser(email, password)
    const { data } = await sb.from('expenses').select('id').eq('description', SEED_NAME)
    const ids = (data ?? []).map((e) => e.id)
    if (ids.length === 0) return
    await sb.from('receipt_items').delete().in('expense_id', ids)
    await sb.from('expenses').delete().in('id', ids)
}

/** Verlauf → Liste → aktuelle Woche → heute: die Zeile der Testausgabe. */
async function openSeedRow(page: Page) {
    const today = new Date()
    await page.locator('[data-tour="nav-history"]').click()
    await selectHistoryTab(page, 'Liste')
    const weekLabel = page.locator('p', { hasText: new RegExp(`^KW ${format(today, 'w', { locale: de })}$`) })
    await page.locator('button.ledger-row').filter({ has: weekLabel }).first().click()
    await page.locator('button.ledger-row', { hasText: format(today, 'EEEE', { locale: de }) }).first().click()
    const row = page.getByTestId('history-row').filter({ hasText: SEED_NAME })
    await expect(row).toHaveCount(1)
    return row
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
    let handle1 = ''
    let handle2 = ''

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
        ctx1 = await browser.newContext({ viewport: { width: 375, height: 812 } })
        ctx2 = await browser.newContext({ viewport: { width: 375, height: 812 } })
        page1 = await ctx1.newPage()
        page2 = await ctx2.newPage()
    })

    test.afterAll(async () => {
        // Liegengebliebene Testausgabe (nur wenn der Artikel-Test mittendrin scheiterte)
        for (const [email, password] of [[E1, P1], [E2, P2]] as const) {
            try {
                if (email && password) await removeSeedExpenses(email, password)
            } catch (e) {
                console.warn('Testausgabe entfernen fehlgeschlagen:', e)
            }
        }
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
        handle2 = await readOwnHandle(page2)

        // Konto 1 setzt den Namen und schickt die Anfrage
        await login(page1, E1!, P1!)
        await expect(budgetRing(page1)).toBeVisible({ timeout: 20_000 })
        await openFriendLink(page1)
        await setHandleIfAsked(page1, HANDLE_1)
        handle1 = await readOwnHandle(page1)
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

    test('Bon nach Artikeln teilen, beide sehen nur ihren Anteil', async () => {
        test.setTimeout(150_000)

        // Konto 1 hat einen Bon über 19,48 € mit acht Artikeln
        await seedBon(E1!, P1!)
        await page1.goto('/')
        await expect(budgetRing(page1)).toBeVisible({ timeout: 20_000 })
        const row1 = await openSeedRow(page1)

        // Teilen → Nach Artikeln → vier Artikel zum Freund schieben
        await row1.getByText(SEED_NAME, { exact: true }).click()
        await page1.getByTestId('share-open').click()
        const sheet = page1.getByRole('dialog', { name: `${SEED_NAME} teilen` })
        await expect(sheet).toBeVisible()
        const byArticle = sheet.getByRole('button', { name: 'Nach Artikeln' })
        await expect(byArticle).toBeEnabled({ timeout: 20_000 })
        await byArticle.click()
        await expect(sheet.getByTestId('board-item')).toHaveCount(8)
        for (const [name] of FRIEND_ITEMS) {
            await sheet.getByRole('button', { name: new RegExp(`^${name},`) }).click()
        }
        await expect(sheet.getByTestId('board-sum-friend')).toHaveText('9,52 €')
        await expect(sheet.getByTestId('board-sum-me')).toHaveText('9,96 €')
        await sheet.getByRole('button', { name: 'Teilung speichern' }).click()
        await expect(sheet).toBeHidden({ timeout: 20_000 })

        // Konto 1: eigener Anteil groß, Hinweis mit dem Namen des Freundes
        const shared1 = page1.getByTestId('history-row').filter({ hasText: SEED_NAME })
        await expect(shared1.getByTestId('history-amount')).toHaveText(/9[.,]96/, { timeout: 20_000 })
        await expect(shared1.getByTestId('share-badge')).toHaveText(`Geteilt mit ${handle2} · Artikel`)
        await expect(shared1).toContainText('von 19,48 €')

        // Konto 2: nach dem Neuladen nur sein Anteil und genau vier Artikel
        await page2.reload()
        await expect(budgetRing(page2)).toBeVisible({ timeout: 20_000 })
        const row2 = await openSeedRow(page2)
        await expect(row2.getByTestId('history-amount')).toHaveText(/9[.,]52/)
        await expect(row2.getByTestId('share-badge')).toHaveText(`Von ${handle1} geteilt · Artikel`)
        await row2.getByText(SEED_NAME, { exact: true }).click()
        await expect(page2.getByTestId('history-item')).toHaveCount(4, { timeout: 20_000 })

        // Für beide löschen: bei beiden ist die Ausgabe weg
        // Die Zeile bleibt nach dem Neuladen aufgeklappt; sonst klappt der Versuch sie auf (wiederholt, bis der Knopf da ist)
        await expect(async () => {
            if (!(await page1.getByTestId('share-open').isVisible())) await shared1.getByText(SEED_NAME, { exact: true }).click({ timeout: 2_000 })
            await expect(page1.getByTestId('share-open')).toBeVisible({ timeout: 2_000 })
        }).toPass({ timeout: 20_000 })
        await page1.getByTestId('share-open').click()
        const change = page1.getByRole('dialog', { name: `${SEED_NAME} Teilung ändern` })
        await expect(change).toBeVisible()
        page1.once('dialog', (d) => { void d.accept() })
        await change.getByRole('button', { name: 'Für beide löschen' }).click()
        await expect(change).toBeHidden({ timeout: 20_000 })
        await expect(page1.getByTestId('history-row').filter({ hasText: SEED_NAME })).toHaveCount(0, { timeout: 20_000 })
        await expect.poll(() => countSeedExpenses(E1!, P1!), { timeout: 20_000 }).toBe(0)
        await expect.poll(() => countSeedExpenses(E2!, P2!), { timeout: 20_000 }).toBe(0)
    })
})

/** Der eigene Kontoname steht im Verknüpfen-Bildschirm links unter dem Avatar. */
async function readOwnHandle(page: Page): Promise<string> {
    const label = page.locator('[data-testid="own-handle"]')
    await expect(label).toBeVisible()
    return ((await label.textContent()) ?? '').replace(/^@/, '').trim()
}
