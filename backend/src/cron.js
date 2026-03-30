const cron = require('node-cron');
const { runScraper } = require('./scraper');

function initCronJobs() {
    // Run every day at 23:00 (11:00 PM)
    cron.schedule('0 23 * * *', async () => {
        console.log("Running scheduled Sync job at 23:00...");
        try {
            await runScraper();
            console.log("Scheduled sync completed successfully.");
        } catch (error) {
            console.error("Scheduled sync failed: ", error);
        }
    });
    console.log("Cron job initialized (runs daily at 23:00).");
}

module.exports = { initCronJobs };
