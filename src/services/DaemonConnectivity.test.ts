/**
 * Store contract for DaemonConnectivity: verdicts persist at module level,
 * waiters resolve on the first verdict or time out to `null`, and `null`
 * always means "unknown" (standalone browser / daemon not yet spoken).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  daemonConnectivity,
  noteDaemonConnectivity,
  resetDaemonConnectivityForTests,
  waitForDaemonConnectivity,
} from './DaemonConnectivity';

describe('DaemonConnectivity store', () => {
  afterEach(() => {
    resetDaemonConnectivityForTests();
    vi.useRealTimers();
  });

  it('starts unknown and records the last verdict', () => {
    expect(daemonConnectivity()).toBeNull();
    noteDaemonConnectivity(false);
    expect(daemonConnectivity()).toBe(false);
    noteDaemonConnectivity(true);
    expect(daemonConnectivity()).toBe(true);
  });

  it('resolves waiters immediately when a verdict is already known', async () => {
    noteDaemonConnectivity(false);
    await expect(waitForDaemonConnectivity(1)).resolves.toBe(false);
  });

  it('resolves an in-flight wait with the first verdict to arrive', async () => {
    const pending = waitForDaemonConnectivity(5_000);
    noteDaemonConnectivity(false);
    await expect(pending).resolves.toBe(false);
  });

  it('resolves an in-flight wait with a true verdict as well', async () => {
    const pending = waitForDaemonConnectivity(5_000);
    noteDaemonConnectivity(true);
    await expect(pending).resolves.toBe(true);
  });

  it('times out to null when no verdict ever arrives', async () => {
    vi.useFakeTimers();
    const pending = waitForDaemonConnectivity(3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).resolves.toBeNull();
  });

  it('a verdict after timeout does not disturb later waits', async () => {
    vi.useFakeTimers();
    const pending = waitForDaemonConnectivity(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBeNull();
    noteDaemonConnectivity(true);
    await expect(waitForDaemonConnectivity(1)).resolves.toBe(true);
  });
});
