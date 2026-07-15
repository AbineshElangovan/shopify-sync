const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.productCache.findMany({where: {sku: {in: ['TKT-GRY-001', 'GST-GRN-001']}}}).then(r => console.log(r)).finally(()=>p.$disconnect());
