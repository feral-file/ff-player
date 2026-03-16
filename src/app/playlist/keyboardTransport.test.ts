import { describe, expect, it } from 'vitest';
import {
  isKeyboardTransportEnabled,
  KEYBOARD_TRANSPORT_SHORTCUTS,
} from './keyboardTransport';
import { DP1DisplayPreference } from '@/models/dp1.model';

const baseDisplayPreference: DP1DisplayPreference = {
  interaction: {
    keyboard: [],
  },
};

describe('isKeyboardTransportEnabled', () => {
  it('enables keyboard transport on localhost', () => {
    expect(isKeyboardTransportEnabled(baseDisplayPreference, 'localhost')).toBe(
      true
    );
    expect(isKeyboardTransportEnabled(baseDisplayPreference, '127.0.0.1')).toBe(
      true
    );
  });

  it('enables keyboard transport when any opt-in token is present', () => {
    KEYBOARD_TRANSPORT_SHORTCUTS.forEach(shortcut => {
      const displayPreference: DP1DisplayPreference = {
        interaction: {
          keyboard: [shortcut],
        },
      };
      expect(
        isKeyboardTransportEnabled(displayPreference, 'player.feralfile.com')
      ).toBe(true);
    });
  });

  it('keeps keyboard transport disabled without opt-in on non-local hosts', () => {
    expect(
      isKeyboardTransportEnabled(baseDisplayPreference, 'player.feralfile.com')
    ).toBe(false);
    expect(isKeyboardTransportEnabled(undefined, 'player.feralfile.com')).toBe(
      false
    );
  });
});
