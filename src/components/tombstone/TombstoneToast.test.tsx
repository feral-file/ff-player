/**
 * Contract for the tombstone confirmation toast (feral-file#3452): show the
 * latest confirmation, back it well enough to read over any artwork, and get
 * out of the way on its own.
 *
 * The opaque backing is the point of #257 — white text alone disappeared over
 * light works — so it is asserted rather than left to a visual check.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TombstoneToast, { TOMBSTONE_TOAST_DURATION_MS } from './TombstoneToast';

const toast = () => screen.queryByTestId('tombstone-toast');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  // The repo's vitest setup has no auto-cleanup; without this, renders leak
  // across tests and testid queries start matching multiple toasts.
  cleanup();
  vi.useRealTimers();
});

describe('TombstoneToast', () => {
  it('renders nothing before any confirmation', () => {
    render(<TombstoneToast text={null} />);
    expect(toast()).toBeNull();
  });

  it('renders the confirmation over an opaque backing', () => {
    render(<TombstoneToast text="Tombstone set to 'On'" />);
    const el = toast();
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe("Tombstone set to 'On'");
    // Legibility over light artworks depends on the fill, not a text shadow.
    expect(el?.style.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(el?.style.color).toBe('rgb(255, 255, 255)');
  });

  it('dismisses itself after the display window', () => {
    render(<TombstoneToast text="Tombstone set to 'Off'" />);
    expect(toast()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(TOMBSTONE_TOAST_DURATION_MS);
    });
    expect(toast()).toBeNull();
  });

  it('restarts the window when a new confirmation arrives', () => {
    const { rerender } = render(
      <TombstoneToast text="Tombstone set to 'On'" />
    );
    act(() => {
      vi.advanceTimersByTime(TOMBSTONE_TOAST_DURATION_MS - 500);
    });
    rerender(<TombstoneToast text="Tombstone set to 'Timed'" />);
    // Without a restart the old timer would fire here and blank the toast.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(toast()?.textContent).toBe("Tombstone set to 'Timed'");
    act(() => {
      vi.advanceTimersByTime(TOMBSTONE_TOAST_DURATION_MS);
    });
    expect(toast()).toBeNull();
  });
});
