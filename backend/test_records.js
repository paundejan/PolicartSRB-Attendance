const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient({datasources: { db: { url: 'file:./dev.db' } }});
(async () => {
  const rs = await prisma.leaveRecord.findMany({ where: { employeeName: 'MILAN SAVIĆ' } });
  console.log('MILAN SAVIC:', rs.length);
  const rsJ = await prisma.leaveRecord.findMany({ where: { employeeName: 'MILOŠ JEVTIĆ' } });
  console.log('MILOS JEVTIC:', rsJ.length);
})().finally(() => prisma.$disconnect());
