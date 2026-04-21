const { chromium } = require('playwright');
const { PrismaClient } = require('./src/generated/client');
const fs = require('fs');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "file:./dev.db"
        }
    }
});

async function run() {
    const credentials = await prisma.settings.findMany();
    const usernameConfig = credentials.find(c => c.key === 'kadrovska_username');
    const passwordConfig = credentials.find(c => c.key === 'kadrovska_password');
    
    if (!usernameConfig || !passwordConfig) {
        throw new Error("Credentials not found");
    }

    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Navigating to login...");
    await page.goto("https://app.kadrovska.app/api/auth/signin?callbackUrl=/");
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"]', usernameConfig.value);
    await page.fill('input[type="password"]', passwordConfig.value);

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
        page.click('button:has-text("Uloguj se")')
    ]);

    console.log("Navigating to timesheet...");
    await page.goto('https://app.kadrovska.app/timesheet');
    await page.waitForLoadState('networkidle');

    console.log("Waiting 3s for data to load...");
    await page.waitForTimeout(3000);

    const html = await page.content();
    fs.writeFileSync('C:\\PROJECTS\\ANTIGRAVITY\\PolicatSRB Attendance\\backend\\timesheet_dom.html', html);
    console.log("Saved timesheet_dom.html");

    await browser.close();
}

run().catch(console.error);
