/**
 * Unit coverage for the ref-manifest display loader: the session cache is
 * keyed by content identity (ref + refHash), so a refreshed item with the
 * same URL but a different refHash never inherits a prior manifest's display
 * authority.
 */
import type { DP1Item } from '@/models/dp1.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRefManifestDisplayCache,
  clearUnversionedRefManifestDisplayCache,
  loadRefManifestDisplay,
  loadRefManifestLabel,
} from './playlistDisplayPreference';

const { getItemRefMock } = vi.hoisted(() => ({ getItemRefMock: vi.fn() }));

vi.mock('@/services/DP1Service', () => ({
  DP1Service: { getItemRef: getItemRefMock, getPlaylist: vi.fn() },
}));

/** A ref item with an optional refHash version identity. */
function refItem(refHash?: string): DP1Item {
  return {
    id: 'a',
    source: 'https://example.com/a.html',
    license: {},
    ref: 'https://example.com/manifest.json',
    refHash,
  } as DP1Item;
}

describe('concurrent display and label loads share one fetch', () => {
  afterEach(() => {
    clearRefManifestDisplayCache();
    vi.clearAllMocks();
  });

  it('issues a single getItemRef when both consumers miss their caches in the same tick', async () => {
    let resolveManifest: (manifest: unknown) => void = () => undefined;
    getItemRefMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveManifest = resolve;
        })
    );

    // Display-preference path and tombstone label path race for the same
    // uncached ref, exactly like a slot entry does in production.
    const displayPromise = loadRefManifestDisplay(refItem('h1'));
    const labelPromise = loadRefManifestLabel(refItem('h1'));

    resolveManifest({
      controls: { display: { userOverrides: false } },
      metadata: { title: 'Work (2026)', artists: [{ name: 'Artist' }] },
    });

    const [display, label] = await Promise.all([displayPromise, labelPromise]);
    expect(getItemRefMock).toHaveBeenCalledTimes(1);
    expect(display?.userOverrides).toBe(false);
    expect(label?.title).toBe('Work (2026)');
    expect(label?.artistNames).toBe('Artist');
  });
});

describe('loadRefManifestDisplay session cache', () => {
  afterEach(() => {
    clearRefManifestDisplayCache();
    vi.clearAllMocks();
  });

  it('caches by ref for repeat visits', async () => {
    getItemRefMock.mockResolvedValue({
      controls: { display: { userOverrides: false } },
    } as never);

    const first = await loadRefManifestDisplay(refItem('h1'));
    const second = await loadRefManifestDisplay(refItem('h1'));

    expect(first?.userOverrides).toBe(false);
    expect(second?.userOverrides).toBe(false);
    expect(getItemRefMock).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a cached display across a different refHash', async () => {
    getItemRefMock.mockResolvedValueOnce({
      controls: { display: { userOverrides: false } },
    } as never);
    getItemRefMock.mockResolvedValueOnce({
      controls: { display: { userOverrides: true } },
    } as never);

    const v1 = await loadRefManifestDisplay(refItem('h1'));
    const v2 = await loadRefManifestDisplay(refItem('h2'));

    expect(v1?.userOverrides).toBe(false);
    expect(v2?.userOverrides).toBe(true);
    expect(getItemRefMock).toHaveBeenCalledTimes(2);
  });

  it('a fresh-cast boundary drops only hash-less entries', async () => {
    getItemRefMock.mockResolvedValueOnce({
      controls: { display: { userOverrides: false } },
    } as never);
    getItemRefMock.mockResolvedValueOnce({
      controls: { display: { loop: false } },
    } as never);
    getItemRefMock.mockResolvedValueOnce({
      controls: { display: { userOverrides: true } },
    } as never);

    await loadRefManifestDisplay(refItem());
    await loadRefManifestDisplay(refItem('h1'));
    clearUnversionedRefManifestDisplayCache();

    // Hash-less entry refetches (new manifest content honored)...
    const refetched = await loadRefManifestDisplay(refItem());
    expect(refetched?.userOverrides).toBe(true);
    // ...while the hashed entry stays cached.
    const cached = await loadRefManifestDisplay(refItem('h1'));
    expect(cached?.loop).toBe(false);
    expect(getItemRefMock).toHaveBeenCalledTimes(3);
  });

  it('does not cache failures', async () => {
    getItemRefMock.mockRejectedValueOnce(new Error('offline') as never);
    getItemRefMock.mockResolvedValueOnce({
      controls: { display: { loop: false } },
    } as never);

    const failed = await loadRefManifestDisplay(refItem('h1'));
    const retried = await loadRefManifestDisplay(refItem('h1'));

    expect(failed).toBeUndefined();
    expect(retried?.loop).toBe(false);
    expect(getItemRefMock).toHaveBeenCalledTimes(2);
  });
});
