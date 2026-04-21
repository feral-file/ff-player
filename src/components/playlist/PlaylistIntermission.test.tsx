/**
 * Unit tests for `PlaylistIntermission` — dismissal via keyboard, click,
 * auto-focus, and timeout completion.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PlaylistIntermission,
  type PlaylistIntermissionProps,
} from './PlaylistIntermission';

// eslint-disable-next-line max-lines-per-function
describe('PlaylistIntermission', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const defaultProps: PlaylistIntermissionProps = {
    text: 'Test intermission note',
    durationSeconds: 5,
    onComplete: vi.fn(),
  };

  describe('rendering', () => {
    it('renders the provided text', () => {
      render(<PlaylistIntermission {...defaultProps} />);
      const textElement = screen.getByText('Test intermission note');
      expect(textElement).toBeTruthy();
    });

    it('renders with role status and aria-live polite', () => {
      render(<PlaylistIntermission {...defaultProps} />);
      const overlay = screen.getByRole('status');
      expect(overlay).toBeTruthy();
      expect(overlay.getAttribute('aria-live')).toBe('polite');
    });

    it('has tabIndex 0 for keyboard accessibility', () => {
      render(<PlaylistIntermission {...defaultProps} />);
      const overlay = screen.getByRole('status');
      expect(overlay.getAttribute('tabIndex')).toBe('0');
    });
  });

  describe('auto-focus', () => {
    it('auto-focuses the overlay on mount', () => {
      render(<PlaylistIntermission {...defaultProps} />);
      const overlay = screen.getByRole('status');
      expect(document.activeElement).toBe(overlay);
    });

    it('allows keyboard dismissal without manual focus', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission {...defaultProps} onComplete={onComplete} />
      );

      // Element should already be focused
      const overlay = screen.getByRole('status');
      expect(document.activeElement).toBe(overlay);

      // Press Enter to dismiss
      fireEvent.keyDown(overlay, { key: 'Enter' });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard dismissal', () => {
    it('calls onComplete when Enter key is pressed', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission {...defaultProps} onComplete={onComplete} />
      );

      const overlay = screen.getByRole('status');
      fireEvent.keyDown(overlay, { key: 'Enter' });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('calls onComplete when Space key is pressed', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission {...defaultProps} onComplete={onComplete} />
      );

      const overlay = screen.getByRole('status');
      fireEvent.keyDown(overlay, { key: ' ' });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('prevents default behavior for Space key', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission {...defaultProps} onComplete={onComplete} />
      );

      const overlay = screen.getByRole('status');
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      overlay.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('does not call onComplete for other keys', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission {...defaultProps} onComplete={onComplete} />
      );

      const overlay = screen.getByRole('status');
      fireEvent.keyDown(overlay, { key: 'Escape' });
      fireEvent.keyDown(overlay, { key: 'Tab' });
      fireEvent.keyDown(overlay, { key: 'a' });

      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('click dismissal', () => {
    it('calls onComplete when overlay is clicked', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission {...defaultProps} onComplete={onComplete} />
      );

      const overlay = screen.getByRole('status');
      fireEvent.click(overlay);

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('calls onComplete only once if clicked multiple times quickly', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission {...defaultProps} onComplete={onComplete} />
      );

      const overlay = screen.getByRole('status');
      fireEvent.click(overlay);
      fireEvent.click(overlay);
      fireEvent.click(overlay);

      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  // eslint-disable-next-line max-lines-per-function
  describe('timeout completion', () => {
    it('calls onComplete after durationSeconds elapses', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission
          text="Test"
          durationSeconds={5}
          onComplete={onComplete}
        />
      );

      expect(onComplete).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('uses default duration if durationSeconds is 0', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission
          text="Test"
          durationSeconds={0}
          onComplete={onComplete}
        />
      );

      // Default is 20 seconds (DP1_DEFAULT_INTERMISSION_SECONDS)
      act(() => {
        vi.advanceTimersByTime(20000);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('uses default duration if durationSeconds is negative', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission
          text="Test"
          durationSeconds={-10}
          onComplete={onComplete}
        />
      );

      act(() => {
        vi.advanceTimersByTime(20000);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('uses default duration if durationSeconds is Infinity', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission
          text="Test"
          durationSeconds={Infinity}
          onComplete={onComplete}
        />
      );

      act(() => {
        vi.advanceTimersByTime(20000);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('resets timer when text changes', () => {
      const onComplete = vi.fn();
      const { rerender } = render(
        <PlaylistIntermission
          text="First note"
          durationSeconds={5}
          onComplete={onComplete}
        />
      );

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Change text (new intermission)
      rerender(
        <PlaylistIntermission
          text="Second note"
          durationSeconds={5}
          onComplete={onComplete}
        />
      );

      // Advance another 3 seconds (6 total, but timer was reset at 3s)
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(onComplete).not.toHaveBeenCalled();

      // Complete the new 5-second timer
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('clears timeout on unmount', () => {
      const onComplete = vi.fn();
      const { unmount } = render(
        <PlaylistIntermission
          text="Test"
          durationSeconds={5}
          onComplete={onComplete}
        />
      );

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      unmount();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('calls onComplete only once even if triggered multiple ways', () => {
      const onComplete = vi.fn();
      render(
        <PlaylistIntermission
          text="Test"
          durationSeconds={5}
          onComplete={onComplete}
        />
      );

      const overlay = screen.getByRole('status');

      // Trigger via click
      fireEvent.click(overlay);

      // Try to trigger again via keyboard
      fireEvent.keyDown(overlay, { key: 'Enter' });

      // Try to trigger via timeout
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('resets doneRef when rerendered with identical props after dismissal', () => {
      const onComplete = vi.fn();
      const { unmount } = render(
        <PlaylistIntermission
          text="Loading..."
          durationSeconds={5}
          onComplete={onComplete}
        />
      );

      const overlay = screen.getByRole('status');
      fireEvent.click(overlay);
      expect(onComplete).toHaveBeenCalledTimes(1);

      // Unmount and remount with identical props (simulates component reuse)
      unmount();
      onComplete.mockClear();

      render(
        <PlaylistIntermission
          text="Loading..."
          durationSeconds={5}
          onComplete={onComplete}
        />
      );

      const newOverlay = screen.getByRole('status');
      fireEvent.click(newOverlay);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
