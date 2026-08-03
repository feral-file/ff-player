// @vitest-environment jsdom
// jsdom (not the node default for .test.ts): the contract under test is the
// pair of window CustomEvents error navigation emits — PlaybackHalted so
// AppContext stands the fallback machinery down, then Navigate to route to
// the error page.
import { CustomEventName } from '@/models/custom_event';
import { ErrorType } from '@/models/error.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigateToErrorPageAction } from './ErrorNavigation';

const dispatchedEvents = (spy: { mock: { calls: [Event][] } }) =>
  spy.mock.calls.map(([event]) => event.type);

// The error page deliberately takes the wall off playback. Without the halt,
// an armed boot-fallback retry completing later would `router.push('/')` —
// its pathname guard fires precisely when parked off '/' — and resume
// playback over the error the daemon chose to display (overheating being the
// case that matters).
describe('ErrorNavigation playback-halt signalling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('error navigation stands the fallback down before routing', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');

    navigateToErrorPageAction(ErrorType.Overheating);

    const events = dispatchedEvents(spy);
    expect(events).toContain(CustomEventName.PlaybackHalted);
    expect(events).toContain(CustomEventName.Navigate);
    // Halt first: the Navigate listener may commit the route change in the
    // same task, and the stand-down must already be visible to any
    // in-flight fallback attempt's shouldAbort by then.
    expect(events.indexOf(CustomEventName.PlaybackHalted)).toBeLessThan(
      events.indexOf(CustomEventName.Navigate)
    );
  });

  it('routes to /error with the error type in the query', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');

    navigateToErrorPageAction(ErrorType.Overheating);

    const navigate = spy.mock.calls
      .map(([event]) => event as CustomEvent<{ path: string }>)
      .find(event => event.type === (CustomEventName.Navigate as string));
    expect(navigate?.detail.path).toBe(
      `/error?error=${ErrorType.Overheating}`
    );
  });
});
