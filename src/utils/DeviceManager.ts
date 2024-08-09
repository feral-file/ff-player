import { v4 as uuidv4 } from 'uuid';
import createBranchLink from './createBranchLink';
import {
  AndroidConfigService,
  PlatformConfigService,
  TizenConfigService,
  WebConfigService,
} from './platform';

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
    const platform = localStorage.getItem('platform');

    console.log(
      `creating PlatformConfigService instance for platform: ${platform}`
    );
    switch (platform) {
      case 'android':
        return new AndroidConfigService();
      case 'tizen':
        return new TizenConfigService();
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
    this.configService.setString(key, value);
  }

  public async getDeviceId(): Promise<string | null> {
    let deviceId = await this.getFromLocalStorage(this.deviceIdKey);
    if (!deviceId) {
      deviceId = uuidv4();
      this.setToLocalStorage(this.deviceIdKey, deviceId!);
    }
    return deviceId;
  }

  public setLocationId(locationId: string): void {
    this.setToLocalStorage(this.locationIdKey, locationId);
  }

  public async getLocationId(): Promise<string | null> {
    return await this.getFromLocalStorage(this.locationIdKey);
  }

  public setTopicId(topicId: string): void {
    this.setToLocalStorage(this.topicIdKey, topicId);
  }

  public async getTopicId(): Promise<string | null> {
    return await this.getFromLocalStorage(this.topicIdKey);
  }

  public setName(name: string): void {
    this.setToLocalStorage(this.nameKey, name);
  }

  public async getName(): Promise<string | null> {
    return await this.getFromLocalStorage(this.nameKey);
  }

  public setPreviouslyConnectedDeviceIds(deviceIds: string[]): void {
    this.setToLocalStorage(
      this.previouslyConnectedDeviceIdsKey,
      JSON.stringify(deviceIds)
    );
  }

  public async getPreviouslyConnectedDeviceIds(): Promise<string[]> {
    const deviceIdsJson = await this.getFromLocalStorage(
      this.previouslyConnectedDeviceIdsKey
    );
    if (!deviceIdsJson) {
      return [];
    }
    return JSON.parse(deviceIdsJson);
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
      name: name || '',
      platform: 'web',
    };
  }

  private async keyWithDevice(key: string): Promise<string> {
    const device = await this.getDeviceInfo();
    return `${key}_${device?.locationId}_${device?.topicId}`;
  }

  public async setBranchLink(branchLink: string): Promise<void> {
    const key = await this.keyWithDevice(this.branchLinkKey);
    this.setToLocalStorage(key, branchLink);
  }

  public async getBranchLink(): Promise<string | null> {
    const key = await this.keyWithDevice(this.branchLinkKey);
    return await this.getFromLocalStorage(key);
  }

  public async getOrGenerateBranchLink(): Promise<string | null> {
    let branchLink = await this.getBranchLink();
    if (!branchLink) {
      branchLink = await this.generateBranchLink();
      if (branchLink) {
        this.setBranchLink(branchLink);
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
      return createBranchLink(data);
    } catch (e) {
      console.error(e);
      return null;
    }
  }
}

export default DeviceManager.instance;
