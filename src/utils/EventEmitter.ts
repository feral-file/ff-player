// eventEmitter.ts
type EventHandler = (...args: any[]) => void;

export enum Event {
  escape,
  keyDown,
}

export class EventEmitter {
  private static events = new Map<Event, EventHandler[]>();

  public static subscribe(event: Event, handler: EventHandler) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    this.events.get(event)!.push(handler);
  }

  public static unSubscribe(event: Event, handler: EventHandler) {
    if (this.events.has(event)) {
      const handlers = this.events.get(event)!.filter(h => h !== handler);
      this.events.set(event, handlers);
    }
  }

  public static emit(event: Event, ...args: any[]) {
    if (this.events.has(event)) {
      this.events.get(event)!.forEach(handler => handler(...args));
    }
  }
}
