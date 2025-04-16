import { v4 as uuidv4 } from 'uuid';
import {
  FFDeviceConfigService,
  GoogleConfigService,
  LgConfigService,
  PlatformConfigService,
  TizenConfigService,
  WebConfigService,
} from './platform';
import * as Sentry from '@sentry/nextjs';
import { DeviceNamePrefix, LocalStorageItem, Platform } from '@/constants';
import { BrowserInfo, detect } from 'detect-browser';
import { DisplaySettings } from '@/models/display_settings.model';

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
    switch (platform) {
      case Platform.google:
        return new GoogleConfigService();
      case Platform.tizen:
        return new TizenConfigService();
      case Platform.lg:
        return new LgConfigService();
      case Platform.ffDevice:
        return new FFDeviceConfigService();
      default:
        return new WebConfigService();
    }
  }

  private async getFromLocalStorage(key: string): Promise<string | null> {
    try {
      return await this.configService.getString(key);
    } catch (error) {
      Sentry.captureException(error);
      return null;
    }
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

  public async getDeviceId(): Promise<string | null> {
    try {
      let deviceId = await this.getFromLocalStorage(LocalStorageItem.deviceId);
      const platform = localStorage.getItem(LocalStorageItem.platform);
      if (!deviceId && !platform) {
        deviceId = uuidv4();
        this.setToLocalStorage(LocalStorageItem.deviceId, deviceId);
      }

      return deviceId;
    } catch (error) {
      console.error('[DEVICE] Error getting device ID', JSON.stringify(error));
      return null;
    }
  }

  public setDeviceId(deviceId: string): void {
    this.setToLocalStorage(LocalStorageItem.deviceId, deviceId);
  }

  public setName(name: string): void {
    this.setToLocalStorage(LocalStorageItem.name, name);
  }

  public async getName(): Promise<string> {
    try {
      const name = await this.getFromLocalStorage(LocalStorageItem.name);
      return name ?? 'Unknown';
    } catch (error) {
      console.error(
        '[DEVICE] Error getting device name',
        JSON.stringify(error)
      );
      return 'Unknown';
    }
  }

  public async getDeviceModel(): Promise<string> {
    try {
      const name = await this.getFromLocalStorage(LocalStorageItem.name);
      if (!name) {
        return 'Unknown';
      }

      return this.stripPrefix(name);
    } catch (error) {
      console.error(
        '[DEVICE] Error getting device name',
        JSON.stringify(error)
      );
      return 'Unknown';
    }
  }

  private stripPrefix(name: string): string {
    return name
      .replace(DeviceNamePrefix.google, '')
      .replace(DeviceNamePrefix.samsung, '')
      .replace(DeviceNamePrefix.lg, '')
      .replace(DeviceNamePrefix.ffDevice, '');
  }

  public setPrimaryAddress(primaryAddress: string): void {
    this.setToLocalStorage(LocalStorageItem.primaryAddress, primaryAddress);
  }

  public async getPrimaryAddress(): Promise<string | null> {
    return await this.getFromLocalStorage(LocalStorageItem.primaryAddress);
  }

  public setDeviceDisplaySettings(
    displaySettings: DisplaySettings | null
  ): void {
    this.setToLocalStorage(
      LocalStorageItem.displaySettings,
      displaySettings ? JSON.stringify(displaySettings) : '{}'
    );
  }

  public async getDeviceDisplaySettings(): Promise<DisplaySettings | null> {
    const config = await this.getFromLocalStorage(
      LocalStorageItem.displaySettings
    );
    return config ? (JSON.parse(config) as DisplaySettings) : null;
  }
}

export default DeviceManager.instance;
