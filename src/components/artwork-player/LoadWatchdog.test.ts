import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDED_LOAD_TIMEOUT_MS,
  LOAD_DECODE_TIMEOUT_MS,
  LOAD_IDLE_TIMEOUT_MS,
  LOAD_OPAQUE_TIMEOUT_MS,
  LOAD_TRANSFER_CEILING_MS,
  LoadWatchdog,
  loadDeadline,
} from './LoadWatchdog';

describe('loadDeadline', () => {
  const base = { startedAt: 1000, lastProgressAt: 1000, phaseStartedAt: 1000 };

  it('measures transfer idleness from the last progress', () => {
    expect(
      loadDeadline({ ...base, phase: 'transfer', lastProgressAt: 9000 })
    ).toBe(9000 + LOAD_IDLE_TIMEOUT_MS);
  });

  it('never lets a transfer outlive its ceiling, however steady', () => {
    const late = 1000 + LOAD_TRANSFER_CEILING_MS - 1;
    expect(
      loadDeadline({ ...base, phase: 'transfer', lastProgressAt: late })
    ).toBe(1000 + LOAD_TRANSFER_CEILING_MS);
  });

  it('bounds decode and opaque phases from their own start', () => {
    expect(
      loadDeadline({ ...base, phase: 'decode', phaseStartedAt: 5000 })
    ).toBe(5000 + LOAD_DECODE_TIMEOUT_MS);
    expect(
      loadDeadline({ ...base, phase: 'opaque', phaseStartedAt: 5000 })
    ).toBe(5000 + LOAD_OPAQUE_TIMEOUT_MS);
  });

  it('keeps the embedded window fixed from mount', () => {
    expect(loadDeadline({ ...base, phase: 'fixed' })).toBe(
      1000 + EMBEDDED_LOAD_TIMEOUT_MS
    );
  });
});

describe('LoadWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires a load that never shows progress at the idle bound', () => {
    const onExpire = vi.fn();
    new LoadWatchdog('transfer', onExpire);
    vi.advanceTimersByTime(LOAD_IDLE_TIMEOUT_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('keeps a slow but steady transfer alive past the idle bound', () => {
    const onExpire = vi.fn();
    const watchdog = new LoadWatchdog('transfer', onExpire);
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(LOAD_IDLE_TIMEOUT_MS / 2);
      watchdog.progress();
    }
    expect(onExpire).not.toHaveBeenCalled();
    // Bytes stop: the idle bound now counts from the last progress.
    vi.advanceTimersByTime(LOAD_IDLE_TIMEOUT_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('fails a trickle at the transfer ceiling', () => {
    const onExpire = vi.fn();
    const watchdog = new LoadWatchdog('transfer', onExpire);
    const step = LOAD_IDLE_TIMEOUT_MS / 2;
    for (let t = 0; t < LOAD_TRANSFER_CEILING_MS - step; t += step) {
      vi.advanceTimersByTime(step);
      watchdog.progress();
    }
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(step);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('gives a completed transfer the decode window, not the idle one', () => {
    const onExpire = vi.fn();
    const watchdog = new LoadWatchdog('transfer', onExpire);
    vi.advanceTimersByTime(LOAD_IDLE_TIMEOUT_MS - 1000);
    watchdog.enterPhase('decode');
    vi.advanceTimersByTime(LOAD_DECODE_TIMEOUT_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('gives an unobservable fallback load its fixed window', () => {
    const onExpire = vi.fn();
    const watchdog = new LoadWatchdog('transfer', onExpire);
    watchdog.enterPhase('opaque');
    vi.advanceTimersByTime(LOAD_OPAQUE_TIMEOUT_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('ignores progress and phases for a fixed embedded window', () => {
    const onExpire = vi.fn();
    const watchdog = new LoadWatchdog('fixed', onExpire);
    vi.advanceTimersByTime(EMBEDDED_LOAD_TIMEOUT_MS - 1000);
    watchdog.progress();
    watchdog.enterPhase('opaque');
    vi.advanceTimersByTime(1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('never fires after dispose', () => {
    const onExpire = vi.fn();
    const watchdog = new LoadWatchdog('transfer', onExpire);
    watchdog.dispose();
    vi.advanceTimersByTime(LOAD_TRANSFER_CEILING_MS);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
