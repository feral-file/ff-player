import { LocalStorageItem } from '@/constants';
import { DisplaySettings } from '@/models/display_settings.model';
import { CastInfo, ViewMode } from '@/models';
import { DP1Call } from '@/models/dp1.model';
import indexedDBStorage from './IndexedDBStorage';

const PRELOAD_KEYS: string[] = [
  LocalStorageItem.castInfo,
  LocalStorageItem.displaySettings,
  LocalStorageItem.viewMode,
  LocalStorageItem.criticalTemp,
  LocalStorageItem.dp1ScheduledTask,
  LocalStorageItem.bootPlaylist,
  LocalStorageItem.versionUpdateReload,
];

class DeviceManager {
  static instance = new DeviceManager();

  private cache = new Map<string, string | null>();
  private initPromise: Promise<void> | null = null;
  private initialized = false;

  private localStorageAvailable(): boolean {
    try {
      return typeof localStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  private readFromLocalStorage(key: string): string | null {
    if (!this.localStorageAvailable()) {
      return null;
    }

    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private removeFromLegacyStorage(key: string): void {
    if (!this.localStorageAvailable()) {
      return;
    }

    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore quota issues – this is best-effort cleanup only.
    }
  }

  private getCachedValue(key: string): string | null {
    if (this.cache.has(key)) {
      return this.cache.get(key) ?? null;
    }

    const legacyValue = this.readFromLocalStorage(key);
    if (legacyValue !== null) {
      this.cache.set(key, legacyValue);
      return legacyValue;
    }

    return null;
  }

  private async fetchAndCache(key: string): Promise<string | null> {
    if (this.cache.has(key)) {
      return this.cache.get(key) ?? null;
    }

    let value: string | null = null;
    try {
      value = await indexedDBStorage.getItem(key);
    } catch (error) {
      console.error(
        `[DeviceManager] Error fetching "${key}" from IndexedDB:`,
        error
      );
    }

    if (value === null) {
      const legacyValue = this.readFromLocalStorage(key);
      if (legacyValue !== null) {
        value = legacyValue;
        try {
          await indexedDBStorage.setItem(key, legacyValue);

          // Remove legacy data after successful migration
          this.removeFromLegacyStorage(key);
        } catch (error) {
          console.error(
            `[DeviceManager] Error migrating "${key}" to IndexedDB:`,
            error
          );
        }
      }
    }

    this.cache.set(key, value);
    return value;
  }

  private async preloadCache(): Promise<void> {
    await Promise.all(PRELOAD_KEYS.map(key => this.fetchAndCache(key)));
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initPromise ??= this.preloadCache().catch((error: unknown) => {
      console.error('[DeviceManager] Failed to preload cache:', error);
      throw error;
    });

    await this.initPromise;
  }

  public async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public async getDeviceDisplaySettings(): Promise<DisplaySettings | null> {
    await this.ensureInitialized();
    const config = await this.fetchAndCache(LocalStorageItem.displaySettings);
    return config ? (JSON.parse(config) as DisplaySettings) : null;
  }

  public async setDeviceDisplaySettings(
    displaySettings: DisplaySettings | null
  ): Promise<void> {
    await this.ensureInitialized();
    const payload = displaySettings ? JSON.stringify(displaySettings) : '{}';
    this.cache.set(LocalStorageItem.displaySettings, payload);
    await indexedDBStorage.setItem(LocalStorageItem.displaySettings, payload);
  }

  public async getViewMode(): Promise<ViewMode | null> {
    await this.ensureInitialized();
    const config = await this.fetchAndCache(LocalStorageItem.viewMode);
    return config ? (config as ViewMode) : null;
  }

  public async setViewMode(viewMode: ViewMode): Promise<void> {
    await this.ensureInitialized();
    this.cache.set(LocalStorageItem.viewMode, viewMode);
    await indexedDBStorage.setItem(LocalStorageItem.viewMode, viewMode);
  }

  public async getCastInfo(): Promise<CastInfo | null> {
    await this.ensureInitialized();
    const castInfoString = await this.fetchAndCache(LocalStorageItem.castInfo);
    if (castInfoString != null) {
      try {
        return JSON.parse(castInfoString) as CastInfo;
      } catch (error) {
        console.error('Error init cast info', error);
      }
    }

    return null;
  }

  public async setDeviceInfo(castInfo: CastInfo | null): Promise<void> {
    await this.ensureInitialized();
    const serialized = JSON.stringify(castInfo);
    this.cache.set(LocalStorageItem.castInfo, serialized);
    await indexedDBStorage.setItem(LocalStorageItem.castInfo, serialized);
  }

  public async getBootPlaylist(): Promise<DP1Call | null> {
    await this.ensureInitialized();
    const bootPlaylist = await this.fetchAndCache(
      LocalStorageItem.bootPlaylist
    );
    return bootPlaylist ? (JSON.parse(bootPlaylist) as DP1Call) : null;
  }

  public async setBootPlaylist(bootPlaylist: DP1Call): Promise<void> {
    await this.ensureInitialized();
    const serialized = JSON.stringify(bootPlaylist);
    this.cache.set(LocalStorageItem.bootPlaylist, serialized);
    await indexedDBStorage.setItem(LocalStorageItem.bootPlaylist, serialized);
  }

  public async getItem(key: string): Promise<string | null> {
    await this.ensureInitialized();
    return await this.fetchAndCache(key);
  }

  public async setItem(key: string, value: string): Promise<void> {
    await this.ensureInitialized();
    this.cache.set(key, value);
    await indexedDBStorage.setItem(key, value);
  }

  public async removeItem(key: string): Promise<void> {
    await this.ensureInitialized();
    this.cache.set(key, null);
    await indexedDBStorage.removeItem(key);
    this.removeFromLegacyStorage(key);
  }

  public getCachedDeviceDisplaySettings(): DisplaySettings | null {
    const config = this.getCachedValue(LocalStorageItem.displaySettings);
    return config ? (JSON.parse(config) as DisplaySettings) : null;
  }

  public getCachedViewMode(): ViewMode | null {
    const viewMode = this.getCachedValue(LocalStorageItem.viewMode);
    return viewMode ? (viewMode as ViewMode) : null;
  }

  public getCachedCastInfo(): CastInfo | null {
    const castInfoString = this.getCachedValue(LocalStorageItem.castInfo);
    if (castInfoString) {
      try {
        return JSON.parse(castInfoString) as CastInfo;
      } catch (error) {
        console.error(
          '[DeviceManager] Failed to parse cached cast info',
          error
        );
      }
    }
    return null;
  }

  public getCachedBootPlaylist(): DP1Call | null {
    const bootPlaylist = this.getCachedValue(LocalStorageItem.bootPlaylist);
    return bootPlaylist ? (JSON.parse(bootPlaylist) as DP1Call) : null;
  }

  public getCachedItem(key: string): string | null {
    return this.getCachedValue(key);
  }
}

export default DeviceManager.instance;

// Warm the cache as soon as the module is evaluated so that synchronous reads
// (e.g. during CDP status checks) have data available quickly.
void DeviceManager.instance.initialize().catch((error: unknown) => {
  console.error('[DeviceManager] Failed to initialize during startup:', error);
});
