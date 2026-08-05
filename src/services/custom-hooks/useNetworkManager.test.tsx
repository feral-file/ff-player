/** @vitest-environment jsdom */
/**
 * Seed contract for useNetworkManger: the hook must pick up a daemon
 * connectivity verdict that landed BEFORE it mounted (the store seed), keep
 * the optimistic `true` default when no daemon has spoken, and keep tracking
 * live ConnectivityChange events afterward.
 */
import { CustomEventName } from '@/models/custom_event';
import {
  noteDaemonConnectivity,
  resetDaemonConnectivityForTests,
} from '@/services/DaemonConnectivity';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import useNetworkManger from './useNetworkManager';

/** Fire the window ConnectivityChange event the daemon push would dispatch. */
function dispatchConnectivity(isOnline: boolean) {
  window.dispatchEvent(
    new CustomEvent(CustomEventName.ConnectivityChange, {
      detail: { isOnline },
    })
  );
}

describe('useNetworkManger', () => {
  afterEach(() => {
    cleanup();
    resetDaemonConnectivityForTests();
  });

  it('defaults to online when no daemon verdict exists (standalone browser)', () => {
    const { result } = renderHook(() => useNetworkManger());
    expect(result.current).toBe(true);
  });

  it('seeds from a verdict that arrived before the hook mounted', () => {
    // The daemon's generation-ready replay can land milliseconds after CDP
    // connect, before any React listener exists. A missed event must not
    // leave the seed stuck at optimistic `true` (the blank-wall incident).
    noteDaemonConnectivity(false);
    const { result } = renderHook(() => useNetworkManger());
    expect(result.current).toBe(false);
  });

  it('keeps tracking live connectivity events after mount', () => {
    noteDaemonConnectivity(false);
    const { result } = renderHook(() => useNetworkManger());
    expect(result.current).toBe(false);

    act(() => {
      dispatchConnectivity(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      dispatchConnectivity(false);
    });
    expect(result.current).toBe(false);
  });
});
