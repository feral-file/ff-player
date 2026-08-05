/** @vitest-environment jsdom */
/**
 * Pins the effect-time re-read in useNetworkManger: a daemon push landing
 * BETWEEN the initial render (useState seed) and the effect attaching the
 * event listener is only visible in the store — no event will ever replay it
 * — so the effect must re-read the store once. Split from
 * useNetworkManager.test.tsx because reproducing that window needs the store
 * read mocked per call, and vi.mock is file-scoped (the sibling file's cases
 * need the real store).
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { daemonConnectivityMock } = vi.hoisted(() => ({
  daemonConnectivityMock: vi.fn<() => boolean | null>(),
}));

vi.mock('@/services/DaemonConnectivity', () => ({
  daemonConnectivity: daemonConnectivityMock,
}));

import useNetworkManger from './useNetworkManager';

describe('useNetworkManger seed→listener gap', () => {
  it('re-reads the store when its listener attaches, catching a push that landed after the initial render', () => {
    // First read: the useState initializer, before the push (unknown).
    // Second read: the effect's resync, after the push recorded `false`.
    daemonConnectivityMock.mockReturnValueOnce(null).mockReturnValue(false);

    const { result } = renderHook(() => useNetworkManger());

    expect(result.current).toBe(false);
  });
});
