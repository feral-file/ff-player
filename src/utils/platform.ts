import { KeyCodes } from "@/constants";
import DeviceManager from "./DeviceManager";
import { v4 as uuidv4 } from "uuid";
import { Event, EventEmitter } from "./EventEmitter";

class PlatformEventReceiver {
  static handlePlatformEvent(event: string) {
    console.log(`Handling platform event: ${event}`);
  }
}

export class KeyEvent extends PlatformEventReceiver {
  static override handlePlatformEvent(event: string) {
    super.handlePlatformEvent(event);
    const [keyId, keyLabel] = event.split("_");
    console.log(`Handling key event: ${keyId} - ${keyLabel}`);
    if (parseInt(keyId) === KeyCodes.escape) {
      EventEmitter.emit(Event.escape);
    }
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
  private rejectFn!: (reason?: any) => void;
  private timeoutId: ReturnType<typeof setTimeout>;
  private static readonly DEFAULT_TIMEOUT = 1000;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolveFn = resolve;
      this.rejectFn = reject;
    });

    this.timeoutId = setTimeout(() => {
      this.reject("Operation timed out");
    }, Future.DEFAULT_TIMEOUT);
  }

  resolve(value: T) {
    clearTimeout(this.timeoutId);
    this.resolveFn(value);
  }

  reject(reason?: any) {
    console.log(`Rejecting future with reason: ${reason}`);
    clearTimeout(this.timeoutId);
    this.rejectFn(reason);
  }
}

class FutureManager {
  static instance = new FutureManager();
  private futures: Map<string, Future<any>> = new Map<string, Future<any>>();

  getFuture(id: string): Future<any> | undefined {
    return this.futures.get(id);
  }

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
    const config = JSON.parse(event);
    const id = config.id;
    const isOk = config.ok;

    const future = FutureManager.instance.getFuture(id);
    if (future) {
      if (isOk) {
        future.resolve(config.data);
      } else {
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

  setString(key: string, value: string): Promise<any>;
}

export class AndroidConfigService implements PlatformConfigService {
  async getString(key: string): Promise<string> {
    return await (window as any).flutter_inappwebview.callHandler("getString", {
      data: key,
    });
  }

  async setString(key: string, value: string): Promise<void> {
    return await (window as any).flutter_inappwebview.callHandler("setString", {
      data: { key: key, value: value },
    });
  }
}

export class TizenConfigService implements PlatformConfigService {
  async getString(key: string): Promise<string> {
    const id = uuidv4();
    const request = {
      id: id,
      handler: "getString",
      data: { key: key },
    };
    // fire event to tizen
    try {
      (window as any).ConfigService?.postMessage(JSON.stringify(request));
      console.log(`Sent request to Tizen ${JSON.stringify(request)}`);
    } catch (e) {
      console.error(`Failed to send request to Tizen: ${e}`);
    }

    const future = new Future<string>();
    FutureManager.instance.appendFuture(id, future);

    return future.promise;
  }

  async setString(key: string, value: string): Promise<any> {
    const id = uuidv4();
    const request = {
      id: id,
      handler: "setString",
      data: { key: key, value: value },
    };
    // fire event to tizen
    try {
      (window as any).ConfigService.postMessage(JSON.stringify(request));
      console.log(`Sent request to Tizen ${JSON.stringify(request)}`);
    } catch (e) {
      console.error(`Failed to send request to Tizen: ${e}`);
    }

    const future = new Future<any>();
    FutureManager.instance.appendFuture(id, future);

    return future.promise;
  }
}

export class WebConfigService implements PlatformConfigService {
  async getString(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async setString(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }
}
