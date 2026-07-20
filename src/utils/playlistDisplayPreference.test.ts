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
  loadRefManifestDisplay,
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
