import { v4 as uuidv4 } from 'uuid';
import createBranchLink from './createBranchLink';
import {
  GoogleConfigService,
  LgConfigService,
  PlatformConfigService,
  TizenConfigService,
  WebConfigService,
} from './platform';
import { DeviceNamePrefix, LocalStorageItem, Platform } from '@/constants';

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
    const platform = localStorage.getItem(LocalStorageItem.platform);

    console.log(
      `creating PlatformConfigService instance for platform: ${platform ?? ''}`
    );
    switch (platform) {
      case Platform.google:
        return new GoogleConfigService();
      case Platform.tizen:
        return new TizenConfigService();
      case Platform.lg:
        return new LgConfigService();
      default:
        return new WebConfigService();
    }
  }

  private readonly deviceIdKey = 'deviceId';
  private readonly locationIdKey = 'locationId';
  private readonly topicIdKey = 'topicId';
  private readonly nameKey = 'device_name';
  private readonly branchLinkKey = 'branchLink';
  private readonly previouslyConnectedDeviceIdsKey =
    'previouslyConnectedDeviceIds';

  private async getFromLocalStorage(key: string): Promise<string | null> {
    return await this.configService.getString(key);
  }

  private setToLocalStorage(key: string, value: string): void {
    this.configService.setString(key, value).catch((error: unknown) => {
      console.error('Error setting value to local storage', error);
    });
  }

  public async getDeviceId(): Promise<string | null> {
    let deviceId = await this.getFromLocalStorage(LocalStorageItem.deviceId);
    if (!deviceId) {
      deviceId = uuidv4();
      this.setToLocalStorage(LocalStorageItem.deviceId, deviceId);
    }
    return deviceId;
  }

  public setLocationId(locationId: string): void {
    this.setToLocalStorage(LocalStorageItem.locationID, locationId);
  }

  public async getLocationId(): Promise<string | null> {
    return await this.getFromLocalStorage(LocalStorageItem.locationID);
  }

  public setTopicId(topicId: string): void {
    this.setToLocalStorage(LocalStorageItem.topicID, topicId);
  }

  public async getTopicId(): Promise<string | null> {
    return await this.getFromLocalStorage(LocalStorageItem.topicID);
  }

  public setName(name: string): void {
    this.setToLocalStorage(LocalStorageItem.name, name);
  }

  public async getName(): Promise<string> {
    try {
      const name = await this.getFromLocalStorage(LocalStorageItem.name);
      return this.getDeviceName(name);
    } catch (error) {
      console.error('Error getting device name', error);
      return 'Unknown';
    }
  }

  private getDeviceName(name: string | null): string {
    if (!name) {
      return 'Unknown';
    }

    const platform = localStorage.getItem(LocalStorageItem.platform);
    // Replace name if already starts with prefix
    name = name
      .replace(DeviceNamePrefix.google, '')
      .replace(DeviceNamePrefix.samsung, '')
      .replace(DeviceNamePrefix.lg, '');

    switch (platform) {
      case Platform.google:
        return `${DeviceNamePrefix.google}${name}`;
      case Platform.tizen:
        return `${DeviceNamePrefix.samsung}${name}`;
      case Platform.lg:
        return `${DeviceNamePrefix.lg}${name}`;
      default:
        return name;
    }
  }

  public setPreviouslyConnectedDeviceIds(deviceIds: string[]): void {
    this.setToLocalStorage(
      LocalStorageItem.previouslyConnectedDeviceIds,
      JSON.stringify(deviceIds)
    );
  }

  public async getPreviouslyConnectedDeviceIds(): Promise<string[]> {
    const deviceIdsJson = await this.getFromLocalStorage(
      LocalStorageItem.previouslyConnectedDeviceIds
    );
    if (!deviceIdsJson) {
      return [];
    }
    return JSON.parse(deviceIdsJson) as string[];
  }

  public async addPreviouslyConnectedDeviceId(deviceId: string): Promise<void> {
    const deviceIds = await this.getPreviouslyConnectedDeviceIds();
    deviceIds.push(deviceId);
    this.setPreviouslyConnectedDeviceIds(deviceIds);
  }

  public clearPreviouslyConnectedDeviceIds(): void {
    this.setPreviouslyConnectedDeviceIds([]);
  }

  public async isPreviouslyConnectedDevice(deviceId: string): Promise<boolean> {
    const deviceIds = await this.getPreviouslyConnectedDeviceIds();
    return deviceIds.includes(deviceId);
  }

  public async getDeviceInfo() {
    try {
      const deviceId = await this.getDeviceId();
      const locationId = await this.getLocationId();
      const topicId = await this.getTopicId();
      const name = await this.getName();

      if (!locationId || !topicId) {
        return null;
      }

      return {
        deviceId,
        locationId,
        topicId,
        name: name,
        platform: 'web',
      };
    } catch (error) {
      console.error('Error getting device info', error);
      return null;
    }
  }

  private async keyWithDevice(key: string): Promise<string> {
    const device = await this.getDeviceInfo();
    return `${key}_${device?.locationId ?? ''}_${device?.topicId ?? ''}`;
  }

  public async setBranchLink(branchLink: string): Promise<void> {
    const key = await this.keyWithDevice(LocalStorageItem.branchLink);
    this.setToLocalStorage(key, branchLink);
  }

  public async getBranchLink(): Promise<string | null> {
    const key = await this.keyWithDevice(LocalStorageItem.branchLink);
    return await this.getFromLocalStorage(key);
  }

  public async getOrGenerateBranchLink(): Promise<string | null> {
    let branchLink = await this.getBranchLink();
    if (!branchLink) {
      branchLink = await this.generateBranchLink();
      if (branchLink) {
        await this.setBranchLink(branchLink);
      }
    }
    return branchLink;
  }

  public async generateBranchLink(): Promise<string | null> {
    try {
      const deviceInfo = await this.getDeviceInfo();
      if (!deviceInfo) {
        return null;
      }
      const data = {
        source: 'feralfile_display',
        device: deviceInfo,
      };
      return await createBranchLink(data);
    } catch (e) {
      console.error(e);
      return null;
    }
  }
}

export default DeviceManager.instance;
