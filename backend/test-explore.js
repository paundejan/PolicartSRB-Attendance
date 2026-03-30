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
        
        // Find date inputs
        const dateInputs = await page.$$eval('input[type="date"], input.p-inputtext, input', els => els.map(e => ({ name: e.name, type: e.type, placeholder: e.placeholder, class: e.className })).filter(e => e.type !== 'hidden'));
        console.log("Inputs:", dateInputs);

        // Find pagination buttons or dropdowns
        const buttons = await page.$$eval('button', els => els.map(e => ({ text: e.innerText, ariaLabel: e.ariaLabel, class: e.className })));
        console.log("Buttons:", buttons);

        // Find standard primevue paginator elements
        const dropdowns = await page.$$eval('.p-dropdown-label, select', els => els.map(e => e.innerText || e.value));
        console.log("Dropdowns:", dropdowns);

        const textContent = await page.content();
        const fs = require('fs');
        fs.writeFileSync('page.html', textContent);

    } catch (e) {
        console.error("Test failed: ", e);
    } finally {
        await browser.close();
        process.exit(0);
    }
})();
