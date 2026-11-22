import { describe, expect, it } from 'vitest';
import { MediaHealthHintStore, parseMediaHealthHints } from './MediaHealthHints';

describe('parseMediaHealthHints', () => {
  it('keeps well-formed entries keyed by source', () => {
    expect(
      parseMediaHealthHints({
        'https://a.test/x': { category: 'source_missing', reason: 'http_status' },
      })
    ).toEqual({
      'https://a.test/x': { category: 'source_missing', reason: 'http_status' },
    });
  });

  it('treats anything but a plain object as no hints', () => {
    expect(parseMediaHealthHints(undefined)).toEqual({});
    expect(parseMediaHealthHints(null)).toEqual({});
    expect(parseMediaHealthHints('broken')).toEqual({});
    expect(parseMediaHealthHints(['https://a.test/x'])).toEqual({});
  });

  it('drops malformed entries but keeps a hint whose fields are unreadable', () => {
    expect(
      parseMediaHealthHints({
        'https://a.test/skip': 'yes',
        'https://a.test/array': [],
        'https://a.test/bare': {},
        'https://a.test/typed': { category: 7, reason: null },
      })
    ).toEqual({
      'https://a.test/bare': { category: '', reason: '' },
      'https://a.test/typed': { category: '', reason: '' },
    });
  });
});

describe('MediaHealthHintStore', () => {
  it('replaces the whole map on each push and clears on demand', () => {
    const store = new MediaHealthHintStore();
    store.replace({ 'https://a.test/1': { category: 'c', reason: 'r' } });
    expect(store.hint('https://a.test/1')).toEqual({ category: 'c', reason: 'r' });
    store.replace({ 'https://a.test/2': { category: 'c', reason: 'r' } });
    expect(store.hint('https://a.test/1')).toBeUndefined();
    expect(store.size).toBe(1);
    store.clear();
    expect(store.size).toBe(0);
  });

  it('does not answer for inherited object keys', () => {
    const store = new MediaHealthHintStore();
    store.replace({ 'https://a.test/1': { category: 'c', reason: 'r' } });
    expect(store.hint('constructor')).toBeUndefined();
    expect(store.hint('toString')).toBeUndefined();
  });
});
