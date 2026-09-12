import { describe, expect, it } from 'vitest';
import { toastStyle } from '../tombstone/TombstoneToast';
import { PLAYER_TOAST_COPY } from './PlayerToast';

/*
 * The pill is nowrap, so its one-line promise is a sizing budget: at every
 * documented viewport the longest copy must fit inside maxWidth. jsdom has
 * no text metrics, so the budget is pinned arithmetically from a measured em
 * width: in Chrome with PP Mori loaded, the 59-character
 * "Playlist not shown: …" renders at 25.57 em (0.433 em per character; the
 * other two notices at 0.437 and 0.418). 0.45 leaves margin. The unit must
 * stay vmin (the tombstone sizing contract): at vh on a 2160×3840 portrait
 * wall the type is 85px and the line needs ~2,350px of a 1,728px budget.
 */
const AVERAGE_EM_PER_CHAR = 0.45;
const VIEWPORTS = [
  { name: '3840x2160', w: 3840, h: 2160 },
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '2160x3840 portrait', w: 2160, h: 3840 },
];

function vminPx(value: string, w: number, h: number): number {
  expect(value.endsWith('vmin'), `expected a vmin length, got ${value}`).toBe(
    true
  );
  return (parseFloat(value) / 100) * Math.min(w, h);
}

describe('PlayerToast sizing', () => {
  it('fits the longest notice on one line inside maxWidth at every documented viewport', () => {
    const longest = Object.values(PLAYER_TOAST_COPY).reduce((a, b) =>
      a.length >= b.length ? a : b
    );
    const [, padX] = String(toastStyle.padding).split(' ');
    expect(padX).toBeDefined();
    expect(toastStyle.maxWidth).toBe('80%');
    for (const { name, w, h } of VIEWPORTS) {
      const font = vminPx(String(toastStyle.fontSize), w, h);
      const padding = 2 * vminPx(padX, w, h);
      const needed = longest.length * AVERAGE_EM_PER_CHAR * font + padding;
      const budget = 0.8 * w;
      expect(
        needed,
        `${name}: ${String(Math.round(needed))}px needed of ${String(budget)}px`
      ).toBeLessThan(budget);
    }
  });
});
