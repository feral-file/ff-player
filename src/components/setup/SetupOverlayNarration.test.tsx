import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import SetupOverlay from './SetupOverlay';

/*
 * Narration-only states: the controller keeps sending them, and the player
 * accepts them and paints no panel (feral-file/feral-file#3635: a screen
 * stays only when the person has to do something or has to not do
 * something). With nothing saved to display, the bundled artwork still shows
 * so the unit never waits on a black screen.
 */

function displaySetup(detail: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(CustomEventName.SetupDisplay, { detail })
    );
  });
}

const narrationOnly = [
  SetupDisplayState.Scanning,
  SetupDisplayState.Connecting,
  SetupDisplayState.Finalizing,
  SetupDisplayState.JoinFailed,
  SetupDisplayState.SetupError,
];

describe('SetupOverlay narration-only states', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(narrationOnly)(
    'paints no panel for %s, only the bundled artwork',
    state => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { container } = render(<SetupOverlay />);

      displaySetup({ state, reason: 'Looking for your Wi-Fi network…' });

      expect(container.querySelector('section')).toBeNull();
      expect(screen.queryByText('Looking for your Wi-Fi network…')).toBeNull();
      expect(container.querySelector('iframe')).not.toBeNull();
      expect(container.querySelectorAll('p')).toHaveLength(0);
    }
  );

  it('replaces a showing panel with nothing when a narration state arrives', () => {
    const { container } = render(<SetupOverlay />);
    displaySetup({ state: SetupDisplayState.Joining });
    expect(screen.getByText('Connecting to Wi-Fi')).toBeTruthy();

    displaySetup({ state: SetupDisplayState.Finalizing });

    expect(container.querySelector('section')).toBeNull();
  });

  it('logs setup_error with its reason so it stays diagnosable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SetupError,
      reason: 'The setup hotspot could not start.',
    });

    expect(warn).toHaveBeenCalledWith(
      '[SetupOverlay] setup_error:',
      'The setup hotspot could not start.'
    );
  });
});
