const { chromium } = require('playwright');
const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: false });
    try {
        const credentials = await prisma.settings.findMany();
        const usernameConfig = credentials.find(c => c.key === 'kadrovska_username');
        const passwordConfig = credentials.find(c => c.key === 'kadrovska_password');
        
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto("https://app.kadrovska.app/api/auth/signin?callbackUrl=/");
        await page.waitForLoadState('networkidle');

        await page.fill('input[type="email"]', usernameConfig.value);
        await page.fill('input[type="password"]', passwordConfig.value);

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
            page.click('button:has-text("Uloguj se")')
        ]);

        await page.goto('https://app.kadrovska.app/daily-activities');
        await page.waitForLoadState('networkidle');

        // Test setting the date
        const dateInput = page.locator('input[placeholder="Datum"]');
        await dateInput.click();
        await dateInput.fill('28.03.2026');
        await page.keyboard.press('Enter');
        
        // Wait for network/UI update
        await page.waitForTimeout(1000);
        await page.waitForLoadState('networkidle');

        let rows = await page.$$('table tr');
        console.log(`P1: Found ${rows.length - 1} rows.`);

        // Test pagination pagination Next Page
        const nextButton = page.locator('button[aria-label="Next Page"]');
        const isNextDisabled = await nextButton.evaluate(el => el.classList.contains('p-disabled') || el.disabled);
        console.log("Is Next Disabled?", isNextDisabled);

        if (!isNextDisabled) {
             await nextButton.click();
             await page.waitForTimeout(1000);
             rows = await page.$$('table tr');
             console.log(`P2: Found ${rows.length - 1} rows.`);
        }

    } catch (e) {
        console.error("Test failed: ", e);
    } finally {
        await browser.close();
        process.exit(0);
    }
})();
