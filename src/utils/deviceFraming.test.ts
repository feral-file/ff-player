import { describe, expect, it } from 'vitest';
import { Scaling } from '@/models/dp1.model';
import { applyDeviceFraming, deviceFraming } from './deviceFraming';

describe('persistent device framing', () => {
  it.each(['artwork', undefined, null, 'unknown'])('follows the work for %s', value => {
    const authored = { scaling: Scaling.Fill, margin: '10%' };
    expect(applyDeviceFraming(authored, value)).toBe(authored);
    expect(deviceFraming(value)).toBe('artwork');
  });

  it.each([
    ['fit', Scaling.Fill, Scaling.Fit],
    ['fill', Scaling.Fit, Scaling.Fill],
  ] as const)('lets the owner choose %s without editing art', (mode, before, after) => {
    const authored = { scaling: before, margin: '10%', background: '#123456' };
    expect(applyDeviceFraming(authored, mode)).toEqual({ ...authored, scaling: after });
    expect(authored.scaling).toBe(before);
  });

  it('honors the authored restriction on viewer changes', () => {
    const authored = { scaling: Scaling.Fit, userOverrides: false };
    expect(applyDeviceFraming(authored, 'fill')).toBe(authored);
  });

  it('lets two devices render the same document independently', () => {
    const authored = { scaling: Scaling.Fit };
    expect(applyDeviceFraming(authored, 'fit').scaling).toBe(Scaling.Fit);
    expect(applyDeviceFraming(authored, 'fill').scaling).toBe(Scaling.Fill);
    expect(applyDeviceFraming(authored, 'artwork')).toBe(authored);
  });
});
