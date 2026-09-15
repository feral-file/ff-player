/**
 * IndexedDB Storage Utility
 * Provides a localStorage-like API using IndexedDB for larger storage capacity.
 */

/**
 * How long one `indexedDB.open()` may take before the attempt is abandoned.
 *
 * A wedged open fires neither onsuccess nor onerror, so without a bound the
 * cached init promise stays pending for the life of the page and EVERY later
 * read and write waits on it forever — including the write a daemon would use
 * to repair the device. Tighter than the policy store's own read timeout, so
 * the inner layer is the one that gives up first.
 */
const OPEN_TIMEOUT_MS = 2000;

const DB_NAME = 'FeralFileDisplayDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyValueStore';

/**
 *
 */
export class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  /** Attempt counter, so an open abandoned at timeout cannot adopt later. */
  private openGeneration = 0;

  constructor(private readonly openTimeoutMs: number = OPEN_TIMEOUT_MS) {}

  private isSupported(): boolean {
    // Guard against server-side / worker contexts where indexedDB is undefined.
    return typeof indexedDB !== 'undefined';
  }

  /** Strict read: a storage failure is never collapsed into an absent record. */
  async getItemStrict(key: string): Promise<string | null> {
    await this.init();
    if (!this.db) {
      throw new Error('IndexedDB unavailable');
    }
    const db = this.db;
    return await new Promise<string | null>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      transaction.onabort = () => { reject(transaction.error ?? new Error('IndexedDB read aborted')); };
      transaction.onerror = () => { reject(transaction.error ?? new Error('IndexedDB read failed')); };
      transaction.oncomplete = () => {
        const result: unknown = request.result;
        if (result === undefined || result === null) {resolve(null);}
        else if (typeof result === 'string') {resolve(result);}
        else {reject(new Error('Invalid IndexedDB record'));}
      };
    });
  }

  /** Strict write: success means the IndexedDB transaction completed. */
  async setItemStrict(key: string, value: string): Promise<void> {
    await this.init();
    if (!this.db) {
      throw new Error('IndexedDB unavailable');
    }
    const db = this.db;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      transaction.oncomplete = () => { resolve(); };
      transaction.onabort = () => { reject(transaction.error ?? new Error('IndexedDB write aborted')); };
      transaction.onerror = () => { reject(transaction.error ?? new Error('IndexedDB write failed')); };
      transaction.objectStore(STORE_NAME).put(value, key);
    });
  }

  private async init(): Promise<void> {
    if (!this.isSupported()) {
      // No-op on unsupported environments (e.g., Node/SSR); behave as empty storage.
      return;
    }

    if (this.db) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    const generation = ++this.openGeneration;
    this.initPromise = this.openWithinTimeout(generation);

    try {
      await this.initPromise;
    } catch (error) {
      // Only the current attempt may clear the cache; a late failure from an
      // abandoned open must not discard a newer attempt already in flight.
      if (generation === this.openGeneration) {
        this.initPromise = null;
      }
      throw error;
    }
  }

  /** One bounded open attempt. An expiry and a failure are the same outcome. */
  private openWithinTimeout(generation: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      const expiry = setTimeout(() => {
        console.error('[IndexedDBStorage] Timed out opening database');
        reject(new Error('IndexedDB open timed out'));
      }, this.openTimeoutMs);

      request.onerror = () => {
        clearTimeout(expiry);
        console.error(
          '[IndexedDBStorage] Failed to open database:',
          request.error
        );
        reject(new Error(request.error?.message ?? 'Failed to open database'));
      };

      request.onsuccess = () => {
        clearTimeout(expiry);
        if (generation !== this.openGeneration) {
          // A newer attempt has taken over. Adopting this connection would race
          // it; close it rather than leave a second handle open on the file.
          request.result.close();
          return;
        }
        // Still the current attempt, so a connection arriving after the timeout
        // is useful rather than stale: adopt it, and the next call short
        // circuits on `this.db` instead of opening again.
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  /** Get a best-effort legacy value; new policy/history code uses strict reads. */
  async getItem(key: string): Promise<string | null> {
    try {
      if (!this.isSupported()) {return null;}
      await this.init();
      if (!this.db) {
        return null;
      }

      return await new Promise<string | null>((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }

        const transaction = this.db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onerror = () => {
          console.error(
            `[IndexedDBStorage] Error getting key "${key}":`,
            request.error
          );
          reject(new Error(request.error?.message ?? 'Failed to get item'));
        };

        request.onsuccess = () => {
          const result = request.result as string | null;
          resolve(result);
        };
      });
    } catch (error) {
      console.error(
        `[IndexedDBStorage] Error in getItem for key "${key}":`,
        error
      );
      return null;
    }
  }

  /**
   * Set a value in IndexedDB.
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (!this.isSupported()) {return;}
      await this.init();
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      await new Promise<void>((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }

        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, key);

        request.onerror = () => {
          console.error(
            `[IndexedDBStorage] Error setting key "${key}":`,
            request.error
          );
          reject(new Error(request.error?.message ?? 'Failed to set item'));
        };

        request.onsuccess = () => {
          resolve();
        };
      });
    } catch (error) {
      console.error(
        `[IndexedDBStorage] Error in setItem for key "${key}":`,
        error
      );
      // Don't throw - gracefully handle quota errors
      if (
        error instanceof DOMException &&
        (error.name === 'QuotaExceededError' ||
          error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      ) {
        console.warn(
          `[IndexedDBStorage] Quota exceeded for key "${key}", attempting cleanup`
        );
        // Try to remove the key and retry
        try {
          await this.removeItem(key);
        } catch (cleanupError) {
          console.error(
            '[IndexedDBStorage] Error during cleanup:',
            cleanupError
          );
        }
      }
    }
  }

  /**
   * Remove a value from IndexedDB.
   */
  async removeItem(key: string): Promise<void> {
    try {
      if (!this.isSupported()) {return;}
      await this.init();
      if (!this.db) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }

        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onerror = () => {
          console.error(
            `[IndexedDBStorage] Error removing key "${key}":`,
            request.error
          );
          reject(new Error(request.error?.message ?? 'Failed to remove item'));
        };

        request.onsuccess = () => {
          resolve();
        };
      });
    } catch (error) {
      console.error(
        `[IndexedDBStorage] Error in removeItem for key "${key}":`,
        error
      );
    }
  }

  /**
   * Clear all values from IndexedDB.
   */
  async clear(): Promise<void> {
    try {
      if (!this.isSupported()) {return;}
      await this.init();
      if (!this.db) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }

        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => {
          console.error(
            '[IndexedDBStorage] Error clearing store:',
            request.error
          );
          reject(new Error(request.error?.message ?? 'Failed to clear store'));
        };

        request.onsuccess = () => {
          resolve();
        };
      });
    } catch (error) {
      console.error('[IndexedDBStorage] Error in clear:', error);
    }
  }
}

// Export singleton instance
const indexedDBStorage = new IndexedDBStorage();
export default indexedDBStorage;
