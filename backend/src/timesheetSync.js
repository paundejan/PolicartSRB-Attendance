const { chromium } = require('playwright');
const { PrismaClient } = require('./generated/client');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.SQLITE_DB_URL || "file:./dev.db"
        }
    }
});

function extractNameWords(str) {
    return (str || '').toLowerCase().replace(/[.,()]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
}
function nameMatch(rawName, firstName, lastName) {
    return extractNameWords(rawName) === extractNameWords(`${firstName} ${lastName}`);
}

const MONTHS_SR = ['Januar', 'Februar', 'Mart', 'April', 'Maj', 'Jun', 'Jul', 'Avgust', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'];

const LEAVE_TYPES = ['VP', 'B30', 'B31', 'PO', 'NO', 'GO', 'SD', 'OR', 'POD', 'NI', 'UR', 'SL', 'MR', 'DP N', 'DPN'];

async function syncTimesheet(year, monthIndex) {
    const targetYearStr = String(year);
    const targetMonthStr = MONTHS_SR[monthIndex - 1]; // monthIndex is 1-12
    console.log(`Starting Timesheet Sync for ${targetMonthStr} ${targetYearStr}...`);
    
    let browser = null;
    let recordsAdded = 0;

    try {
        const credentials = await prisma.settings.findMany();
        const usernameConfig = credentials.find(c => c.key === 'kadrovska_username');
        const passwordConfig = credentials.find(c => c.key === 'kadrovska_password');
        
        if (!usernameConfig || !passwordConfig) {
            throw new Error("Credentials not found in Database Settings. Please add them via the UI.");
        }

        const employees = await prisma.employee.findMany();

        browser = await chromium.launch({ headless: true, channel: 'msedge' });
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
        await page.waitForTimeout(2000); // UI breathing room

        try {
            await page.waitForSelector('.p-select', { timeout: 10000 });
            
            console.log(`Selecting Year: ${targetYearStr}`);
            await page.locator('.p-select').nth(0).locator('.p-select-dropdown').click();
            await page.waitForTimeout(1000);
            await page.locator('.p-select-option').filter({ hasText: targetYearStr }).first().click();
            await page.waitForTimeout(1500); // Wait for potential UI re-render

            console.log(`Selecting Month: ${targetMonthStr}`);
            await page.locator('.p-select').nth(1).locator('.p-select-dropdown').click();
            await page.waitForTimeout(1000);
            await page.locator('.p-select-option').filter({ hasText: targetMonthStr }).first().click();
            await page.waitForTimeout(1000);

            console.log("Clicking 'Prikaži'");
            await page.click('button:has-text("Prikaži")');
            await page.waitForTimeout(4000); // Give time for table to populate
            await page.waitForLoadState('networkidle');
        } catch (e) {
            console.warn("Dropdown selection failed, proceeding with default state or current page.", e.message);
        }

        let hasNextPage = true;
        let pageNum = 1;

        while (hasNextPage) {
            console.log(`Scraping Page ${pageNum}...`);
            await page.waitForSelector('table tr', { timeout: 10000 }).catch(() => {});

            const rows = await page.$$('table tr');
            console.log(`Found ${rows.length} rows on page ${pageNum}`);

            // Rows[0] is header. Length is ~32 (Zaposleni, Sifra, 1, 2, ..., 31)
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const cols = await row.$$('td, th');
                if (cols.length < 32) continue; // Skip incomplete

                const nameText = await cols[0].innerText();
                const rawName = nameText.trim();
                if (!rawName) continue;

                // Find local worker
                const localEmp = employees.find(e => nameMatch(rawName, e.firstName, e.lastName));
                if (!localEmp) {
                    console.log(`Skipping unknown employee: ${rawName}`);
                    continue;
                }

                const localFullName = `${localEmp.firstName} ${localEmp.lastName}`;

                for (let day = 1; day <= 31; day++) {
                    const colIndex = day + 1; // Zaposleni=0, Sifra=1, day1=2, ...
                    if (colIndex >= cols.length) break;

                    const cellText = (await cols[colIndex].innerText()).trim();
                    let type = cellText;
                    if (type === 'DPN') type = 'DP N'; // Normalize space

                    if (LEAVE_TYPES.includes(type)) {
                        const dateStr = `${targetYearStr}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        
                        // Insert or Update the LeaveRecord
                        await prisma.leaveRecord.upsert({
                            where: {
                                employeeName_date: { employeeName: localFullName, date: dateStr }
                            },
                            update: { leaveType: type },
                            create: { employeeName: localFullName, date: dateStr, leaveType: type }
                        });
                        recordsAdded++;
                    }
                }
            }

            // Pagination logic
            const nextBtns = await page.$$('.p-paginator-next');
            if (nextBtns.length > 0) {
                const nextBtn = nextBtns[0];
                const isDisabled = await nextBtn.evaluate(b => b.hasAttribute('disabled') || b.classList.contains('p-disabled'));
                
                if (!isDisabled) {
                    await nextBtn.click();
                    await page.waitForTimeout(2000);
                    await page.waitForLoadState('networkidle');
                    pageNum++;
                } else {
                    hasNextPage = false;
                }
            } else {
                hasNextPage = false;
            }
        }

        console.log(`Sync complete. Synced events: ${recordsAdded}`);
        return { success: true, count: recordsAdded };

    } catch (err) {
        console.error("Scraping error:", err);
        return { success: false, error: err.message };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { syncTimesheet };
