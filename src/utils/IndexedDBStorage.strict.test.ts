import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDBStorage } from './IndexedDBStorage';

/** The fake keeps request success distinct from the transaction committing. */
function fixture() {
  const request = { result: undefined as unknown };
  const transaction = {
    error: null as Error | null,
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    objectStore: () => ({ put: vi.fn(() => request), get: vi.fn(() => request) }),
  };
  const storage = new IndexedDBStorage();
  vi.stubGlobal('indexedDB', {});
  Object.assign(storage, { db: { transaction: () => transaction } });
  return { storage, transaction, request };
}

afterEach(() => vi.unstubAllGlobals());

describe('strict IndexedDB records', () => {
  it('rejects an unavailable storage backend', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const storage = new IndexedDBStorage();
    await expect(storage.getItemStrict('policy')).rejects.toThrow();
    await expect(storage.setItemStrict('policy', '{}')).rejects.toThrow();
  });

  it('a successful put is not success until its transaction commits', async () => {
    const { storage, transaction } = fixture();
    let committed = false;
    const pending = storage.setItemStrict('policy', '{}').then(() => { committed = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(committed).toBe(false);
    transaction.oncomplete?.();
    await pending;
    expect(committed).toBe(true);
  });

  it('a late transaction abort fails without deleting the prior record', async () => {
    const { storage, transaction } = fixture();
    const remove = vi.spyOn(storage, 'removeItem');
    const pending = storage.setItemStrict('policy', '{}');
    const rejection = expect(pending).rejects.toThrow('quota');
    await Promise.resolve();
    await Promise.resolve();
    transaction.error = new Error('quota');
    transaction.onabort?.();
    await rejection;
    expect(remove).not.toHaveBeenCalled();
  });

  it('only an actually absent key reads as null', async () => {
    for (const result of [undefined, 'saved']) {
      const { storage, transaction, request } = fixture();
      request.result = result;
      const pending = storage.getItemStrict('policy');
      await Promise.resolve();
      await Promise.resolve();
      transaction.oncomplete?.();
      expect(await pending).toBe(result ?? null);
    }
  });
});

/** An open() that never fires either callback, the way a wedged IDB behaves. */
function stalledOpen() {
  const opens: { onsuccess: (() => void) | null; onerror: (() => void) | null;
    onupgradeneeded: ((event: unknown) => void) | null; result: unknown;
    error: Error | null }[] = [];
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = { onsuccess: null, onerror: null, onupgradeneeded: null,
        result: undefined as unknown, error: null };
      opens.push(request);
      return request;
    },
  });
  return opens;
}

describe('a stalled IndexedDB open', () => {
  it('gives up instead of hanging every later read and write', async () => {
    stalledOpen();
    const storage = new IndexedDBStorage(20);

    await expect(storage.getItemStrict('policy')).rejects.toThrow();
    await expect(storage.setItemStrict('policy', 'value')).rejects.toThrow();
  });

  it('starts a new open on the next attempt rather than reusing the wedged one', async () => {
    const opens = stalledOpen();
    const storage = new IndexedDBStorage(20);

    await expect(storage.getItemStrict('policy')).rejects.toThrow();
    await expect(storage.getItemStrict('policy')).rejects.toThrow();

    // Caching the stalled open is what left the device unable to read OR write
    // its policy for the life of the page, so the daemon could never repair it.
    expect(opens.length).toBe(2);
  });

  it('works once a later open succeeds', async () => {
    const opens = stalledOpen();
    const storage = new IndexedDBStorage(20);
    await expect(storage.getItemStrict('policy')).rejects.toThrow();

    const pending = storage.getItemStrict('policy');
    const latest = opens[opens.length - 1];
    latest.result = { transaction: () => {
      const request = { result: 'recovered' };
      const transaction = {
        objectStore: () => ({ get: () => request }),
        oncomplete: null as (() => void) | null,
        onerror: null, onabort: null, error: null,
      };
      queueMicrotask(() => { transaction.oncomplete?.(); });
      return transaction;
    } };
    latest.onsuccess?.();

    await expect(pending).resolves.toBe('recovered');
  });
});
