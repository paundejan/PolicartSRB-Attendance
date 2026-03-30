const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ channel: 'msedge' });
    const page = await browser.newPage();
    await page.goto('https://app.kadrovska.app/api/auth/signin?callbackUrl=/');
    
    console.log("Waiting for inputs to load...");
    await page.waitForSelector('input', { timeout: 15000 });
    
    const inputs = await page.$$eval('input', elements => elements.map(e => ({ name: e.name, type: e.type, id: e.id, placeholder: e.placeholder })));
    console.log("Input elements: ", inputs);

    const buttons = await page.$$eval('button', elements => elements.map(e => e.innerText));
    console.log("Button Texts: ", buttons);

    await browser.close();
})();
