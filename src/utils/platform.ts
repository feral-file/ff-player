import { KeyCodes, LocalStorageItem } from '@/constants';
import DeviceManager from './DeviceManager';
import { v4 as uuidv4 } from 'uuid';
import { Event, EventEmitter } from './EventEmitter';
import { BrowserInfo, detect } from 'detect-browser';

interface DeviceInfo {
  modelName: string;
}

interface LGUDIDInfo {
  id: string;
}

interface LGSuccessResponse {
  results: { key: string; value: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class PlatformEventReceiver {
  static handlePlatformEvent(event: string) {
    console.log(`Handling platform event: ${event}`);
  }
}

export class KeyEvent extends PlatformEventReceiver {
  static override handlePlatformEvent(event: string) {
    super.handlePlatformEvent(event);
    const [keyId, keyLabel] = event.split('_');
    console.log(`Handling key event: ${keyId} - ${keyLabel}`);
    if (
      [KeyCodes.enter.toString(), KeyCodes.select.toString()].includes(keyId)
    ) {
      EventEmitter.emit(Event.toggleQrCode);
    }
    if (
      [KeyCodes.escape.toString(), KeyCodes.goBack.toString()].includes(keyId)
    ) {
      EventEmitter.emit(Event.escape);
    }

    if (
      [
        KeyCodes.arrowUp.toString(),
        KeyCodes.arrowDown.toString(),
        KeyCodes.arrowLeft.toString(),
        KeyCodes.arrowRight.toString(),
      ].includes(keyId)
    ) {
      // EventEmitter.emit(Event.sendLog);
    }
  }
}

export class DeviceName extends PlatformEventReceiver {
  static override handlePlatformEvent(event: string) {
    super.handlePlatformEvent(event);
    console.log(`Handling set device name event: ${event}`);
    DeviceManager.setName(`Samsung-${event}`);
  }
}

class Future<T> {
  promise: Promise<T>;
  private resolveFn!: (value: T) => void;
  private rejectFn!: (reason?: unknown) => void;
  private timeoutId: ReturnType<typeof setTimeout>;
  private static readonly DEFAULT_TIMEOUT = 1000;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolveFn = resolve;
      this.rejectFn = reject;
    });

    this.timeoutId = setTimeout(() => {
      this.reject('Operation timed out');
    }, Future.DEFAULT_TIMEOUT);
  }

  resolve(value: T) {
    clearTimeout(this.timeoutId);
    this.resolveFn(value);
  }

  reject(reason?: unknown) {
    console.log(`Rejecting future with reason: `, reason);
    clearTimeout(this.timeoutId);
    this.rejectFn(reason);
  }
}

class FutureManager {
  static instance = new FutureManager();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private futures: Map<string, Future<any>> = new Map<string, Future<any>>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getFuture(id: string): Future<any> | undefined {
    return this.futures.get(id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appendFuture(id: string, future: Future<any>) {
    this.futures.set(id, future);
  }

  removeFuture(id: string) {
    this.futures.delete(id);
  }
}

export class Config extends PlatformEventReceiver {
  // when this call is made, find id to complete the future
  static override handlePlatformEvent(event: string) {
    super.handlePlatformEvent(event);
    console.log(`Handling set config event: ${event}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const config = JSON.parse(event);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const id = config.id as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const isOk = config.ok;

    const future = FutureManager.instance.getFuture(id);
    if (future) {
      if (isOk) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        future.resolve(config.data);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        future.reject(config.errorMessage);
      }
      FutureManager.instance.removeFuture(id);
    } else {
      console.error(`No future found for id: ${id}`);
    }
  }
}

export interface PlatformConfigService {
  init(): Promise<void>;
  getString(key: string): Promise<string | null>;

  setString(key: string, value: string): Promise<void>;
}
export class TizenConfigService implements PlatformConfigService {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async init() {}
  async getString(key: string): Promise<string> {
    const id = uuidv4();
    const request = {
      id: id,
      handler: 'getString',
      data: { key: key },
    };
    // fire event to tizen
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).ConfigService?.postMessage(JSON.stringify(request));
      console.log(`Sent request to Tizen ${JSON.stringify(request)}`);
    } catch (e) {
      console.error('Failed to send request to Tizen: ', e);
    }

    const future = new Future<string>();
    FutureManager.instance.appendFuture(id, future);

    return future.promise;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async setString(key: string, value: string): Promise<any> {
    const id = uuidv4();
    const request = {
      id: id,
      handler: 'setString',
      data: { key: key, value: value },
    };
    // fire event to tizen
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (window as any).ConfigService?.postMessage(JSON.stringify(request));
      console.log(`Sent request to Tizen ${JSON.stringify(request)}`);
    } catch (e) {
      console.error('Failed to send request to Tizen: ', e);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const future = new Future<any>();
    FutureManager.instance.appendFuture(id, future);

    return future.promise;
  }
}

export class GoogleConfigService extends TizenConfigService {}

export class WebConfigService implements PlatformConfigService {
  // eslint-disable-next-line @typescript-eslint/require-await
  async init() {
    const deviceName = this.getOrCreateDeviceName();
    localStorage.setItem(LocalStorageItem.name, deviceName);
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
  async getString(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async setString(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }
}

export class LgConfigService implements PlatformConfigService {
  async init() {
    await this.registerDB();
    await this.setDeviceInfo();
  }

  async clearRegisterDB() {
    // Clear the existing database kind (if it exists)
    try {
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
        (window as any).webOS.service.request('luna://com.palm.db', {
          method: 'delKind',
          parameters: {
            id: `com.feralfile.display:1`,
          },
          onSuccess: function (response: unknown) {
            console.log('Kind deleted successfully:', response);
            resolve();
          },
          onFailure: function (error: { errorCode: number }) {
            if (error.errorCode === 404) {
              console.log('Kind not found, proceeding to register.');
              resolve();
            } else {
              console.error('Failed to delete kind:', error);
              reject(new Error('Failed to delete kind.'));
            }
          },
        });
      });
    } catch (error) {
      console.error('Error deleting kind:', error);
    }
  }

  async registerDB() {
    try {
      // Register the kind first
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
        (window as any).webOS.service.request('luna://com.palm.db', {
          method: 'putKind',
          parameters: {
            id: `com.feralfile.display:1`,
            owner: 'com.feralfile.display',
            indexes: [
              { name: 'key', props: [{ name: 'key' }] },
              { name: 'value', props: [{ name: 'value' }] },
            ],
          },
          onSuccess: function (response: unknown) {
            console.log('Kind registered successfully:', response);
            resolve();
          },
          onFailure: function (error: unknown) {
            console.error('Failed to register kind:', error);
            reject(new Error('Failed to register kind.'));
          },
        });
      });
    } catch (error) {
      console.error('Error registering kind:', error);
    }
  }

  async setDeviceInfo() {
    try {
      const deviceInfo = await this.getDeviceInfo();
      console.log(`LG Device name: ${deviceInfo.modelName}`);
      DeviceManager.setName(deviceInfo.modelName);
      const lgInfo = await this.getDeviceID();
      console.log(`LG Device ID: ${lgInfo.id}`);
      DeviceManager.setDeviceId(lgInfo.id);
    } catch (error) {
      console.error('Error getting device info:', error);
    }
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    return new Promise((resolve, reject) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
        (window as any).webOS.deviceInfo((deviceInfo: DeviceInfo) => {
          resolve(deviceInfo);
        });
      } catch (error) {
        console.log(error);
        reject(error as Error);
      }
    });
  }

  async getDeviceID(): Promise<LGUDIDInfo> {
    return new Promise((resolve, reject) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
        (window as any).webOSDev.LGUDID({
          onSuccess: function (response: LGUDIDInfo) {
            resolve(response);
          },
          onFailure: function (error: unknown) {
            console.log('Failed to get LG Device id:', error);
          },
        });
      } catch (error) {
        console.log(error);
        reject(error as Error);
      }
    });
  }

  async getString(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
      (window as any).webOS.service.request('luna://com.palm.db', {
        method: 'find',
        parameters: {
          query: {
            from: 'com.feralfile.display:1',
            where: [{ prop: 'key', op: '=', val: key }],
          },
        },
        onSuccess(response: LGSuccessResponse) {
          if (response.results.length > 0) {
            console.log(
              'Success response from LG:',
              key,
              ':',
              response.results[response.results.length - 1].value,
              response.results.length
            );

            resolve(response.results[response.results.length - 1].value);
          } else {
            resolve(null);
          }
        },
        onFailure(error: unknown) {
          console.error(`Failed to retrieve data: ${JSON.stringify(error)}`);
          reject(new Error('Failed to retrieve data.'));
        },
      });
    });
  }

  async setString(key: string, value: string): Promise<void> {
    try {
      // Insert the key-value pair after the kind has been registered
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
        (window as any).webOS.service.request('luna://com.palm.db', {
          method: 'put',
          parameters: {
            objects: [
              { _kind: 'com.feralfile.display:1', key: key, value: value },
            ],
          },
          onSuccess(response: unknown) {
            console.log(
              `Success response from LG: ${JSON.stringify(response)}`
            );
            resolve();
          },
          onFailure(response: unknown) {
            console.error(
              `Failed response from LG: ${JSON.stringify(response)}`
            );
            reject(new Error('Failed to insert data.'));
          },
        });
      });
    } catch (error) {
      console.error('Error in setString:', error);
      throw error;
    }
  }
}
