import type { DP1ImageRendering } from '@/models/dp1.model';
import type { RefObject } from 'react';
import { useEffect, useState } from 'react';

/**
 * The enlargement, in device pixels per source pixel, from which the player
 * draws a still or a video with hard pixel edges when the work does not say.
 *
 * Why a threshold and not "any enlargement": nearest-neighbor resampling at a
 * small factor duplicates a row or column every few pixels. A 2048 px square
 * still on a 2160 px tall screen is enlarged 1.05x, so hard edges would double
 * about every 18th line of a photograph or a fine-line drawing, where smoothing at
 * that size is barely visible. From 2x up, each source pixel covers at least
 * two device pixels and smoothing turns pixel art and low-resolution works to
 * mush, which is what this default exists to stop.
 *
 * Why never on a reduction: Chromium's `pixelated` also uses nearest-neighbor
 * when shrinking, which drops source pixels outright and aliases any image
 * larger than the screen (moire, shimmering fine lines).
 */
export const HARD_EDGE_MIN_ENLARGEMENT = 2;

/** Natural or drawn size, in pixels. */
export interface PixelSize {
  width: number;
  height: number;
}

/**
 * How many device pixels one image pixel covers once the image is fitted into
 * its box. For `fill` (stretch) the axes differ, so this returns the smaller
 * one: if either axis shrinks, the image must stay smooth. Returns 0 when a
 * size is unknown (an image not yet decoded, or a box not yet laid out).
 */
export function imageEnlargement(
  natural: PixelSize,
  box: PixelSize,
  objectFit: 'contain' | 'cover' | 'fill'
): number {
  if (
    natural.width <= 0 ||
    natural.height <= 0 ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return 0;
  }
  const x = box.width / natural.width;
  const y = box.height / natural.height;
  return objectFit === 'cover' ? Math.max(x, y) : Math.min(x, y);
}

/**
 * The CSS `image-rendering` for one still or video. The work's own
 * `pixelated` always wins; otherwise (absent or `auto`) hard edges start at
 * HARD_EDGE_MIN_ENLARGEMENT.
 */
export function resolveImageRendering(
  authored: DP1ImageRendering | undefined,
  enlargement: number
): 'auto' | 'pixelated' {
  if (authored === 'pixelated') {
    return 'pixelated';
  }
  return enlargement >= HARD_EDGE_MIN_ENLARGEMENT ? 'pixelated' : 'auto';
}

/** Calls `onChange` on every resize of the element's layout box; returns the unsubscribe. */
function observeBox(el: HTMLElement, onChange: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') {
    return () => undefined;
  }
  const observer = new ResizeObserver(onChange);
  observer.observe(el);
  return () => {
    observer.disconnect();
  };
}

/**
 * Calls `onChange` whenever the pixel density changes, and returns the
 * unsubscribe.
 *
 * A density change with no layout change (a browser window moved to a monitor
 * with another density) reaches no ResizeObserver, `device-pixel-content-box`
 * included: in Chromium 155 only a resolution media query reports it. So this
 * listens to a query for the current density and re-arms it for the new one
 * at each change. FF OS sets no output scale, so on an FF1 a panel change
 * arrives as a viewport resize instead.
 */
function watchPixelDensity(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  let query: MediaQueryList | undefined;
  const arm = () => {
    query = window.matchMedia(
      `(resolution: ${String(window.devicePixelRatio || 1)}dppx)`
    );
    // `once`: the query for the old density is spent after its change.
    query.addEventListener('change', onDensityChange, { once: true });
  };
  function onDensityChange() {
    arm();
    onChange();
  }
  arm();
  return () => {
    query?.removeEventListener('change', onDensityChange);
  };
}

/** A still or a video: the two slot elements whose resampling the player sets. */
type RasterElement = HTMLImageElement | HTMLVideoElement;

/** The source's own pixel size: an image's natural size, a video's frame size. */
function sourceSize(el: RasterElement): PixelSize {
  return el instanceof HTMLVideoElement
    ? { width: el.videoWidth, height: el.videoHeight }
    : { width: el.naturalWidth, height: el.naturalHeight };
}

/**
 * The events after which a source's pixel size may have changed: `load` for
 * an image (the slot's media loader sets `src` after mount); for a video,
 * `loadedmetadata` and `resize`, which fires when the frame size changes
 * mid-play, as an HLS stream does when it switches renditions.
 */
const SOURCE_SIZE_EVENTS = ['load', 'loadedmetadata', 'resize'] as const;

/**
 * Measures an `<img>` or `<video>` against its own box and returns the
 * rendering to apply.
 *
 * Re-measures whenever the source's size may have changed (see
 * SOURCE_SIZE_EVENTS), on every resize of its box (a rotation is display-level
 * on the FF1, so it arrives as a viewport change; a margin change shrinks the
 * box), and on every pixel-density change. `clientWidth`/`clientHeight` are
 * layout sizes, so CSS transforms never skew them; multiplying by
 * `devicePixelRatio` puts the box in device pixels, which is where resampling
 * happens.
 */
export function useImageRendering(
  elementRef: RefObject<RasterElement | null>,
  authored: DP1ImageRendering | undefined,
  objectFit: 'contain' | 'cover' | 'fill'
): 'auto' | 'pixelated' {
  const [enlargement, setEnlargement] = useState(0);
  useEffect(() => {
    const el = elementRef.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const dpr = window.devicePixelRatio || 1;
      setEnlargement(
        imageEnlargement(
          sourceSize(el),
          { width: el.clientWidth * dpr, height: el.clientHeight * dpr },
          objectFit
        )
      );
    };
    measure();
    for (const type of SOURCE_SIZE_EVENTS) {
      el.addEventListener(type, measure);
    }
    const unobserve = observeBox(el, measure);
    const unwatch = watchPixelDensity(measure);
    return () => {
      for (const type of SOURCE_SIZE_EVENTS) {
        el.removeEventListener(type, measure);
      }
      unobserve();
      unwatch();
    };
  }, [elementRef, objectFit]);
  return resolveImageRendering(authored, enlargement);
}
