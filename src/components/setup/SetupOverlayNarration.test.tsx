import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import SetupOverlay from './SetupOverlay';

/*
 * Prose-narration states (connecting, setup_error): the panels whose body is
 * controld-authored `reason` prose under a player-owned title. Split from
 * SetupOverlay.test.tsx purely to keep that file inside the max-lines lint
 * budget — the states under test are ordinary setupDisplay states and share
 * all machinery with the ones tested there.
 */

function displaySetup(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent(CustomEventName.SetupDisplay, { detail })
  );
}

describe('SetupOverlay connecting state', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders connecting with the provided reason', async () => {
    render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.Connecting,
      reason: 'Checking the network connection…',
    });

    expect(await screen.findByText('Connecting to the network')).toBeTruthy();
    expect(screen.getByText('Checking the network connection…')).toBeTruthy();
    // The neutral title is the point of this state: the boot hedge must not
    // flash a failure-asserting title on a normal reboot.
    expect(screen.queryByText(/Couldn't connect/)).toBeNull();
  });

  it('renders a bare connecting request as the title alone', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Connecting });

    expect(await screen.findByText('Connecting to the network')).toBeTruthy();
  });
});

describe('SetupOverlay setup_error state', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders setup_error with the provided reason', async () => {
    render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SetupError,
      reason:
        'The frame could not start setup mode. It will keep trying automatically. ' +
        'If this persists, disconnect power for ten seconds and restart. (FF1-TEST)',
    });

    expect(await screen.findByText('Setup needs attention')).toBeTruthy();
    expect(screen.getByText(/could not start setup mode/)).toBeTruthy();
    // The native title must not assert a failed Wi-Fi join — these errors
    // fire while no join is in progress; the join_failed title is only the
    // old-player downgrade this state exists to replace.
    expect(screen.queryByText(/Couldn't connect/)).toBeNull();
  });

  it('renders a bare setup_error with a fallback line', async () => {
    // A reason-less setup_error is valid per the CDP validator; the panel
    // must not be a dead-end title.
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.SetupError });

    expect(await screen.findByText('Setup needs attention')).toBeTruthy();
    expect(screen.getByText(/keep trying automatically/)).toBeTruthy();
  });
});
