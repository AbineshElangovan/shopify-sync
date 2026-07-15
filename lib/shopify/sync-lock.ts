type ResolveFunction = () => void;

class SyncLock {
  private locks: Map<string, Promise<void>>;

  constructor() {
    this.locks = new Map();
  }

  /**
   * Acquires a lock for the given key (e.g., an SKU or Inventory Item ID).
   * Returns a release function that must be called when the critical section is done.
   */
  async acquire(key: string): Promise<ResolveFunction> {
    const previousLock = this.locks.get(key);
    
    let resolveFn!: ResolveFunction;
    const newLock = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });

    // Queue the new lock after the previous one resolves (or immediately if none)
    this.locks.set(key, (previousLock || Promise.resolve()).then(() => newLock));

    if (previousLock) {
      await previousLock;
    }

    return () => {
      // Clean up the map if we are the last lock in the queue
      const currentLock = this.locks.get(key);
      if (currentLock === newLock) {
        this.locks.delete(key);
      }
      resolveFn();
    };
  }
}

// Global instance to survive hot-reloads in development
const globalForSyncLock = global as unknown as { syncLock: SyncLock };
export const syncLock = globalForSyncLock.syncLock || new SyncLock();

if (process.env.NODE_ENV !== 'production') {
  globalForSyncLock.syncLock = syncLock;
}
