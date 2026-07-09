import { prisma } from '../lib/db/prisma';

async function run() {
  const count = await prisma.webhookEvent.count();
  console.log("Total Webhook Events in database:", count);
  const events = await prisma.webhookEvent.findMany({
    orderBy: { processedAt: 'desc' },
    take: 10
  });
  console.log("Recent events:", JSON.stringify(events, null, 2));
  await prisma.$disconnect();
}

run().catch(console.error);
