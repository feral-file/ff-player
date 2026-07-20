/**
 * Coverage for the museum-style Tombstone overlay: it renders multi-role
 * credit + provenance when a work loads, hides itself after the hold window,
 * and re-shows when a new work (new itemIdentity) loads.
 */
import { DP1Tombstone } from '@/models/dp1.model';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Tombstone from './Tombstone';

const sample: DP1Tombstone = {
  title: 'ART MOON RISING',
  makers: [
    { role: 'Visual', name: 'Justin Wetch' },
    { role: 'Curation', name: 'Roger Dickerman' },
  ],
  basedOn: ['Sam Spratt', 'Beeple', 'Jack Butcher'],
  source: '24 Hours of Art',
  owner: 'ekaitza.eth',
  durationSeconds: 5,
};

describe('Tombstone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  it('renders distinct maker roles, based-on, source and owner', () => {
    render(<Tombstone data={sample} itemIdentity="a" />);
    expect(screen.getByText('ART MOON RISING')).toBeTruthy();
    expect(screen.getByText('Visual')).toBeTruthy();
    expect(screen.getByText('Justin Wetch')).toBeTruthy();
    expect(screen.getByText('Curation')).toBeTruthy();
    expect(screen.getByText('Roger Dickerman')).toBeTruthy();
    expect(screen.getByText(/Sam Spratt/)).toBeTruthy();
    expect(screen.getByText('24 Hours of Art')).toBeTruthy();
    expect(screen.getByText('Held by ekaitza.eth')).toBeTruthy();
  });

  it('shows then fades out after the hold window', () => {
    render(<Tombstone data={sample} itemIdentity="a" />);
    const label = screen.getByRole('status');
    expect(label.style.opacity).toBe('1');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(label.style.opacity).toBe('0');
  });

  it('re-shows when a new work loads (itemIdentity changes)', () => {
    const { rerender } = render(<Tombstone data={sample} itemIdentity="a" />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('status').style.opacity).toBe('0');
    rerender(<Tombstone data={sample} itemIdentity="b" />);
    expect(screen.getByRole('status').style.opacity).toBe('1');
  });

  it('renders nothing when there is no content', () => {
    const { container } = render(<Tombstone data={{}} itemIdentity="a" />);
    expect(container.firstChild).toBeNull();
  });

  it('falls back to fallbackTitle when the tombstone has no title', () => {
    render(<Tombstone data={{}} fallbackTitle="Untitled" itemIdentity="a" />);
    expect(screen.getByText('Untitled')).toBeTruthy();
  });
});
