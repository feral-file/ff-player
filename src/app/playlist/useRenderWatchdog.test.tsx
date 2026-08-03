/* eslint-disable max-lines-per-function -- groups watchdog scenario tests under one describe. */
/**
 * Unit coverage for the playback watchdog (ff-app#520, Layers C+D).
 *
 * Verifies that a no-duration slot which gets stuck loading or reports an
 * unrecoverable failure is force-advanced, while healthy renders, has-duration
 * slots, and the remote-config kill-switch are all left untouched.
 */
import { RenderStatus } from '@/models';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRenderWatchdog } from './useRenderWatchdog';

const LOAD_MS = 1000;
const GRACE_MS = 200;

function setup(enabled = true) {
  const onForceAdvance = vi.fn();
  const view = renderHook(() =>
    useRenderWatchdog({
      onForceAdvance,
      enabled,
      loadTimeoutMs: LOAD_MS,
      failureGraceMs: GRACE_MS,
    })
  );
  return { onForceAdvance, view };
}

describe('useRenderWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('force-advances a no-duration slot that never reaches ready/failed', () => {
    const { onForceAdvance, view } = setup();
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });

    act(() => void vi.advanceTimersByTime(LOAD_MS - 1));
    expect(onForceAdvance).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1));
    expect(onForceAdvance).toHaveBeenCalledExactlyOnceWith('stuck-load');
  });

  it('does not advance once the slot reaches ready (healthy render)', () => {
    const { onForceAdvance, view } = setup();
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });
    act(() => { view.result.current.onRenderStatusChange(RenderStatus.ready); });

    act(() => void vi.advanceTimersByTime(LOAD_MS * 10));
    expect(onForceAdvance).not.toHaveBeenCalled();
  });

  it('force-advances a no-duration slot that fails, after the grace', () => {
    const { onForceAdvance, view } = setup();
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });
    act(() => { view.result.current.onRenderStatusChange(RenderStatus.failed); });

    act(() => void vi.advanceTimersByTime(GRACE_MS - 1));
    expect(onForceAdvance).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1));
    expect(onForceAdvance).toHaveBeenCalledExactlyOnceWith('render-failed');
  });

  it('cancels the failure advance if the render recovers to ready in time', () => {
    const { onForceAdvance, view } = setup();
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });
    act(() => { view.result.current.onRenderStatusChange(RenderStatus.failed); });
    act(() => void vi.advanceTimersByTime(GRACE_MS - 1));
    act(() => { view.result.current.onRenderStatusChange(RenderStatus.ready); });

    act(() => void vi.advanceTimersByTime(LOAD_MS * 10));
    expect(onForceAdvance).not.toHaveBeenCalled();
  });

  it('ignores pending/loading and keeps waiting on the load timer', () => {
    const { onForceAdvance, view } = setup();
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });
    act(() => { view.result.current.onRenderStatusChange(RenderStatus.pending); });
    act(() => { view.result.current.onRenderStatusChange(RenderStatus.loading); });

    act(() => void vi.advanceTimersByTime(LOAD_MS));
    expect(onForceAdvance).toHaveBeenCalledExactlyOnceWith('stuck-load');
  });

  it('never watches a has-duration slot (watch: false)', () => {
    const { onForceAdvance, view } = setup();
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: false }); });
    act(() => { view.result.current.onRenderStatusChange(RenderStatus.failed); });

    act(() => void vi.advanceTimersByTime(LOAD_MS * 10));
    expect(onForceAdvance).not.toHaveBeenCalled();
  });

  it('never fires when disabled by the kill-switch', () => {
    const { onForceAdvance, view } = setup(false);
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });
    act(() => { view.result.current.onRenderStatusChange(RenderStatus.failed); });

    act(() => void vi.advanceTimersByTime(LOAD_MS * 10));
    expect(onForceAdvance).not.toHaveBeenCalled();
  });

  it('disarm() cancels a pending stuck-load advance', () => {
    const { onForceAdvance, view } = setup();
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });
    act(() => { view.result.current.disarm(); });

    act(() => void vi.advanceTimersByTime(LOAD_MS * 10));
    expect(onForceAdvance).not.toHaveBeenCalled();
  });

  it('re-arming for a new slot cancels the previous slot timer', () => {
    const { onForceAdvance, view } = setup();
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });
    act(() => void vi.advanceTimersByTime(LOAD_MS - 1));
    // New slot enters before the first fired.
    act(() => { view.result.current.armForSlot({ identity: 'b', watch: true }); });
    act(() => void vi.advanceTimersByTime(1));
    // The old timer must not fire; only the new slot's timer is live.
    expect(onForceAdvance).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(LOAD_MS));
    expect(onForceAdvance).toHaveBeenCalledExactlyOnceWith('stuck-load');
  });

  it('stays disarmed when re-armed for a slot that already reached ready', () => {
    const { onForceAdvance, view } = setup();
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });
    act(() => { view.result.current.onRenderStatusChange(RenderStatus.ready); });
    // A merge-landed re-arm for the SAME slot must not restart the load timer.
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });

    act(() => void vi.advanceTimersByTime(LOAD_MS * 10));
    expect(onForceAdvance).not.toHaveBeenCalled();
  });

  it('is one-shot: a stale status event after firing does not advance again', () => {
    const { onForceAdvance, view } = setup();
    act(() => { view.result.current.armForSlot({ identity: 'a', watch: true }); });
    act(() => void vi.advanceTimersByTime(LOAD_MS));
    expect(onForceAdvance).toHaveBeenCalledExactlyOnceWith('stuck-load');

    // A trailing failed event for the already-advanced slot is ignored.
    act(() => { view.result.current.onRenderStatusChange(RenderStatus.failed); });
    act(() => void vi.advanceTimersByTime(GRACE_MS * 10));
    expect(onForceAdvance).toHaveBeenCalledTimes(1);
  });
});
