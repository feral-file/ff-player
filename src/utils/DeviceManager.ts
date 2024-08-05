import { v4 as uuidv4 } from "uuid";
import createBranchLink from "./createBranchLink";

class DeviceManager {
  static instance = new DeviceManager();

  private readonly deviceIdKey = "deviceId";
  private readonly locationIdKey = "locationId";
  private readonly topicIdKey = "topicId";
  private readonly nameKey = "name";
  private readonly branchLinkKey = "branchLink";

  private getFromLocalStorage(key: string): string | null {
    return localStorage.getItem(key);
  }

  private setToLocalStorage(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  public getDeviceId(): string | null {
    let deviceId = this.getFromLocalStorage(this.deviceIdKey);
    if (!deviceId) {
      deviceId = uuidv4();
      this.setToLocalStorage(this.deviceIdKey, deviceId!);
    }
    return deviceId;
  }

  public setLocationId(locationId: string): void {
    this.setToLocalStorage(this.locationIdKey, locationId);
  }

  public getLocationId(): string | null {
    return this.getFromLocalStorage(this.locationIdKey);
  }

  public setTopicId(topicId: string): void {
    this.setToLocalStorage(this.topicIdKey, topicId);
  }

  public getTopicId(): string | null {
    return this.getFromLocalStorage(this.topicIdKey);
  }

  public setName(name: string): void {
    this.setToLocalStorage(this.nameKey, name);
  }

  public getName(): string | null {
    return this.getFromLocalStorage(this.nameKey);
  }

  public getDeviceInfo() {
    const deviceId = this.getDeviceId();
    const locationId = this.getLocationId();
    const topicId = this.getTopicId();
    const name = this.getName();
    if (!locationId || !topicId) {
      return null;
    }
    return {
      device_id: deviceId,
      locationId,
      topicId,
      device_name: name || "",
      platform: "web",
    };
  }

  private keyWithDevice(key: string): string {
    const device = this.getDeviceInfo();
    return `${key}_${device?.locationId}_${device?.topicId}`;
  }

  public setBranchLink(branchLink: string): void {
    const key = this.keyWithDevice(this.branchLinkKey);
    this.setToLocalStorage(key, branchLink);
  }

  public getBranchLink(): string | null {
    const key = this.keyWithDevice(this.branchLinkKey);
    return this.getFromLocalStorage(key);
  }

  public async getOrGenerateBranchLink(): Promise<string | null> {
    let branchLink = this.getBranchLink();
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
      const deviceInfo = this.getDeviceInfo();
      if (!deviceInfo) {
        return null;
      }
      const data = {
        source: "feralfile_display",
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
