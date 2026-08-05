import { prisma } from '../lib/db/prisma';
import { encrypt, decrypt } from '../lib/utils/encryption';

async function main() {
  console.log('Starting token encryption migration...');
  const stores = await prisma.store.findMany();
  let updatedCount = 0;

  for (const store of stores) {
    let needsUpdate = false;
    const updateData: any = {};

    // Check accessToken
    if (store.accessToken) {
      try {
        // If decryption succeeds, it's already encrypted
        decrypt(store.accessToken);
      } catch (err) {
        // Decryption failed, treat it as plain text and encrypt it
        console.log(`Encrypting accessToken for shop: ${store.shopDomain}`);
        updateData.accessToken = encrypt(store.accessToken);
        needsUpdate = true;
      }
    }

    // Check refreshToken
    const storeRefreshToken = (store as any).refreshToken;
    if (storeRefreshToken) {
      try {
        // If decryption succeeds, it's already encrypted
        decrypt(storeRefreshToken);
      } catch (err) {
        // Decryption failed, treat it as plain text and encrypt it
        console.log(`Encrypting refreshToken for shop: ${store.shopDomain}`);
        updateData.refreshToken = encrypt(storeRefreshToken);
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await prisma.store.update({
        where: { id: store.id },
        data: updateData,
      });
      updatedCount++;
    }
  }

  console.log(`Migration complete. Encrypted tokens for ${updatedCount} stores.`);

  console.log('Starting Session table encryption migration...');
  const sessions = await prisma.session.findMany();
  let sessionUpdatedCount = 0;

  for (const session of sessions) {
    let needsUpdate = false;
    const updateData: any = {};

    // Check accessToken
    const sessionAccessToken = (session as any).accessToken;
    if (sessionAccessToken) {
      try {
        decrypt(sessionAccessToken);
      } catch (err) {
        console.log(`Encrypting accessToken for session: ${session.id}`);
        updateData.accessToken = encrypt(sessionAccessToken);
        needsUpdate = true;
      }
    }

    // Check refreshToken
    const sessionRefreshToken = (session as any).refreshToken;
    if (sessionRefreshToken) {
      try {
        decrypt(sessionRefreshToken);
      } catch (err) {
        console.log(`Encrypting refreshToken for session: ${session.id}`);
        updateData.refreshToken = encrypt(sessionRefreshToken);
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await prisma.session.update({
        where: { id: session.id },
        data: updateData,
      });
      sessionUpdatedCount++;
    }
  }

  console.log(`Session Migration complete. Encrypted tokens for ${sessionUpdatedCount} sessions.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
