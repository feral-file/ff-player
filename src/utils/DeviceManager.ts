import { v4 as uuidv4 } from 'uuid';
import { FFDeviceConfigService, PlatformConfigService } from './platform';
import * as Sentry from '@sentry/nextjs';
import { DeviceNamePrefix, LocalStorageItem, PLATFORM } from '@/constants';
import { BrowserInfo, detect } from 'detect-browser';
import { DeviceDisplaySettings } from '@/models/display_settings.model';
import { ViewMode } from '@/models';

export class DeviceManager {
  private static instance: DeviceManager | null;
  private _configService: PlatformConfigService | null = null;

  public static getInstance() {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  get configService(): PlatformConfigService {
    if (!this._configService) {
      this._configService = this.createConfigService();
    }
    return this._configService;
  }

  private createConfigService(): PlatformConfigService {
    const browser = detect() as BrowserInfo;

    Sentry.addBreadcrumb({
      data: {
        PLATFORM,
        ...browser,
      },
      category: 'DeviceManager',
      message: 'Creating PlatformConfigService instance',
    });

    console.log('[DEVICE] creating PlatformConfigService instance ');
    return new FFDeviceConfigService();
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
    console.log('[DeviceManager] init', this.configService);
    await this.configService.init();
  }

  public getDeviceId(): string | null {
    let deviceId = this.getFromLocalStorage(LocalStorageItem.deviceId);
    if (!deviceId) {
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

  public getDeviceDisplaySettings(): DeviceDisplaySettings | null {
    const config = this.getFromLocalStorage(LocalStorageItem.displaySettings);
    return config ? (JSON.parse(config) as DeviceDisplaySettings) : null;
  }

  public setDeviceDisplaySettings(
    displaySettings: DeviceDisplaySettings | null
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

export const deviceManager = DeviceManager.getInstance();
