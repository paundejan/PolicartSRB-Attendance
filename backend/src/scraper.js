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

async function runScraper(datesArray = [null]) {
    console.log(`Starting Kadrovska Scraper for ${datesArray.length} date(s)...`);
    let browser = null;
    let totalNewRecordsCount = 0;

    try {
        const credentials = await prisma.settings.findMany();
        const usernameConfig = credentials.find(c => c.key === 'kadrovska_username');
        const passwordConfig = credentials.find(c => c.key === 'kadrovska_password');
        
        if (!usernameConfig || !passwordConfig) {
            throw new Error("Credentials not found in Database Settings. Please add them via the UI.");
        }

        browser = await chromium.launch({ 
            headless: true,
            channel: 'msedge' 
        });
        
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

        console.log("Navigating to daily activities...");
        await page.goto('https://app.kadrovska.app/daily-activities');
        await page.waitForLoadState('networkidle');

        for (const targetDate of datesArray) {
            if (targetDate) {
                // targetDate is 'YYYY-MM-DD', convert to 'DD.MM.YYYY' for Kadrovska
                const [year, month, day] = targetDate.split('-');
                const localDateStr = `${day}.${month}.${year}`;
                
                console.log(`Processing date: ${localDateStr}`);
                
                const dateInput = page.locator('input[placeholder="Datum"]');
                await dateInput.click();
                await page.waitForTimeout(500); // UI breathing room
                await dateInput.fill('');
                await dateInput.fill(localDateStr);
                await page.keyboard.press('Enter');
                
                // Wait for the table to reload with new data
                await page.waitForTimeout(2000);
                await page.waitForLoadState('networkidle');
            } else {
                console.log("Processing default date (today)...");
            }

            // Begin pagination loop for the current date
            let hasNextPage = true;
            let pageNum = 1;

            while (hasNextPage) {
                console.log(`Scraping Page ${pageNum}...`);
                await page.waitForSelector('table tr', { timeout: 10000 }).catch(e => {});

                const rows = await page.$$('table tr');
                console.log(`Found ${rows.length} rows to process on Page ${pageNum}.`);

                for (const row of rows) {
                    const columns = await row.$$('td');
                    if (columns.length < 5) continue; // Skip headers or malformed rows

                    const nameStr = await columns[0].innerText();
                    const detailStr = await columns[4].innerText(); // e.g. "Na poslu"
                    const clockInRaw = await columns[2].innerText();
                    const clockOutRaw = await columns[3].innerText();

                    const name = nameStr.trim();
                    const details = detailStr.trim();

                    const processEvent = async (rawString, baseEventType) => {
                        if (!rawString || rawString.trim() === '') return;
                        
                        const parts = rawString.trim().split(' ');
                        if (parts.length < 2) return;
                        
                        const dateRaw = parts[0]; // 28.03.2026
                        const dateSegments = dateRaw.split('.');
                        const date = dateSegments.length === 3 ? `${dateSegments[2]}-${dateSegments[1]}-${dateSegments[0]}` : dateRaw;
                        
                        const time = parts[1]; // 15:16:15
                        
                        const existing = await prisma.attendanceRecord.findFirst({
                            where: { 
                                date: date,
                                employeeName: name,
                                eventType: baseEventType,
                                timestamp: time
                            }
                        });

                        if (!existing) {
                            await prisma.attendanceRecord.create({
                                data: {
                                    date: date,
                                    eventType: baseEventType,
                                    timestamp: time,
                                    employeeName: name
                                }
                            });
                            totalNewRecordsCount++;
                            
                            // Auto-create employee if they don't exist yet
                            const empParts = name.trim().split(' ');
                            const lastName = empParts[0] || '';
                            const firstName = empParts.slice(1).join(' ') || '';
                            
                            // Try to find if they exist (independent of inversion and middle name dots)
                            const allEmps = await prisma.employee.findMany();
                            const existingEmp = allEmps.find(e => nameMatch(name, e.firstName, e.lastName));

                            if (!existingEmp) {
                                await prisma.employee.create({
                                    data: {
                                        firstName: firstName,
                                        lastName: lastName,
                                        department: '-', // default
                                        position: '-'    // default
                                    }
                                });
                            }
                        }
                    };

                    await processEvent(clockInRaw, "Prijava");
                    await processEvent(clockOutRaw, "Odjava");
                }

                // Check pagination
                const nextButton = page.locator('button[aria-label="Next Page"]');
                if (await nextButton.count() > 0) {
                    const isNextDisabled = await nextButton.evaluate(el => el.classList.contains('p-disabled') || el.disabled);
                    if (!isNextDisabled) {
                        await nextButton.click();
                        await page.waitForTimeout(1500); // Wait for transition
                        await page.waitForLoadState('networkidle');
                        pageNum++;
                        continue;
                    }
                }
                
                hasNextPage = false; // No more pages found or disabled
            }
        }

        console.log(`Scraper finished. Upserted ${totalNewRecordsCount} new events.`);
        return { success: true, count: totalNewRecordsCount };

    } catch (error) {
        console.error("Scraper Error: ", error);
        return { success: false, error: error.message };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { runScraper };
