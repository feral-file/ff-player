import { LoopMode } from '@/models/cast_info.model';
import { describe, expect, it } from 'vitest';
import { coerceLoopMode } from './loopMode';

describe('coerceLoopMode', () => {
  it('passes through known cast loop mode strings', () => {
    expect(coerceLoopMode('none')).toBe(LoopMode.none);
    expect(coerceLoopMode('playlist')).toBe(LoopMode.playlist);
    expect(coerceLoopMode('one')).toBe(LoopMode.one);
  });

  it('falls back to playlist for unknown or empty payloads', () => {
    expect(coerceLoopMode('invalid')).toBe(LoopMode.playlist);
    expect(coerceLoopMode(undefined)).toBe(LoopMode.playlist);
    expect(coerceLoopMode('')).toBe(LoopMode.playlist);
  });
});
