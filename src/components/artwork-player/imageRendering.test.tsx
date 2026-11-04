/**
 * Contract for how a still is resampled. Smoothing turns enlarged pixel art
 * and low-resolution works to mush; nearest-neighbor on a reduction aliases
 * any image larger than the screen, because Chromium's `pixelated` applies to
 * shrinking too. So the player draws hard edges from a 2x enlargement up,
 * smooths below it, and lets a work's own `pixelated` win in every case.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HARD_EDGE_MIN_ENLARGEMENT,
  imageEnlargement,
  resolveImageRendering,
  useImageRendering,
} from './imageRendering';

const screen4K = { width: 3840, height: 2160 };

describe('imageEnlargement', () => {
  it('uses the binding axis for Fit and the covering axis for Fill', () => {
    const natural = { width: 1000, height: 500 };
    const box = { width: 2000, height: 2000 };
    expect(imageEnlargement(natural, box, 'contain')).toBe(2);
    expect(imageEnlargement(natural, box, 'cover')).toBe(4);
  });

  it('reads a stretch by its smaller axis, so a shrink on either stays smooth', () => {
    expect(
      imageEnlargement(
        { width: 100, height: 4000 },
        { width: 3840, height: 2160 },
        'fill'
      )
    ).toBeCloseTo(0.54, 2);
  });

  it('is 0 until both the image and its box have a size', () => {
    expect(
      imageEnlargement({ width: 0, height: 0 }, screen4K, 'contain')
    ).toBe(0);
    expect(
      imageEnlargement(
        { width: 64, height: 64 },
        { width: 0, height: 0 },
        'contain'
      )
    ).toBe(0);
  });
});

describe('resolveImageRendering', () => {
  it('keeps hard edges from the threshold up when the work does not say', () => {
    expect(resolveImageRendering(undefined, HARD_EDGE_MIN_ENLARGEMENT)).toBe(
      'pixelated'
    );
    expect(resolveImageRendering('auto', 33.75)).toBe('pixelated');
  });

  it('smooths a reduction and a small enlargement', () => {
    // A 2048 px square still on a 4K screen: 1.05x.
    const slight = imageEnlargement(
      { width: 2048, height: 2048 },
      screen4K,
      'contain'
    );
    expect(resolveImageRendering(undefined, slight)).toBe('auto');
    expect(resolveImageRendering(undefined, 0.5)).toBe('auto');
    expect(resolveImageRendering(undefined, 0)).toBe('auto');
  });

  it("lets the work's pixelated win at any size", () => {
    expect(resolveImageRendering('pixelated', 0.5)).toBe('pixelated');
    expect(resolveImageRendering('pixelated', 1.05)).toBe('pixelated');
  });
});

/** An <img> whose natural and laid-out sizes the test controls. */
function sizedImage(natural: number, box: number) {
  const img = document.createElement('img');
  const size = { natural, box };
  for (const [key, read] of [
    ['naturalWidth', () => size.natural],
    ['naturalHeight', () => size.natural],
    ['clientWidth', () => size.box],
    ['clientHeight', () => size.box],
  ] as const) {
    Object.defineProperty(img, key, { configurable: true, get: read });
  }
  return { img, size };
}

describe('useImageRendering', () => {
  it('re-measures when a new source loads into the same element', () => {
    const { img, size } = sizedImage(8, 2160);
    const ref = { current: img };
    const { result } = renderHook(() =>
      useImageRendering(ref, undefined, 'contain')
    );
    expect(result.current).toBe('pixelated');

    size.natural = 4000;
    act(() => {
      img.dispatchEvent(new Event('load'));
    });
    expect(result.current).toBe('auto');
  });

  it('re-measures on each pixel-density change with no layout change', () => {
    // A density change alone reaches no ResizeObserver; only a resolution
    // media query reports it, so the hook must hold one for the current
    // density and re-arm it for the next.
    const queries: { media: string; listeners: Set<() => void> }[] = [];
    vi.stubGlobal('matchMedia', (media: string) => {
      const query = { media, listeners: new Set<() => void>() };
      queries.push(query);
      return {
        media,
        addEventListener: (_type: string, listener: () => void) => {
          query.listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
          query.listeners.delete(listener);
        },
      };
    });
    const fire = (index: number) => {
      act(() => {
        for (const listener of Array.from(queries[index].listeners)) {
          queries[index].listeners.delete(listener); // `once`
          listener();
        }
      });
    };
    try {
      const dpr = vi
        .spyOn(window, 'devicePixelRatio', 'get')
        .mockReturnValue(1);
      // 480 px drawn into 720 CSS px: 1.5x at density 1, 3x at density 2.
      const { img } = sizedImage(480, 720);
      const ref = { current: img }; // stable, like the slot's createRef
      const { result, unmount } = renderHook(() =>
        useImageRendering(ref, undefined, 'contain')
      );
      expect(result.current).toBe('auto');
      expect(queries.map(q => q.media)).toEqual(['(resolution: 1dppx)']);

      dpr.mockReturnValue(2);
      fire(0);
      expect(result.current).toBe('pixelated');
      expect(queries[1].media).toBe('(resolution: 2dppx)');

      dpr.mockReturnValue(1);
      fire(1);
      expect(result.current).toBe('auto');

      unmount();
      expect(queries[2].listeners.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('smooths before the image has decoded', () => {
    const { img } = sizedImage(0, 2160);
    const { result } = renderHook(() =>
      useImageRendering({ current: img }, undefined, 'contain')
    );
    expect(result.current).toBe('auto');
  });
});
