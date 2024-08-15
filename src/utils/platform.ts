import { IgnoreKeyCodes } from '@/constants';
import DeviceManager from './DeviceManager';
import { v4 as uuidv4 } from 'uuid';
import { Event, EventEmitter } from './EventEmitter';

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
    if (IgnoreKeyCodes.some(keyCode => keyCode.toString() === keyId)) {
      return;
    }

    EventEmitter.emit(Event.toggleQrCode);
  }
}

export class DeviceName extends PlatformEventReceiver {
  static override handlePlatformEvent(event: string) {
    super.handlePlatformEvent(event);
    console.log(`Handling set device name event: ${event}`);
    DeviceManager.setName(event);
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
  getString(key: string): Promise<string | null>;

  setString(key: string, value: string): Promise<void>;
}

export class AndroidConfigService implements PlatformConfigService {
  // eslint-disable-next-line @typescript-eslint/require-await
  async getString(key: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    return (window as any).flutter_inappwebview.callHandler('getString', {
      data: key,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async setString(key: string, value: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    return (window as any).flutter_inappwebview.callHandler('setString', {
      data: { key: key, value: value },
    });
  }
}

export class TizenConfigService implements PlatformConfigService {
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
      (window as any).ConfigService.postMessage(JSON.stringify(request));
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

export class WebConfigService implements PlatformConfigService {
  // eslint-disable-next-line @typescript-eslint/require-await
  async getString(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async setString(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }
}
