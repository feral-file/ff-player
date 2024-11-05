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
import { ArtFraming } from '@/services/AppControls';

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
      default:
        return new WebConfigService();
    }
  }

  private async getFromLocalStorage(key: string): Promise<string | null> {
    return await this.configService.getString(key);
  }

  private setToLocalStorage(key: string, value: string): void {
    this.configService.setString(key, value).catch((error: unknown) => {
      console.error(
        '[DEVICE] Error setting value to local storage',
        JSON.stringify(error)
      );
    });
  }

  public async init(): Promise<void> {
    await this.configService.init();
  }

  public async getDeviceId(): Promise<string> {
    try {
      let deviceId = await this.getFromLocalStorage(LocalStorageItem.deviceId);
      if (!deviceId) {
        deviceId = uuidv4();
        this.setToLocalStorage(LocalStorageItem.deviceId, deviceId);
      }
      return deviceId;
    } catch (error) {
      console.error('[DEVICE] Error getting device ID', JSON.stringify(error));
      return '';
    }
  }

  public setDeviceId(deviceId: string): void {
    this.setToLocalStorage(LocalStorageItem.deviceId, deviceId);
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

  public async getDeviceModel(): Promise<string> {
    try {
      const name = await this.getFromLocalStorage(LocalStorageItem.name);
      if (!name) {
        return 'Unknown';
      }

      return name
        .replace(DeviceNamePrefix.google, '')
        .replace(DeviceNamePrefix.samsung, '')
        .replace(DeviceNamePrefix.lg, '');
    } catch (error) {
      console.error(
        '[DEVICE] Error getting device name',
        JSON.stringify(error)
      );
      return 'Unknown';
    }
  }

  public async getName(): Promise<string> {
    try {
      const model = await this.getDeviceModel();
      return this.getDeviceName(model);
    } catch (error) {
      console.error(
        '[DEVICE] Error getting device name',
        JSON.stringify(error)
      );
      return 'Unknown';
    }
  }

  private getDeviceName(model: string | null): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!model || !localStorage) {
      return 'Unknown';
    }

    const platform = localStorage.getItem(LocalStorageItem.platform);
    switch (platform) {
      case Platform.google:
        return `${DeviceNamePrefix.google}${model}`;
      case Platform.tizen:
        return `${DeviceNamePrefix.samsung}${model}`;
      case Platform.lg:
        return `${DeviceNamePrefix.lg}${model}`;
      default:
        return model;
    }
  }

  public setPrimaryAddress(primaryAddress: string): void {
    this.setToLocalStorage(LocalStorageItem.primaryAddress, primaryAddress);
  }

  public async getPrimaryAddress(): Promise<string | null> {
    return await this.getFromLocalStorage(LocalStorageItem.primaryAddress);
  }

  public setOrientation(orientation: string): void {
    this.setToLocalStorage(LocalStorageItem.orientation, orientation);
  }

  public async getOrientation(): Promise<string | null> {
    return await this.getFromLocalStorage(LocalStorageItem.orientation);
  }

  public setArtFrameConfig(artFrameConfig: ArtFraming): void {
    this.setToLocalStorage(
      LocalStorageItem.artFraming,
      artFrameConfig.toString()
    );
  }

  public async getArtFrameConfig(): Promise<ArtFraming | undefined> {
    const config = await this.getFromLocalStorage(LocalStorageItem.artFraming);
    return config ? (parseInt(config) as ArtFraming) : undefined;
  }

  public async getDeviceInfo(appPlatform?: boolean) {
    try {
      const deviceId = await this.getDeviceId();
      const locationId = await this.getLocationId();
      const topicId = await this.getTopicId();
      const name = await this.getName();

      let platform = 'web';
      if (appPlatform) {
        platform = (
          localStorage.getItem(LocalStorageItem.platform) ?? 'web'
        ).toLocaleUpperCase();
      }

      return {
        deviceId,
        locationId,
        topicId,
        name: name,
        platform,
      };
    } catch (error) {
      console.error(
        '[DEVICE] Error getting device info',
        JSON.stringify(error)
      );
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
      console.log(
        '[DEVICE] Generating branch link with device info: ',
        JSON.stringify(deviceInfo)
      );

      const data = {
        source: 'feralfile_display',
        device: deviceInfo,
      };
      return await createBranchLink(data);
    } catch (e) {
      console.error('[DEVICE] Error generate branch link: ', JSON.stringify(e));
      return null;
    }
  }
}

export default DeviceManager.instance;
