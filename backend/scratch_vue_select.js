const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('timesheet_dom.html', 'utf8');
const $ = cheerio.load(html);

$('.p-select').each((i, el) => {
    console.log(`Select ${i}: ${$(el).text().trim()}`);
});
