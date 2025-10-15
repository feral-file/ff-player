import { LocalStorageItem } from '@/constants';
import { DisplaySettings } from '@/models/display_settings.model';
import { CastInfo, ViewMode } from '@/models';

class DeviceManager {
  static instance = new DeviceManager();

  private getFromLocalStorage(key: string): string | null {
    return localStorage.getItem(key);
  }

  private setToLocalStorage(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  public getDeviceId(): string | null {
    return this.getFromLocalStorage(LocalStorageItem.deviceId);
  }

  public setDeviceId(deviceId: string): void {
    this.setToLocalStorage(LocalStorageItem.deviceId, deviceId);
  }

  public getName(): string {
    return this.getFromLocalStorage(LocalStorageItem.name) ?? 'Unknown';
  }

  public setName(name: string): void {
    this.setToLocalStorage(LocalStorageItem.name, name);
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
}

export default DeviceManager.instance;
