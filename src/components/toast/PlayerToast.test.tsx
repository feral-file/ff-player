/**
 * Contract for the daemon-driven notice (feral-file/ffos-user#307): render
 * the copy for a known notice over an opaque backing, restart the window on
 * every accepted command — including a repeat of the same notice — and get
 * out of the way on its own.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CustomEventName,
  PlayerToastDetail,
  PlayerToastNotice,
} from '@/models/custom_event';
import PlayerToast, {
  PLAYER_TOAST_COPY,
  PLAYER_TOAST_DURATION_MS,
} from './PlayerToast';

const toast = () => screen.queryByTestId('player-toast');

const dispatch = (notice: PlayerToastNotice, seq: number) => {
  act(() => {
    window.dispatchEvent(
      new CustomEvent<PlayerToastDetail>(CustomEventName.PlayerToast, {
        detail: { notice, seq },
      })
    );
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  // The repo's vitest setup has no auto-cleanup; without this, renders leak
  // across tests and testid queries start matching multiple toasts.
  cleanup();
  vi.useRealTimers();
});

describe('PlayerToast', () => {
  it('renders nothing before any notice', () => {
    render(<PlayerToast />);
    expect(toast()).toBeNull();
  });

  it('renders the notice copy over an opaque backing', () => {
    render(<PlayerToast />);
    dispatch(PlayerToastNotice.SignatureUnsigned, 1);
    const el = toast();
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe(
      PLAYER_TOAST_COPY[PlayerToastNotice.SignatureUnsigned]
    );
    expect(el?.style.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(el?.style.color).toBe('rgb(255, 255, 255)');
  });

  it('has copy for every notice', () => {
    for (const notice of Object.values(PlayerToastNotice)) {
      expect(PLAYER_TOAST_COPY[notice]).toBeTruthy();
    }
  });

  it('dismisses itself after the display window', () => {
    render(<PlayerToast />);
    dispatch(PlayerToastNotice.SignatureInvalid, 1);
    expect(toast()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(PLAYER_TOAST_DURATION_MS);
    });
    expect(toast()).toBeNull();
  });

  it('restarts the window when the same notice repeats', () => {
    render(<PlayerToast />);
    dispatch(PlayerToastNotice.SignatureUnsigned, 1);
    act(() => {
      vi.advanceTimersByTime(PLAYER_TOAST_DURATION_MS - 500);
    });
    dispatch(PlayerToastNotice.SignatureUnsigned, 2);
    // Without a restart the first timer would fire here and blank the toast.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(toast()?.textContent).toBe(
      PLAYER_TOAST_COPY[PlayerToastNotice.SignatureUnsigned]
    );
    act(() => {
      vi.advanceTimersByTime(PLAYER_TOAST_DURATION_MS);
    });
    expect(toast()).toBeNull();
  });

  it('replaces the text immediately when a different notice arrives', () => {
    render(<PlayerToast />);
    dispatch(PlayerToastNotice.SignatureUnsigned, 1);
    dispatch(PlayerToastNotice.SignatureRejected, 2);
    expect(toast()?.textContent).toBe(
      PLAYER_TOAST_COPY[PlayerToastNotice.SignatureRejected]
    );
  });

  it('stops listening on unmount', () => {
    const { unmount } = render(<PlayerToast />);
    unmount();
    expect(() => {
      dispatch(PlayerToastNotice.SignatureInvalid, 1);
    }).not.toThrow();
    expect(toast()).toBeNull();
  });
});
