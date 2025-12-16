import { LocalStorageItem } from '@/constants';
import { DisplaySettings } from '@/models/display_settings.model';
import { CastInfo, ViewMode } from '@/models';
import { DP1Call } from '@/models/dp1.model';
import indexedDBStorage from './IndexedDBStorage';

class DeviceManager {
  static instance = new DeviceManager();

  private localStorageAvailable(): boolean {
    try {
      return typeof localStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * Read from IndexedDB, but fallback to existing localStorage data (from older app versions).
   * When a fallback hit occurs, migrate the value into IndexedDB for future reads.
   */
  private async getFromStorage(key: string): Promise<string | null> {
    const value = await indexedDBStorage.getItem(key);
    if (value !== null) return value;

    if (!this.localStorageAvailable()) return null;

    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      // Best-effort migrate the legacy value into IndexedDB for next time.
      await indexedDBStorage.setItem(key, legacy);
      return legacy;
    }

    return null;
  }

  private async setToStorage(key: string, value: string): Promise<void> {
    await indexedDBStorage.setItem(key, value);
  }

  public async getDeviceDisplaySettings(): Promise<DisplaySettings | null> {
    const config = await this.getFromStorage(LocalStorageItem.displaySettings);
    return config ? (JSON.parse(config) as DisplaySettings) : null;
  }

  public async setDeviceDisplaySettings(
    displaySettings: DisplaySettings | null
  ): Promise<void> {
    await this.setToStorage(
      LocalStorageItem.displaySettings,
      displaySettings ? JSON.stringify(displaySettings) : '{}'
    );
  }

  public async getViewMode(): Promise<ViewMode | null> {
    const config = await this.getFromStorage(LocalStorageItem.viewMode);
    return config ? (config as ViewMode) : null;
  }

  public async setViewMode(viewMode: ViewMode): Promise<void> {
    await this.setToStorage(LocalStorageItem.viewMode, viewMode);
  }

  public async getCastInfo(): Promise<CastInfo | null> {
    const castInfoString = await this.getFromStorage(LocalStorageItem.castInfo);
    if (castInfoString != null) {
      try {
        const castInfo = JSON.parse(castInfoString) as CastInfo;
        return castInfo;
      } catch (error) {
        console.log('Error init cast info', error);
      }
    }

    return null;
  }

  public async setDeviceInfo(castInfo: CastInfo | null): Promise<void> {
    await this.setToStorage(
      LocalStorageItem.castInfo,
      JSON.stringify(castInfo)
    );
  }

  public async getBootPlaylist(): Promise<DP1Call | null> {
    const bootPlaylist = await this.getFromStorage(
      LocalStorageItem.bootPlaylist
    );
    return bootPlaylist ? (JSON.parse(bootPlaylist) as DP1Call) : null;
  }

  public async setBootPlaylist(bootPlaylist: DP1Call): Promise<void> {
    await this.setToStorage(
      LocalStorageItem.bootPlaylist,
      JSON.stringify(bootPlaylist)
    );
  }

  // Helper methods for simple key-value operations
  public async getItem(key: string): Promise<string | null> {
    return await indexedDBStorage.getItem(key);
  }

  public async setItem(key: string, value: string): Promise<void> {
    await indexedDBStorage.setItem(key, value);
  }

  public async removeItem(key: string): Promise<void> {
    await indexedDBStorage.removeItem(key);
  }
}

export default DeviceManager.instance;
