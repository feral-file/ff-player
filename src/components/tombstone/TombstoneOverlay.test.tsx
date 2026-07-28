/**
 * Contract for the tombstone label (feral-file#3452): render exactly the
 * lines there is data for, never render unlabeled, and give every item its
 * own timed visibility window in Timed mode.
 */
import { TombstoneMode } from '@/models/display_settings.model';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TombstoneOverlay, {
  TOMBSTONE_AUTO_DISMISS_SECONDS,
} from './TombstoneOverlay';

const overlayOpacity = () =>
  screen.getByTestId('tombstone-overlay').style.opacity;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  // The repo's vitest setup has no auto-cleanup; without this, renders leak
  // across tests and testid queries start matching multiple overlays.
  cleanup();
  vi.useRealTimers();
});

describe('TombstoneOverlay rendering', () => {
  it('renders artist, title, and curated lines when all data is present', () => {
    render(
      <TombstoneOverlay
        mode={TombstoneMode.On}
        itemKey="a"
        title="SIMULACRUM (E-P-01) (2026)"
        artistName="Casey REAS"
        curatorName="Feral File"
      />
    );
    expect(screen.getByText('Casey REAS')).toBeDefined();
    expect(screen.getByText('SIMULACRUM (E-P-01) (2026)')).toBeDefined();
    expect(screen.getByText('Curated by: Feral File')).toBeDefined();
  });

  it('omits the artist and curated lines when that data is absent', () => {
    render(
      <TombstoneOverlay mode={TombstoneMode.On} itemKey="a" title="Arrels #1" />
    );
    expect(screen.getByText('Arrels #1')).toBeDefined();
    expect(screen.queryByText(/Curated by:/)).toBeNull();
  });

  it('renders nothing when mode is Off or the title is missing', () => {
    const { rerender } = render(
      <TombstoneOverlay
        mode={TombstoneMode.Off}
        itemKey="a"
        title="Arrels #1"
      />
    );
    expect(screen.queryByTestId('tombstone-overlay')).toBeNull();

    rerender(<TombstoneOverlay mode={TombstoneMode.On} itemKey="a" />);
    expect(screen.queryByTestId('tombstone-overlay')).toBeNull();
  });
});

describe('TombstoneOverlay timing', () => {
  it('stays visible indefinitely in On mode', () => {
    render(
      <TombstoneOverlay mode={TombstoneMode.On} itemKey="a" title="Arrels #1" />
    );
    act(() => {
      vi.advanceTimersByTime((TOMBSTONE_AUTO_DISMISS_SECONDS + 5) * 1000);
    });
    expect(overlayOpacity()).toBe('1');
  });

  it('does not restart or resurrect the window when the title upgrades', () => {
    const { rerender } = render(
      <TombstoneOverlay
        mode={TombstoneMode.Timed}
        itemKey="a"
        title="Arrels #1"
      />
    );
    act(() => {
      vi.advanceTimersByTime(TOMBSTONE_AUTO_DISMISS_SECONDS * 1000 + 1);
    });
    expect(overlayOpacity()).toBe('0');

    // A late ref-manifest title (richer string, same item) must not bring
    // the dismissed label back mid-artwork.
    rerender(
      <TombstoneOverlay
        mode={TombstoneMode.Timed}
        itemKey="a"
        title="Arrels #1 (2021)"
      />
    );
    expect(overlayOpacity()).toBe('0');
  });

  it('auto-dismisses after the window in Timed mode and resets per item', () => {
    const { rerender } = render(
      <TombstoneOverlay
        mode={TombstoneMode.Timed}
        itemKey="a"
        title="Arrels #1"
      />
    );
    expect(overlayOpacity()).toBe('1');

    act(() => {
      vi.advanceTimersByTime(TOMBSTONE_AUTO_DISMISS_SECONDS * 1000 + 1);
    });
    expect(overlayOpacity()).toBe('0');

    rerender(
      <TombstoneOverlay
        mode={TombstoneMode.Timed}
        itemKey="b"
        title="METASOTO #1"
      />
    );
    expect(overlayOpacity()).toBe('1');
  });
});
