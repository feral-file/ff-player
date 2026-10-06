/**
 * Unit coverage for the ref-manifest display loader: the session cache is
 * keyed by content identity (ref + refHash), so a refreshed item with the
 * same URL but a different refHash never inherits a prior manifest's display
 * authority.
 */
import type {
  DP1Defaults,
  DP1DisplayPreference,
  DP1Item,
} from '@/models/dp1.model';
import { DP1License, Scaling } from '@/models/dp1.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRefManifestDisplayCache,
  clearUnversionedRefManifestDisplayCache,
  deviceDefaultDisplay,
  extractManifestLabel,
  loadRefManifestDisplay,
  loadRefManifestLabel,
  mergeItemDisplayPreference,
  resolveAndApplyItemDisplayPreference,
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

/**
 * An item carrying a complete Ref Manifest inline (§3.6), no ref.
 *
 * Deliberately built with NO `as` cast, unlike refItem above: the manifest
 * here is the minimum the ref-manifest schema accepts (only refVersion/id/
 * created/locale are required of it), so this fixture stops compiling the
 * moment RefManifest starts demanding a field the spec allows to be absent.
 * That is the standing guard against the over-required types this suite
 * previously had to cast its way past.
 */
function inlineManifestItem(
  display: DP1DisplayPreference,
  ref?: string
): DP1Item {
  return {
    id: 'a',
    source: 'https://example.com/a.html',
    license: DP1License.Open,
    ref,
    inlineManifest: {
      refVersion: '1.1.0',
      id: 'manifest-1',
      created: '2026-01-01T00:00:00Z',
      locale: 'en',
      controls: { display },
    },
  };
}

describe('inlineManifest display layer (§3.6)', () => {
  afterEach(() => {
    clearRefManifestDisplayCache();
    vi.clearAllMocks();
  });

  it('applies the inline manifest controls over the baked-in defaults', () => {
    const merged = mergeItemDisplayPreference(
      inlineManifestItem({ scaling: Scaling.Fill }),
      null
    );
    expect(merged.scaling).toBe(Scaling.Fill);
    // Untouched keys still fall through to the defaults.
    expect(merged.background).toBe('#000000');
  });

  it('lets a fetched ref manifest outrank the inline copy', () => {
    const merged = mergeItemDisplayPreference(
      inlineManifestItem(
        { scaling: Scaling.Fill, background: '#111111' },
        'https://example.com/manifest.json'
      ),
      null,
      { scaling: Scaling.Stretch }
    );
    // §3.6: a fetched ref manifest is authoritative...
    expect(merged.scaling).toBe(Scaling.Stretch);
    // ...but only for the keys it actually sets; the inline copy still
    // supplies the rest, which is the whole point of layering rather than
    // choosing one document wholesale.
    expect(merged.background).toBe('#111111');
  });

  it('applies the inline manifest over the playlist defaults', () => {
    const merged = mergeItemDisplayPreference(
      inlineManifestItem({ scaling: Scaling.Fill }),
      { display: { scaling: Scaling.Stretch } } as DP1Defaults
    );
    expect(merged.scaling).toBe(Scaling.Fill);
  });

  it('keeps item-local and override display above the inline manifest', () => {
    const item = inlineManifestItem({ scaling: Scaling.Fill });
    expect(
      mergeItemDisplayPreference(
        { ...item, override: { display: { scaling: Scaling.Stretch } } },
        null
      ).scaling
    ).toBe(Scaling.Stretch);
    expect(
      mergeItemDisplayPreference(
        { ...item, display: { scaling: Scaling.Auto } },
        null
      ).scaling
    ).toBe(Scaling.Auto);
  });

});

/**
 * The device's persisted machine default is the lowest DP-1 layer: it fills
 * the gap when no document names a field and never beats a curator's value.
 * Regression guard for the fault where a device that had ever stored `fit`
 * rendered a `defaults.display.scaling: fill` playlist at `fit`.
 */
describe('device machine-default layer', () => {
  /** A ref-less, manifest-less item: the only scaling it can have is inherited. */
  const bareItem = {
    id: 'a',
    source: 'https://example.com/a.html',
    license: {},
  } as DP1Item;

  it('fills the gap when no DP-1 document sets scaling', () => {
    const merged = mergeItemDisplayPreference(bareItem, null, undefined, {
      scaling: Scaling.Fill,
    });
    expect(merged.scaling).toBe(Scaling.Fill);
  });

  it('loses to playlist defaults.display', () => {
    const merged = mergeItemDisplayPreference(
      bareItem,
      { display: { scaling: Scaling.Fill } } as DP1Defaults,
      undefined,
      { scaling: Scaling.Fit }
    );
    expect(merged.scaling).toBe(Scaling.Fill);
  });

  it('loses to the item and manifest layers', () => {
    expect(
      mergeItemDisplayPreference(
        { ...bareItem, display: { scaling: Scaling.Fit } },
        null,
        undefined,
        { scaling: Scaling.Fill }
      ).scaling
    ).toBe(Scaling.Fit);
    expect(
      mergeItemDisplayPreference(
        inlineManifestItem({ scaling: Scaling.Stretch }),
        null,
        undefined,
        { scaling: Scaling.Fill }
      ).scaling
    ).toBe(Scaling.Stretch);
  });

  it('rides the async resolution path for a no-ref item', async () => {
    const applied: DP1DisplayPreference[] = [];
    await resolveAndApplyItemDisplayPreference(
      bareItem,
      { display: { scaling: Scaling.Fill } } as DP1Defaults,
      merged => applied.push(merged),
      { scaling: Scaling.Fit }
    );
    expect(applied).toHaveLength(1);
    expect(applied[0].scaling).toBe(Scaling.Fill);
    expect(getItemRefMock).not.toHaveBeenCalled();
  });

  it('deviceDefaultDisplay carries only a known scaling value', () => {
    expect(deviceDefaultDisplay(Scaling.Fill)).toEqual({
      scaling: Scaling.Fill,
    });
    expect(deviceDefaultDisplay('fit')).toEqual({ scaling: Scaling.Fit });
    expect(deviceDefaultDisplay(undefined)).toBeUndefined();
    expect(deviceDefaultDisplay(null)).toBeUndefined();
    expect(deviceDefaultDisplay('crop')).toBeUndefined();
    // An absent layer must not spread an explicit `undefined` over the
    // baked-in default.
    expect(
      mergeItemDisplayPreference(bareItem, null, undefined, undefined).scaling
    ).toBe(Scaling.Fit);
  });
});

/**
 * The layering above is pure; these cover how an inline manifest behaves once
 * it goes through the real resolve path, and what a malformed one costs.
 */
describe('inlineManifest resolution and robustness', () => {
  afterEach(() => {
    clearRefManifestDisplayCache();
    vi.clearAllMocks();
  });

  it('leaves the inline copy standing after a failed ref fetch', async () => {
    // Driven through the real resolve path rather than by handing undefined
    // to the merge: the claim is that a FAILED FETCH leaves the inline layer
    // standing, and only this layer exercises the rejection handling, the
    // gate race, and the late-arrival re-apply that could each undo it.
    getItemRefMock.mockRejectedValue(new Error('offline'));

    const applied: DP1DisplayPreference[] = [];
    await resolveAndApplyItemDisplayPreference(
      inlineManifestItem(
        { scaling: Scaling.Fill },
        'https://example.com/manifest.json'
      ),
      null,
      merged => applied.push(merged)
    );

    expect(getItemRefMock).toHaveBeenCalledTimes(1);
    expect(applied.length).toBeGreaterThan(0);
    // Every apply, not just the last: a transient frame showing the
    // un-inlined merge would be a visible flash on the wall.
    for (const merged of applied) {
      expect(merged.scaling).toBe(Scaling.Fill);
    }
  });

  it('degrades a malformed artists array instead of throwing', () => {
    // An inlineManifest is read during render (useTombstoneInfo's useMemo),
    // not inside a promise chain, so a throw here escapes to the nearest
    // error boundary — of which this app has none below global-error. A
    // manifest that is merely wrong must cost a missing label line, never
    // the artwork on screen.
    const malformed = [
      { artists: [null] },
      { artists: [undefined, { name: 'Real Artist' }] },
      { artists: 'not-an-array' },
      { artists: [{ name: 42 }] },
      { title: 17 },
    ];
    for (const metadata of malformed) {
      expect(() =>
        extractManifestLabel(
          metadata as unknown as Parameters<typeof extractManifestLabel>[0]
        )
      ).not.toThrow();
    }
    // A usable name beside a broken entry still gets through.
    expect(
      extractManifestLabel({
        artists: [undefined, { name: 'Real Artist' }],
      } as unknown as Parameters<typeof extractManifestLabel>[0])?.artistNames
    ).toBe('Real Artist');
  });

  it('resolves an inline-only item synchronously, with no manifest fetch', async () => {
    // The slot timer is gated on a merge landing. An item whose manifest is
    // already in hand must not be routed through the ref path's
    // REF_MANIFEST_GATE_TIMEOUT_MS wait, and must not touch the network.
    const applied: DP1DisplayPreference[] = [];
    await resolveAndApplyItemDisplayPreference(
      inlineManifestItem({ scaling: Scaling.Fill }),
      null,
      merged => applied.push(merged)
    );

    expect(getItemRefMock).not.toHaveBeenCalled();
    expect(applied).toHaveLength(1);
    expect(applied[0].scaling).toBe(Scaling.Fill);
  });
});

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
