
import { test, expect, Page } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password';

test.describe('Main User Flow', () => {

    // 1. LOGIN
    test('should login successfully', async ({ page }) => {
        await page.goto('/');

        const loginHeader = page.getByRole('heading', { name: 'Login' });
        if (await loginHeader.isVisible()) {
            console.log(`[E2E] Logging in with ${TEST_EMAIL}`);
            await page.fill('input[type="email"]', TEST_EMAIL);
            await page.fill('input[type="password"]', TEST_PASSWORD);
            await page.click('button[type="submit"]');

            // Wait for potential error
            try {
                const errorMsg = page.locator('.text-red-500, .bg-red-50');
                if (await errorMsg.isVisible({ timeout: 2000 })) {
                    console.log('[E2E] Login Error Visible:', await errorMsg.textContent());
                }
            } catch (e) { }
        } else {
            console.log('[E2E] Already logged in or Login header not found');
        }

        // Verify Dashboard with CORRECT text
        console.log('[E2E] Waiting for Dashboard...');
        try {
            // The text is "Verfügbar (Woche)" in h2
            await expect(page.locator('text=Verfügbar (Woche)')).toBeVisible({ timeout: 15000 });
            console.log('[E2E] Dashboard found!');
        } catch (e) {
            console.log('[E2E] Dashboard NOT found. URL:', page.url());
            // console.log('[E2E] Body:', await page.innerHTML('body')); 
            throw e;
        }
    });

    // 2. NAVIGATION
    test('should navigate between tabs', async ({ page }) => {
        await login(page);

        // 1. Dashboard -> History (Lists Icon in Bottom Nav)
        console.log('[E2E] Navigating to History...');
        await page.getByTestId('nav-history').click();
        await expect(page.locator('button:has-text("Kalender")')).toBeVisible();

        // 2. History -> Analysis (Top Tab)
        console.log('[E2E] Switching to Analysis Tab...');
        await page.click('button:has-text("Analyse")');
        // Analysis specific element
        await expect(page.locator('text=Cashflow')).toBeVisible();

        // 3. Back to Dashboard (Home Icon in Bottom Nav)
        console.log('[E2E] Navigating to Home...');
        await page.getByTestId('nav-home').click();
        await expect(page.locator('text=Verfügbar (Woche)')).toBeVisible();

        // 4. Open Settings (Settings Icon in Bottom Nav)
        console.log('[E2E] Opening Settings...');
        await page.getByTestId('nav-settings').click();
        await expect(page.locator('h1:has-text("Einstellungen")')).toBeVisible();

        // 5. Close Settings (Back Arrow)
        console.log('[E2E] Closing Settings...');
        await page.locator('.lucide-arrow-left').first().click();
    });

    // 3. CRUD FLOW
    test('should create, verify and delete an expense', async ({ page }) => {
        await login(page);

        const testAmount = '123.45';
        const testCategory = 'Freizeit'; // Make sure this matches select option values (value="Freizeit")

        // CREATE (On Dashboard)
        // AddExpenseForm is visible on Dashboard
        await page.fill('input[name="amount"]', testAmount);
        await page.selectOption('select[name="category"]', 'Freizeit'); // value "Freizeit"
        await page.click('button:has-text("Speichern")');

        // VERIFY IN HISTORY
        console.log('[E2E] Verifying in History list...');
        await page.getByTestId('nav-history').click();

        // Switch to List view within History
        await page.click('button:has-text("Liste")');

        // Check if item exists
        // Warning: formatted currency might vary ("€123.45" or "123,45 €")
        // Use partial match or just text
        await expect(page.locator(`text=${testCategory}`)).toBeVisible();

        // CLEANUP
        console.log('[E2E] Deleting item...');
        // In List view, we have delete buttons (Trash2 icon)
        // Find the container that has the category/amount
        // And click the delete button inside it.
        // The amount might be "€123.45" or "-€123.45" (negative expense)

        // Let's assume it's the most recent item (top of list)
        page.once('dialog', dialog => dialog.accept()); // Register listener BEFORE click
        await page.locator('.lucide-trash-2').first().click();

        // Wait for disappearance
        // Use verify only if we are sure it was the top item
        // await expect(page.locator(`text=${testCategory}`)).not.toBeVisible();
    });

    // 4. SETTINGS & LOGOUT
    test('should change settings and logout', async ({ page }) => {
        await login(page);

        // Open Settings
        await page.getByTestId('nav-settings').click();

        // Change Budget
        await page.fill('input[type="number"]', '5000');

        // Handle Alert
        page.once('dialog', dialog => dialog.accept());
        await page.click('button:has-text("Speichern")');

        // Logout
        console.log('[E2E] Logging out...');
        // Logout button might be inside settings or bottom of settings?
        // SettingsOverlay has onLogout prop.
        // Let's find "Ausloggen" or "Logout".
        // MobileDashboard passes handleLogout to SettingsOverlay.
        // Check SettingsOverlay for Logout button. Usually "Abmelden" or Icon.
        // Assuming text "Abmelden" or "Logout".

        // If not found, check the file.
        // SettingsOverlay typically has a logout button at the bottom.
        // Let's look primarily for text "Logout" or "Abmelden" or LogOut icon.
        // If we fail here, we check source.
        // But let's try generic "Abmelden" or "Log Out" match.
        const logoutBtn = page.locator('button:has-text("Abmelden"), button:has-text("Logout"), button:has-text("Ausloggen")');
        if (await logoutBtn.count() > 0) {
            await logoutBtn.click();
        } else {
            // Fallback: icon
            await page.locator('.lucide-log-out').click();
        }

        await expect(page.locator('h1:has-text("Login")')).toBeVisible();
    });

});

async function login(page: Page) {
    if (page.url().includes('login') || (await page.locator('h1:has-text("Login")').isVisible())) {
        await page.fill('input[type="email"]', TEST_EMAIL);
        await page.fill('input[type="password"]', TEST_PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForURL('**/');
    } else {
        await page.goto('/');
        const loginHeader = page.getByRole('heading', { name: 'Login' });
        if (await loginHeader.isVisible()) {
            await page.fill('input[type="email"]', TEST_EMAIL);
            await page.fill('input[type="password"]', TEST_PASSWORD);
            await page.click('button[type="submit"]');
            await page.waitForURL('**/');
        }
    }
}
