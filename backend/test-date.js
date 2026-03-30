const fs = require('fs');
const html = fs.readFileSync('page.html', 'utf8');

const regex = /<p-calendar[^>]+>/g;
const calendars = html.match(regex);
console.log("Calendars: ", calendars);

const inputs = html.match(/<input[^>]+p-datepicker-[^>]+>/g);
console.log("Date Inputs: ", inputs);
