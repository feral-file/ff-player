import { KeyboardEventKey, FlutterKeyEventID } from '@/constants';
import { EventEmitter, Event } from '@/utils/EventEmitter';

export const keyEventHandler = (keyEvent: string) => {
  const [keyId, keyLabel] = keyEvent.split('_');
  console.log(`Handling key event: ${keyId} - ${keyLabel}`);

  const deviceKeyID = getDeviceKeyID(keyId);

  if (deviceKeyID) {
    if (isEscapeEvent(deviceKeyID)) {
      EventEmitter.emit(Event.escape);
    }

    if (
      [
        FlutterKeyEventID.arrowUp,
        FlutterKeyEventID.arrowDown,
        FlutterKeyEventID.arrowLeft,
        FlutterKeyEventID.arrowRight,
        FlutterKeyEventID.enter,
        FlutterKeyEventID.select,
      ].includes(deviceKeyID)
    ) {
      const standardKey = keyLabel.replaceAll(' ', '') as KeyboardEventKey;
      const standardKeyCode = getStandardKeyCode(deviceKeyID);
      if (standardKeyCode) {
        const keyboardEvent = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          view: window,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          metaKey: false,
          keyCode: standardKeyCode,
          key: standardKey,
          charCode: 0,
        });

        // Dispatch the keyboard event on the desired element
        document.dispatchEvent(keyboardEvent);
      }
    }
  }
};

function isEscapeEvent(keyId: FlutterKeyEventID): boolean {
  return [FlutterKeyEventID.escape, FlutterKeyEventID.goBack].includes(keyId);
}

// Mapping from Flutter key event ID to standard KeyboardEvent keycode
const keyCodeMapping: { [key in FlutterKeyEventID]: number } = {
  [FlutterKeyEventID.goBack]: 8, // Assuming 'goBack' maps to 'Backspace'
  [FlutterKeyEventID.escape]: 27,
  [FlutterKeyEventID.enter]: 13,
  [FlutterKeyEventID.select]: 13,
  [FlutterKeyEventID.arrowLeft]: 37,
  [FlutterKeyEventID.arrowUp]: 38,
  [FlutterKeyEventID.arrowRight]: 39,
  [FlutterKeyEventID.arrowDown]: 40,
};

function getStandardKeyCode(customKeyCode: FlutterKeyEventID): number {
  return keyCodeMapping[customKeyCode];
}

function getDeviceKeyID(id: string): FlutterKeyEventID | undefined {
  return Object.values(FlutterKeyEventID).find(key => key.toString() === id) as
    | FlutterKeyEventID
    | undefined;
}
