const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient({datasources: { db: { url: 'file:./dev.db' } }});
(async () => {
  const recs = await prisma.attendanceRecord.findMany({
    where: { date: '2026-04-02' },
    orderBy: { timestamp: 'asc' }
  });
  const grouped = {};
  for (const rec of recs) {
    const key = `${rec.employeeName}||${rec.date}`;
    if (!grouped[key]) grouped[key] = { name: rec.employeeName, date: rec.date, entries: [], exits: [] };
    if (rec.eventType === 'Prijava') grouped[key].entries.push(rec.timestamp);
    if (rec.eventType === 'Odjava') grouped[key].exits.push(rec.timestamp);
  }
  // Find all keys that contain IVIC
  for (const [key, g] of Object.entries(grouped)) {
    if (key.includes('IVI')) {
      console.log(`Key: "${key}" (bytes: ${Buffer.from(key).toString('hex')})`);
      console.log(`  entries: ${JSON.stringify(g.entries)}`);
      console.log(`  exits: ${JSON.stringify(g.exits)}`);
    }
  }
})().finally(() => prisma.$disconnect());
