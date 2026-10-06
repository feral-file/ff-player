/**
 * Contract for `designPx`: frame px scale by the viewport's *short* side
 * (vmin), never vh. This is the portrait-scaling fix from the gallery-plaque
 * restyle — FF1 rotation is display-level, so a portrait wall reports a
 * 1080×1920 viewport where vh binds to the long side and inflates the label
 * ~1.78×. A regression back to vh (or any long-side unit) must fail here.
 */
import { describe, expect, it } from 'vitest';
import { designPx } from './designPx';

describe('designPx', () => {
  it('converts frame px to vmin against the 720px design short edge', () => {
    // 720 frame px is the full design height, i.e. 100% of the short side.
    expect(designPx(720)).toBe('100.0000vmin');
    // The plaque's base font size: 16/720 of the short side.
    expect(designPx(16)).toBe('2.2222vmin');
    expect(designPx(0)).toBe('0.0000vmin');
  });

  it('never emits a long-side-bound unit (vh/vw/%)', () => {
    for (const px of [1.5, 8, 14, 16, 20, 24, 40, 640]) {
      expect(designPx(px)).toMatch(/^\d+\.\d{4}vmin$/);
    }
  });
});
