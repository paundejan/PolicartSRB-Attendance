const { syncTimesheet } = require('./src/timesheetSync');
const { PrismaClient } = require('./src/generated/client');

(async () => {
    console.log('Running sync for 2026-03...');
    const result = await syncTimesheet(2026, 3);
    console.log(result);
    process.exit();
})();
