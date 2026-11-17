/**
 * The one-minute rule on the mounted overlay (feral-file/feral-file#3635): a
 * unit with a saved work to display clears the join code about a minute
 * after it appears; a unit with nothing saved keeps it. Split from
 * SetupOverlay.test.tsx to stay inside the max-lines budget.
 */
import { AppContext } from '@/context/AppContext';
import { CastCommand, type CastInfo } from '@/models';
import type { DP1Call } from '@/models/dp1.model';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SetupOverlay from './SetupOverlay';
import { SETUP_PANEL_WINDOW_MS } from './setupPanelWindow';

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-qr-value={value} />,
}));

const savedCast = {
  castCommand: CastCommand.displayPlaylist,
  playlist: { items: [{ id: 'work-1' }] } as unknown as DP1Call,
} as CastInfo;
// What `setLoop` persists on a unit with no artwork: cast state, no work.
const loopOnlyCast = { castCommand: CastCommand.setLoop } as CastInfo;
const joinTitle =
  "Scan the QR code, then follow your phone's prompt to connect";
const joinCode = { state: SetupDisplayState.SoftApQr, ssid: 'FF1-ABCD' };

function overlay(opts: {
  saved: boolean;
  isOnline?: boolean;
  cast?: CastInfo;
}) {
  return (
    <AppContext.Provider
      value={{
        context: {
          isInitialized: true,
          isOnline: opts.isOnline ?? false,
          appRemoteConfig: { defaultPlaylistURL: '' },
          castInfo: opts.cast ?? (opts.saved ? savedCast : null),
          displaySettings: null,
          cursorPositions: null,
          playbackDegraded: false,
        },
      }}>
      <SetupOverlay />
    </AppContext.Provider>
  );
}

function displaySetup(detail: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(CustomEventName.SetupDisplay, { detail })
    );
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Fake timers for one describe block. `performance` is faked too: the
 * window reads performance.now(), which then starts at 0, the same as a page
 * load on the device. */
function useWindowTimers() {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
}

describe('SetupOverlay one-minute window', () => {
  useWindowTimers();

  it('clears the join code after a minute and leaves nothing over the work', () => {
    const { container } = render(overlay({ saved: true }));
    displaySetup(joinCode);
    expect(screen.getByText(joinTitle)).toBeTruthy();

    advance(SETUP_PANEL_WINDOW_MS - 1);
    expect(screen.getByText(joinTitle)).toBeTruthy();

    advance(1);
    expect(screen.queryByText(joinTitle)).toBeNull();
    // No scrim, no bundled artwork, no chip: the saved work is the screen.
    expect(container.innerHTML).toBe('');
  });

  it('stays cleared when the daemon re-sends the state or cycles phases', () => {
    const { container } = render(overlay({ saved: true }));
    displaySetup(joinCode);
    advance(SETUP_PANEL_WINDOW_MS);

    displaySetup(joinCode);
    expect(container.innerHTML).toBe('');
    advance(60_000);
    displaySetup({
      state: SetupDisplayState.Connecting,
      reason: 'Checking for your Wi-Fi network…',
    });
    expect(container.innerHTML).toBe('');
    displaySetup({ state: SetupDisplayState.Scanning });
    expect(container.innerHTML).toBe('');
    displaySetup({ state: SetupDisplayState.Hidden });
    advance(900_000);
    displaySetup(joinCode);
    expect(container.innerHTML).toBe('');
  });

  it('gives the join code its minute when the hotspot rises after narration', () => {
    const { container } = render(overlay({ saved: true }));
    advance(5_000);
    displaySetup({
      state: SetupDisplayState.Connecting,
      reason: 'Looking for your Wi-Fi network…',
    });
    // Narration paints nothing over the saved work.
    expect(container.innerHTML).toBe('');
    advance(295_000);

    displaySetup(joinCode);
    advance(SETUP_PANEL_WINDOW_MS - 1);
    expect(screen.getByText(joinTitle)).toBeTruthy();
    advance(1);
    expect(screen.queryByText(joinTitle)).toBeNull();
  });
});

describe('SetupOverlay one-minute window exceptions', () => {
  useWindowTimers();

  it('never clears on a unit with nothing saved to display', () => {
    render(overlay({ saved: false }));
    displaySetup(joinCode);
    advance(24 * 3_600_000);
    expect(screen.getByText(joinTitle)).toBeTruthy();
  });

  it('never clears when cast state holds no work (setLoop with no artwork)', () => {
    render(overlay({ saved: false, cast: loopOnlyCast }));
    displaySetup(joinCode);
    advance(24 * 3_600_000);
    expect(screen.getByText(joinTitle)).toBeTruthy();
  });

  it('stays up when an Apple client attaches at 50 seconds, then gives a fresh minute', () => {
    render(overlay({ saved: true }));
    displaySetup(joinCode);
    advance(50_000);
    displaySetup({
      ...joinCode,
      portal_url: 'http://10.42.0.1',
      client_attached: true,
    });
    advance(600_000);
    expect(screen.getByText(joinTitle)).toBeTruthy();

    // The next raise repaints the plain join code: back for a minute.
    displaySetup(joinCode);
    advance(SETUP_PANEL_WINDOW_MS - 1);
    expect(screen.getByText(joinTitle)).toBeTruthy();
    advance(1);
    expect(screen.queryByText(joinTitle)).toBeNull();
  });

});

describe('SetupOverlay one-minute window, panels that need a person', () => {
  useWindowTimers();

  it('keeps the failed-join reason on screen after a join fails', () => {
    render(overlay({ saved: true }));
    displaySetup(joinCode);
    advance(SETUP_PANEL_WINDOW_MS);
    displaySetup({ state: SetupDisplayState.Joining });
    advance(120_000);
    expect(screen.getByText('Connecting to Wi-Fi')).toBeTruthy();

    displaySetup({ state: SetupDisplayState.JoinFailed, reason: 'Wrong password.' });
    displaySetup({ ...joinCode, reason: 'Wrong password.' });
    advance(24 * 3_600_000);
    expect(screen.getByText(joinTitle)).toBeTruthy();
    expect(screen.getByText('Wrong password.')).toBeTruthy();
  });

  it('keeps the phone-left line on screen', () => {
    render(overlay({ saved: true }));
    displaySetup(joinCode);
    advance(SETUP_PANEL_WINDOW_MS);
    const reason = 'Your phone left the setup Wi-Fi. Scan the code to join again.';
    displaySetup({ ...joinCode, reason });
    advance(24 * 3_600_000);
    expect(screen.getByText(reason)).toBeTruthy();
  });

  it.each([
    [SetupDisplayState.ClaimQr, 'Pair with the Feral File app'],
    [SetupDisplayState.Updating, 'Updating software'],
    [SetupDisplayState.FactoryReset, 'Resetting to factory settings'],
  ])('never clears %s', (state, title) => {
    render(overlay({ saved: true }));
    displaySetup(joinCode);
    advance(SETUP_PANEL_WINDOW_MS);
    displaySetup({ state, url: 'https://example.com/claim' });
    advance(24 * 3_600_000);
    expect(screen.getByText(title)).toBeTruthy();
  });

  it('gives a later no-network episode its own minute', () => {
    const { rerender } = render(overlay({ saved: true }));
    displaySetup(joinCode);
    advance(SETUP_PANEL_WINDOW_MS);
    expect(screen.queryByText(joinTitle)).toBeNull();

    // Back online: the daemon hides the panel and reports connectivity.
    displaySetup({ state: SetupDisplayState.Hidden });
    rerender(overlay({ saved: true, isOnline: true }));
    advance(3_600_000);

    // Wi-Fi drops and the hotspot rises minutes later.
    rerender(overlay({ saved: true, isOnline: false }));
    advance(300_000);
    displaySetup(joinCode);
    advance(SETUP_PANEL_WINDOW_MS - 1);
    expect(screen.getByText(joinTitle)).toBeTruthy();
    advance(1);
    expect(screen.queryByText(joinTitle)).toBeNull();
  });
});
