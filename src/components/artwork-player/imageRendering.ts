import type { DP1ImageRendering } from '@/models/dp1.model';
import type { RefObject } from 'react';
import { useEffect, useState } from 'react';

/**
 * The enlargement, in device pixels per image pixel, from which the player
 * draws an image with hard pixel edges when the work does not say.
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
 * The CSS `image-rendering` for one image. The work's own `pixelated` always
 * wins; otherwise (absent or `auto`) hard edges start at
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

/**
 * Measures an `<img>` against its own box and returns the rendering to apply.
 *
 * Re-measures on every `load` (the slot's media loader sets `src` after
 * mount) and on every box resize (a rotation is display-level on the FF1, so
 * it arrives as a viewport change; a margin change shrinks the box).
 * `clientWidth`/`clientHeight` are layout sizes, so CSS transforms never skew
 * them; multiplying by `devicePixelRatio` puts the box in device pixels, which
 * is where resampling happens.
 */
export function useImageRendering(
  imageRef: RefObject<HTMLImageElement | null>,
  authored: DP1ImageRendering | undefined,
  objectFit: 'contain' | 'cover' | 'fill'
): 'auto' | 'pixelated' {
  const [enlargement, setEnlargement] = useState(0);
  useEffect(() => {
    const el = imageRef.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const dpr = window.devicePixelRatio || 1;
      setEnlargement(
        imageEnlargement(
          { width: el.naturalWidth, height: el.naturalHeight },
          { width: el.clientWidth * dpr, height: el.clientHeight * dpr },
          objectFit
        )
      );
    };
    measure();
    el.addEventListener('load', measure);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener('load', measure);
      observer?.disconnect();
    };
  }, [imageRef, objectFit]);
  return resolveImageRendering(authored, enlargement);
}
