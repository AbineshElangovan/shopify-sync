const globalShared: any = global;
globalShared.syncLocks = globalShared.syncLocks || new Set<string>();

// Helper for async locks to prevent race conditions during concurrent execution (e.g. collection creation)
globalShared.asyncLocks = globalShared.asyncLocks || new Map<string, Promise<void>>();
export async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previousLock = globalShared.asyncLocks.get(key);
  let releaseLock: () => void;
  const newLock = new Promise<void>((resolve) => { releaseLock = resolve; });
  const taskPromise = (async () => {
    if (previousLock) await previousLock;
    try { return await task(); }
    finally {
      releaseLock!();
      if (globalShared.asyncLocks.get(key) === newLock) globalShared.asyncLocks.delete(key);
    }
  })();
  globalShared.asyncLocks.set(key, newLock);
  return taskPromise;
}

export function acquireSyncLock(shop: string, id: string, identifier: string): boolean {
  const normalizedShop = shop.replace(/^https?:\/\//, '').trim();
  const cleanId = id.replace('gid://shopify/Product/', '').trim();
  const key = `${normalizedShop}:${cleanId}:${identifier}`;

  if (globalShared.syncLocks.has(key)) {
    return false;
  }
  globalShared.syncLocks.add(key);
  console.log(`[SyncLock] Acquired lock for key: ${key}`);

  setTimeout(() => {
    if (globalShared.syncLocks.has(key)) {
      globalShared.syncLocks.delete(key);
      console.log(`[SyncLock] Auto-released expired lock for key: ${key}`);
    }
  }, 45000);
  return true;
}

export function hasSyncLock(shop: string, id: string, identifier: string): boolean {
  const normalizedShop = shop.replace(/^https?:\/\//, '').trim();
  const cleanId = id.replace('gid://shopify/Product/', '').trim();
  const key = `${normalizedShop}:${cleanId}:${identifier}`;
  return globalShared.syncLocks.has(key);
}

export function releaseSyncLock(shop: string, id: string, identifier: string) {
  const normalizedShop = shop.replace(/^https?:\/\//, '').trim();
  const cleanId = id.replace('gid://shopify/Product/', '').trim();
  const key = `${normalizedShop}:${cleanId}:${identifier}`;
  if (globalShared.syncLocks.has(key)) {
    globalShared.syncLocks.delete(key);
    console.log(`[SyncLock] Explicitly released lock for key: ${key}`);
  }
}
