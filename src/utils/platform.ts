class PlatformListenable {
  static postMessage(message: string) {
    console.log(`Posting message: ${message}`);
  }
}

export class AppState extends PlatformListenable {
  static override postMessage(message: string) {
    super.postMessage(message);
    console.log(`Posting app state message: ${message}`);
  }
}

export class Rotate extends PlatformListenable {
  static override postMessage(message: string) {
    super.postMessage(message);
    console.log(`Posting rotate message: ${message}`);
  }
}

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
