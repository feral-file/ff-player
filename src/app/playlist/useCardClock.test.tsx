/**
 * Contract for a card's time on screen (feral-file#3615): it covers the
 * screen for its seconds, waits a bounded time for the work behind it, and
 * once it has left it stays gone for that showing, whatever work comes next.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCardClock, type Step } from './useExhibitionCards';

const TITLE: Step[] = [{ kind: 'title', seconds: 10 }];
const advance = (ms: number) =>
  { act(() => {
    vi.advanceTimersByTime(ms);
  }); };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useCardClock', () => {
  it('covers for its seconds, then leaves when the work is up', () => {
    const { result } = renderHook(() => useCardClock('p:0', TITLE, true));
    expect(result.current.covering).toBe(true);
    advance(9000);
    expect(result.current.covering).toBe(true);
    advance(1500);
    expect(result.current.covering).toBe(false);
  });

  it('stays gone when a later work is still loading', () => {
    const { result, rerender } = renderHook(
      ({ up }: { up: boolean }) => useCardClock('p:0', TITLE, up),
      { initialProps: { up: true } }
    );
    advance(10500);
    expect(result.current.covering).toBe(false);
    rerender({ up: false });
    advance(1000);
    expect(result.current.covering).toBe(false);
  });

  it('waits for the first work, but not for good', () => {
    const { result } = renderHook(() => useCardClock('p:0', TITLE, false));
    advance(12000);
    expect(result.current.covering).toBe(true);
    advance(15000);
    expect(result.current.covering).toBe(false);
  });

  it('starts its seconds when the card first has something to show', () => {
    const { result, rerender } = renderHook(
      ({ steps }: { steps: Step[] }) => useCardClock('p:0', steps, true),
      { initialProps: { steps: [] as Step[] } }
    );
    advance(8000);
    expect(result.current.covering).toBe(false);
    rerender({ steps: TITLE });
    advance(9000);
    expect(result.current.covering).toBe(true);
    advance(1500);
    expect(result.current.covering).toBe(false);
  });

  it('does not start over when a card that was up loses what it showed', () => {
    const { result, rerender } = renderHook(
      ({ steps }: { steps: Step[] }) => useCardClock('p:0', steps, true),
      { initialProps: { steps: TITLE } }
    );
    advance(5000);
    rerender({ steps: [] });
    advance(100);
    rerender({ steps: TITLE });
    advance(100);
    expect(result.current.covering).toBe(false);
  });

  it('shows again for the next showing', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useCardClock(key, TITLE, true),
      { initialProps: { key: 'p:0' } }
    );
    advance(10500);
    rerender({ key: 'p:1' });
    advance(100);
    expect(result.current.covering).toBe(true);
  });
});
