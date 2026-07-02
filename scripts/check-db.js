const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const sessionCount = await prisma.session.count();
    console.log('✅ Session table accessible, row count:', sessionCount);

    const storeCount = await prisma.store.count();
    console.log('✅ Store table row count:', storeCount);

    const productCount = await prisma.productCache.count();
    console.log('✅ ProductCache table row count:', productCount);

    const variantCount = await prisma.variantMap.count();
    console.log('✅ VariantMap table row count:', variantCount);

    const syncLogCount = await prisma.syncLog.count();
    console.log('✅ SyncLog table row count:', syncLogCount);

    // If stores exist, list them
    if (storeCount > 0) {
      const stores = await prisma.store.findMany({ select: { shopDomain: true, isActive: true, accessToken: true } });
      console.log('\nExisting stores:');
      stores.forEach(s => {
        console.log(`  - ${s.shopDomain} | active: ${s.isActive} | token starts with: ${s.accessToken.substring(0, 6)}...`);
      });
    }
  } catch(e) {
    console.error('❌ DB check error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
