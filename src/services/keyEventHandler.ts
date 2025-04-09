import { KeyboardEventKey, FlutterKeyEventID } from '@/constants';

const listHandledKeys = [
  FlutterKeyEventID.goBack,
  FlutterKeyEventID.escape,
  FlutterKeyEventID.enter,
  FlutterKeyEventID.select,
  FlutterKeyEventID.arrowLeft,
  FlutterKeyEventID.arrowUp,
  FlutterKeyEventID.arrowRight,
  FlutterKeyEventID.arrowDown,
];

export const keyEventHandler = (keyEvent: string) => {
  const [keyId, keyLabel] = keyEvent.split('_');
  const deviceKeyID = getDeviceKeyID(keyId);
  if (deviceKeyID && listHandledKeys.includes(deviceKeyID)) {
    console.log(`Handling key event: ${keyId} - ${keyLabel}`);

    const standardKey = getStandardKey(keyLabel);
    const standardKeyCode = getStandardKeyCode(deviceKeyID);
    console.log(
      `Dispatching key event: ${standardKey} ${standardKeyCode.toString()}`
    );

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
};

// Mapping from Flutter key event ID to standard KeyboardEvent keycode
const keyCodeMapping: { [key in FlutterKeyEventID]: number } = {
  [FlutterKeyEventID.goBack]: 8, // Assuming 'goBack' maps to 'Backspace'
  [FlutterKeyEventID.escape]: 8,
  [FlutterKeyEventID.enter]: 13,
  [FlutterKeyEventID.select]: 13,
  [FlutterKeyEventID.arrowLeft]: 37,
  [FlutterKeyEventID.arrowUp]: 38,
  [FlutterKeyEventID.arrowRight]: 39,
  [FlutterKeyEventID.arrowDown]: 40,
};

function getStandardKey(keyLabel: string): string {
  let standardKey = keyLabel.replaceAll(' ', '') as KeyboardEventKey;
  if (
    standardKey.toString() === 'GoBack' ||
    standardKey.toString() === 'Escape'
  ) {
    standardKey = KeyboardEventKey.Backspace;
  }

  if (standardKey.toString() === 'Select') {
    standardKey = KeyboardEventKey.Enter;
  }

  return standardKey;
}

function getStandardKeyCode(customKeyCode: FlutterKeyEventID): number {
  return keyCodeMapping[customKeyCode];
}

function getDeviceKeyID(id: string): FlutterKeyEventID | undefined {
  return Object.values(FlutterKeyEventID).find(key => key.toString() === id) as
    | FlutterKeyEventID
    | undefined;
}
