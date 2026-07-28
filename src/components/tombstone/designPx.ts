/**
 * The design canvas is 1280×720, so every px value in the frame is relative to
 * a 720-tall viewport — absolute CSS pixels would render at two-thirds size on
 * a 1080p wall and a quarter size at 4K. `designPx` converts frame px to vh so
 * a value holds its designed proportion at any output resolution.
 *
 * Shared by the tombstone label and its confirmation toast, which have to scale
 * together.
 */
export const designPx = (px: number): string =>
  `${((px / 720) * 100).toFixed(4)}vh`;
