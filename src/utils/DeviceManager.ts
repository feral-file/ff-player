import { v4 as uuidv4 } from 'uuid';
import {
  FFDeviceConfigService,
  PlatformConfigService,
  WebConfigService,
} from './platform';
import * as Sentry from '@sentry/nextjs';
import { DeviceNamePrefix, LocalStorageItem, Platform } from '@/constants';
import { BrowserInfo, detect } from 'detect-browser';
import { DisplaySettings } from '@/models/display_settings.model';
import { ViewMode } from '@/models';

class DeviceManager {
  static instance = new DeviceManager();
  private _configService: PlatformConfigService | null = null;

  get configService(): PlatformConfigService {
    if (!this._configService) {
      this._configService = this.createConfigService();
    }
    return this._configService;
  }

  private createConfigService(): PlatformConfigService {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const platform = localStorage?.getItem(LocalStorageItem.platform);
    const browser = detect() as BrowserInfo;

    Sentry.addBreadcrumb({
      data: {
        platform,
        ...browser,
      },
      category: 'DeviceManager',
      message: 'Creating PlatformConfigService instance',
    });

    console.log(
      `[DEVICE] creating PlatformConfigService instance for platform: ${platform ?? 'Web'}`
    );
    if (platform === Platform.ffDevice) {
      return new FFDeviceConfigService();
    }

    return new WebConfigService();
  }

  private getFromLocalStorage(key: string): string | null {
    return this.configService.getString(key);
  }

  private setToLocalStorage(key: string, value: string): void {
    this.configService.setString(key, value).catch((error: unknown) => {
      Sentry.captureException(error);
      console.error(
        '[DEVICE] Error setting value to local storage',
        JSON.stringify(error)
      );
    });
  }

  public async init(): Promise<void> {
    await this.configService.init();
  }

  public getDeviceId(): string | null {
    let deviceId = this.getFromLocalStorage(LocalStorageItem.deviceId);
    const platform = localStorage.getItem(LocalStorageItem.platform);
    if (!deviceId && !platform) {
      deviceId = uuidv4();
      this.setToLocalStorage(LocalStorageItem.deviceId, deviceId);
    }

    return deviceId;
  }

  public setDeviceId(deviceId: string): void {
    this.setToLocalStorage(LocalStorageItem.deviceId, deviceId);
  }

  public getName(): string {
    const name = this.getFromLocalStorage(LocalStorageItem.name);
    return name ?? 'Unknown';
  }

  public setName(name: string): void {
    this.setToLocalStorage(LocalStorageItem.name, name);
  }

  public getDeviceModel(): string {
    const name = this.getFromLocalStorage(LocalStorageItem.name);
    if (!name) {
      return 'Unknown';
    }

    return this.stripPrefix(name);
  }

  private stripPrefix(name: string): string {
    return name.replace(DeviceNamePrefix.ffDevice, '');
  }

  public getPrimaryAddress(): string | null {
    return this.getFromLocalStorage(LocalStorageItem.primaryAddress);
  }

  public setPrimaryAddress(primaryAddress: string): void {
    this.setToLocalStorage(LocalStorageItem.primaryAddress, primaryAddress);
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
}

export default DeviceManager.instance;
