const { chromium } = require('playwright');
const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
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
        await page.waitForSelector('tr', { timeout: 15000 }).catch(e => console.log("No tr found"));
        
        const rows = await page.$$('tr');
        console.log(`Found ${rows.length} tr tags.`);
        if (rows.length > 1) {
           const cols = await rows[1].$$eval('td, th', elements => elements.map(e => e.innerText));
           console.log("Columns of first data row: ");
           console.log(cols);
        }

    } catch (e) {
        console.error("Test failed: ", e);
    } finally {
        await browser.close();
        process.exit(0);
    }
})();
