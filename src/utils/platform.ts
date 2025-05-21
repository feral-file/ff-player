import { DeviceNamePrefix, LocalStorageItem } from '@/constants';
import DeviceManager from './DeviceManager';
import { BrowserInfo, detect } from 'detect-browser';

export interface PlatformConfigService {
  init(): Promise<void>;
  getString(key: string): string | null;

  setString(key: string, value: string): Promise<void>;
}

export class WebConfigService implements PlatformConfigService {
  // eslint-disable-next-line @typescript-eslint/require-await
  async init() {
    this.setDeviceInfo();
  }

  setDeviceInfo() {
    const deviceName = this.getOrCreateDeviceName();
    DeviceManager.setName(deviceName);
  }

  generateRandomString(length: number): string {
    const characters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }

  getOrCreateDeviceName() {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!localStorage) {
      return 'Unknown';
    }

    let deviceName = localStorage.getItem(LocalStorageItem.name);
    if (!deviceName) {
      const platform = navigator.platform;
      const browser = detect() as BrowserInfo;
      const randomString = this.generateRandomString(4);

      deviceName = `${platform}-${browser.name}-${randomString}`;
    }
    return deviceName;
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  getString(key: string): string | null {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return localStorage?.getItem(key);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async setString(key: string, value: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    localStorage?.setItem(key, value);
  }
}

export class FFDeviceConfigService extends WebConfigService {
  override getOrCreateDeviceName(): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    let deviceName = localStorage?.getItem(LocalStorageItem.name);
    if (!deviceName) {
      deviceName = DeviceNamePrefix.ffDevice + '0.0.0';
    }

    return deviceName;
  }

  override setDeviceInfo() {
    super.setDeviceInfo();
    DeviceManager.setDeviceId(this.getDeviceID());
  }

  getDeviceID(): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    let deviceID = localStorage?.getItem(LocalStorageItem.deviceId);
    if (!deviceID) {
      deviceID = 'unknown-id';
    }

    return deviceID;
  }
}
