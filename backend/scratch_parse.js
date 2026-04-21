const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('timesheet_dom.html', 'utf8');
const $ = cheerio.load(html);

console.log("Looking for Godina and Mesec...");
$('*').each((i, el) => {
    const text = $(el).children().length === 0 ? $(el).text().trim() : '';
    if (text.includes('2026') || text.includes('04-20') || text.includes('April') || text.includes('Godina')) {
        console.log("MATCH:", $(el).prop("tagName"), text);
    }
});
