const { chromium } = require('playwright');
const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'file:./dev.db' } } });

(async () => {
    let browser;
    try {
        const credentials = await prisma.settings.findMany();
        const usernameConfig = credentials.find(c => c.key === 'kadrovska_username');
        const passwordConfig = credentials.find(c => c.key === 'kadrovska_password');
        
        browser = await chromium.launch({ headless: true, channel: 'msedge' });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto("https://app.kadrovska.app/api/auth/signin?callbackUrl=/");
        await page.fill('input[type="email"]', usernameConfig.value);
        await page.fill('input[type="password"]', passwordConfig.value);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
            page.click('button:has-text("Uloguj se")')
        ]);

        await page.goto('https://app.kadrovska.app/timesheet?month=3&year=2026');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(4000);

        await page.screenshot({ path: 'timesheet_url_param.png', type: 'png' });

        // try another way, simply pressing Tab to navigate and Enter to open?
    } catch (e) {
        console.error(e);
    } finally {
        if (browser) await browser.close();
        process.exit();
    }
})();
