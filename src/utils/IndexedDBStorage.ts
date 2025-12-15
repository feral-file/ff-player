/**
 * IndexedDB Storage Utility
 * Provides a localStorage-like API using IndexedDB for larger storage capacity
 */

const DB_NAME = 'FeralFileDisplayDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyValueStore';

class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  private async init(): Promise<void> {
    if (this.db) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error(
          '[IndexedDBStorage] Failed to open database:',
          request.error
        );
        reject(new Error(request.error?.message ?? 'Failed to open database'));
      };

      request.onsuccess = () => {
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

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  /**
   * Get a value from IndexedDB
   */
  async getItem(key: string): Promise<string | null> {
    try {
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
   * Set a value in IndexedDB
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
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
   * Remove a value from IndexedDB
   */
  async removeItem(key: string): Promise<void> {
    try {
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
   * Clear all values from IndexedDB
   */
  async clear(): Promise<void> {
    try {
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
