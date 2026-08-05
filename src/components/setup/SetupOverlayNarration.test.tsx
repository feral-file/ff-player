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
 *
 * Also home to join_failed's blank-`reason` cases. join_failed's rendering
 * lives in the other file, but all three panels share one invariant — a
 * present-but-blank reason must be treated as absent — and keeping every case
 * that pins it in one place is what stops a future edit from restoring the
 * truthiness gap in only the panel whose tests happen to sit elsewhere.
 */

function displaySetup(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent(CustomEventName.SetupDisplay, { detail })
  );
}

/** The line SetupErrorPanel shows when controld sends no usable reason. */
const setupErrorFallback =
  'The Art Computer ran into a problem with setup mode. ' +
  'It will keep trying automatically.';

/*
 * Reason-absence assertion for `connecting`, whose no-reason branch renders
 * no subtitle element at all (unlike setup_error/join_failed, which fall back
 * to a line). Counting the panel's children rather than matching a CSS-module
 * class keeps this independent of how SCSS modules resolve under vitest.
 */
function expectTitleOnlyPanel(title: HTMLElement) {
  expect(title.parentElement?.childElementCount).toBe(1);
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

    expectTitleOnlyPanel(
      await screen.findByText('Connecting to the network')
    );
  });

  /*
   * A present-but-blank reason passes the CDP validator (it only checks the
   * type), so it must collapse to the same title-only rendering as an absent
   * one rather than leaving an empty subtitle under the title.
   */
  it.each([
    ['an empty reason', ''],
    ['a whitespace-only reason', '   \n\t '],
  ])('renders the title alone for %s', async (_label, reason) => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Connecting, reason });

    expectTitleOnlyPanel(
      await screen.findByText('Connecting to the network')
    );
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
      // Verbatim from feral-controld's AP-raise escalation
      // (provisioning/provisioning.go, noteAPRaiseFailure) so a daemon copy
      // change that this panel would have to re-render shows up as a diff
      // here rather than passing against invented prose.
      reason:
        'The Art Computer could not start setup mode. It will keep trying ' +
        'automatically. If this persists, disconnect power for ten seconds ' +
        'and restart.',
    });

    expect(await screen.findByText('Setup needs attention')).toBeTruthy();
    expect(screen.getByText(/could not start setup mode/)).toBeTruthy();
    // The native title must not assert a failed Wi-Fi join — these errors
    // fire while no join is in progress; the join_failed title is only the
    // old-player downgrade this state exists to replace.
    expect(screen.queryByText(/Couldn't connect/)).toBeNull();
  });

  it('renders the teardown-twin reason', async () => {
    // The second escalation controld can latch (noteAPReleaseFailure); same
    // panel, so this only pins that the twin prose is carried verbatim too.
    render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SetupError,
      reason:
        'The Art Computer could not release its setup hotspot. It will keep ' +
        'trying automatically. If this persists, disconnect power for ten ' +
        'seconds and restart.',
    });

    expect(await screen.findByText('Setup needs attention')).toBeTruthy();
    expect(
      screen.getByText(/could not release its setup hotspot/)
    ).toBeTruthy();
  });

  it('renders a bare setup_error with a fallback line', async () => {
    // A reason-less setup_error is valid per the CDP validator; the panel
    // must not be a dead-end title.
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.SetupError });

    expect(await screen.findByText('Setup needs attention')).toBeTruthy();
    expect(screen.getByText(setupErrorFallback)).toBeTruthy();
  });

  /*
   * A present-but-blank reason passes the CDP validator (it only checks the
   * type), so it must land on the same fallback as an absent one rather than
   * rendering an empty subtitle under the title.
   */
  it.each([
    ['an empty reason', ''],
    ['a whitespace-only reason', '   \n\t '],
  ])('renders the fallback line for %s', async (_label, reason) => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.SetupError, reason });

    expect(await screen.findByText('Setup needs attention')).toBeTruthy();
    expect(screen.getByText(setupErrorFallback)).toBeTruthy();
  });
});

describe('SetupOverlay join_failed blank reason', () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    ['an empty reason', ''],
    ['a whitespace-only reason', '   \n\t '],
  ])('renders the fallback line for %s', async (_label, reason) => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.JoinFailed, reason });

    expect(await screen.findByText("Couldn't connect to Wi-Fi")).toBeTruthy();
    expect(screen.getByText('Please try again.')).toBeTruthy();
  });
});
