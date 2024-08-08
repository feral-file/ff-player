import DeviceManager from "./DeviceManager";
import { v4 as uuidv4 } from "uuid";

class PlatformEventReceiver {
  static handlePlatformEvent(event: string) {
    console.log(`Handling platform event: ${event}`);
  }
}

export class KeyEvent extends PlatformEventReceiver {
  static override handlePlatformEvent(event: string) {
    super.handlePlatformEvent(event);
    console.log(`Handling key event: ${event}`);
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
  resolve!: (value: T | PromiseLike<T>) => void;
  reject!: (reason?: any) => void;

  promise: Promise<T>;

  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
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

    const future = FutureManager.instance.getFuture(id);
    if (future) {
      future.resolve(config.data);
      FutureManager.instance.removeFuture(id);
    } else {
      console.error(`No future found for id: ${id}`);
    }
  }
}

interface PlatformConfigService {
  getString(key: string): Promise<string>;
}

export class AndroidConfigService implements PlatformConfigService {
  async getString(key: string): Promise<string> {
    return await (window as any).flutter_inappwebview.callHandler("getString", {
      data: key,
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
}
