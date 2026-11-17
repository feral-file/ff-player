/**
 * The one-minute rule on the mounted overlay (feral-file/feral-file#3635): a
 * unit with a saved work to display clears the no-network panels about a
 * minute after power-on; a unit with nothing saved keeps them. Split from
 * SetupOverlay.test.tsx to stay inside the max-lines budget.
 */
import { AppContext } from '@/context/AppContext';
import { CastCommand, type CastInfo } from '@/models';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SetupOverlay from './SetupOverlay';
import { SETUP_PANEL_WINDOW_MS } from './setupPanelWindow';

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-qr-value={value} />,
}));

const savedCast = { castCommand: CastCommand.displayPlaylist } as CastInfo;
const joinTitle =
  "Scan the QR code, then follow your phone's prompt to connect";
const joinCode = { state: SetupDisplayState.SoftApQr, ssid: 'FF1-ABCD' };

function overlay(opts: { saved: boolean; isOnline?: boolean }) {
  return (
    <AppContext.Provider
      value={{
        context: {
          isInitialized: true,
          isOnline: opts.isOnline ?? false,
          appRemoteConfig: { defaultPlaylistURL: '' },
          castInfo: opts.saved ? savedCast : null,
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

  it('counts the boot narration from player start, then gives the join code its minute', () => {
    render(overlay({ saved: true }));
    advance(5_000);
    displaySetup({
      state: SetupDisplayState.Connecting,
      reason: 'Looking for your Wi-Fi network…',
    });
    advance(35_000);
    expect(screen.getByText('Connecting to the network')).toBeTruthy();

    displaySetup(joinCode);
    advance(SETUP_PANEL_WINDOW_MS - 1);
    expect(screen.getByText(joinTitle)).toBeTruthy();
    advance(1);
    expect(screen.queryByText(joinTitle)).toBeNull();
  });

  it('clears the boot narration a minute after player start', () => {
    render(overlay({ saved: true }));
    advance(5_000);
    displaySetup({ state: SetupDisplayState.Connecting });
    advance(54_999);
    expect(screen.getByText('Connecting to the network')).toBeTruthy();
    advance(1);
    expect(screen.queryByText('Connecting to the network')).toBeNull();
  });

});

describe('SetupOverlay one-minute window exceptions', () => {
  useWindowTimers();

  it('never clears on a unit with nothing saved to display', () => {
    render(overlay({ saved: false }));
    displaySetup(joinCode);
    advance(24 * 3_600_000);
    expect(screen.getByText(joinTitle)).toBeTruthy();
    displaySetup({ state: SetupDisplayState.Connecting });
    advance(24 * 3_600_000);
    expect(screen.getByText('Connecting to the network')).toBeTruthy();
  });

  it('stays up when a phone attaches at 50 seconds, then gives a fresh minute', () => {
    render(overlay({ saved: true }));
    displaySetup(joinCode);
    advance(50_000);
    displaySetup({
      ...joinCode,
      portal_url: 'http://10.42.0.1',
      client_attached: true,
    });
    advance(600_000);
    expect(screen.getByText('Finish setup on your phone')).toBeTruthy();

    // The phone left without finishing: the join code is back for a minute.
    displaySetup({ ...joinCode, reason: 'Your phone left the setup Wi-Fi.' });
    advance(SETUP_PANEL_WINDOW_MS - 1);
    expect(screen.getByText(joinTitle)).toBeTruthy();
    advance(1);
    expect(screen.queryByText(joinTitle)).toBeNull();
  });

  it('stays up through a join and gives a fresh minute when it fails', () => {
    render(overlay({ saved: true }));
    displaySetup(joinCode);
    advance(SETUP_PANEL_WINDOW_MS);
    displaySetup({ state: SetupDisplayState.Joining });
    advance(120_000);
    expect(screen.getByText('Connecting to Wi-Fi')).toBeTruthy();

    displaySetup({ state: SetupDisplayState.JoinFailed, reason: 'Wrong password.' });
    displaySetup({ ...joinCode, reason: 'Wrong password.' });
    expect(screen.getByText(joinTitle)).toBeTruthy();
    advance(SETUP_PANEL_WINDOW_MS);
    expect(screen.queryByText(joinTitle)).toBeNull();
  });

  it.each([
    [SetupDisplayState.ClaimQr, 'Pair with the Feral File app'],
    [SetupDisplayState.SetupError, 'Setup needs attention'],
    [SetupDisplayState.Updating, 'Updating software'],
    [SetupDisplayState.FactoryReset, 'Resetting to factory settings'],
    [SetupDisplayState.JoinFailed, "Couldn't connect to Wi-Fi"],
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
