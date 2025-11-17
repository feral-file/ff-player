import { LocalStorageItem } from '@/constants';
import { DisplaySettings } from '@/models/display_settings.model';
import { CastInfo, ViewMode } from '@/models';
import { DP1Call } from '@/models/dp1.model';

class DeviceManager {
  static instance = new DeviceManager();

  private getFromLocalStorage(key: string): string | null {
    return localStorage.getItem(key);
  }

  private setToLocalStorage(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  public getDeviceDisplaySettings(): DisplaySettings | null {
    const config = this.getFromLocalStorage(LocalStorageItem.displaySettings);
    return config ? (JSON.parse(config) as DisplaySettings) : null;
  }

  public setDeviceDisplaySettings(
    displaySettings: DisplaySettings | null
  ): void {
    this.setToLocalStorage(
      LocalStorageItem.displaySettings,
      displaySettings ? JSON.stringify(displaySettings) : '{}'
    );
  }

  public getViewMode(): ViewMode | null {
    const config = this.getFromLocalStorage(LocalStorageItem.viewMode);
    return config ? (config as ViewMode) : null;
  }

  public setViewMode(viewMode: ViewMode): void {
    this.setToLocalStorage(LocalStorageItem.viewMode, viewMode);
  }

  public getCastInfo(): CastInfo | null {
    const castInfoString = this.getFromLocalStorage(LocalStorageItem.castInfo);
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

  public setDeviceInfo(castInfo: CastInfo | null): void {
    this.setToLocalStorage(LocalStorageItem.castInfo, JSON.stringify(castInfo));
  }

  public getBootPlaylist(): DP1Call | null {
    const bootPlaylist = this.getFromLocalStorage(
      LocalStorageItem.bootPlaylist
    );
    return bootPlaylist ? (JSON.parse(bootPlaylist) as DP1Call) : null;
  }

  public setBootPlaylist(bootPlaylist: DP1Call): void {
    this.setToLocalStorage(
      LocalStorageItem.bootPlaylist,
      JSON.stringify(bootPlaylist)
    );
  }
}

export default DeviceManager.instance;
