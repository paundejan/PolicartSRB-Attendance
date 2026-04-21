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

        await page.goto('https://app.kadrovska.app/timesheet');
        await page.waitForTimeout(3000);

        // Get total pages or try to click next
        const nextBtns = await page.$$('.p-paginator-next');
        console.log('Next buttons found:', nextBtns.length);
        
        if (nextBtns.length > 0) {
            let cl = await nextBtns[0].getAttribute('class');
            console.log('Classes:', cl);
            await nextBtns[0].click();
            await page.waitForTimeout(3000);
            const firstRow = await page.locator('tbody tr').first().innerText();
            console.log('First row on page 2:', firstRow);
        }
    } catch (e) {
        console.error(e);
    } finally {
        if (browser) await browser.close();
        process.exit();
    }
})();
