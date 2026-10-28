import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORK_ORIGIN_MESSAGE,
  forgetWorkOrigins,
  isWorkOriginURL,
  resetWorkOriginServerForTests,
  resolveWorkOrigin,
  subscribeWorkOrigins,
  usesWorkOrigin,
} from './workOrigin';

const HTML = '<!doctype html><title>Pressure — Study</title><p>ok</p>';
const SOURCE = `data:text/html;base64,${Buffer.from(HTML).toString('base64')}`;

const labelOf = (body: string) =>
  createHash('sha256').update(body).digest('hex').slice(0, 32);

const loopback = { hostname: '127.0.0.1', port: '8080', protocol: 'http:' };

/** Resolves `source`, waiting out the probe and the label hash. */
async function resolved(source: string) {
  await vi.waitFor(() => {
    expect(resolveWorkOrigin(source).kind).not.toBe('pending');
  });
  return resolveWorkOrigin(source);
}

describe('resolveWorkOrigin', () => {
  beforeEach(() => {
    vi.stubGlobal('location', loopback);
  });
  afterEach(() => {
    forgetWorkOrigins([]);
    resetWorkOriginServerForTests();
    vi.unstubAllGlobals();
  });

  it('puts an HTML data: work on its content-addressed origin when the works server answers', async () => {
    const probe = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal('fetch', probe);
    let ready = 0;
    const unsubscribe = subscribeWorkOrigins(() => {
      ready += 1;
    });
    expect(resolveWorkOrigin(SOURCE)).toEqual({ kind: 'pending' });
    expect(probe).toHaveBeenCalledWith(
      'http://ffos-probe.localhost:8081/',
      expect.objectContaining({ mode: 'no-cors' })
    );
    await vi.waitFor(() => {
      expect(ready).toBeGreaterThanOrEqual(1);
    });
    await resolved(SOURCE);
    unsubscribe();
    const url = `http://${labelOf(SOURCE)}.localhost:8081/`;
    expect(resolveWorkOrigin(`${SOURCE}#seed`)).toEqual({
      kind: 'ready',
      url,
    });
    expect(isWorkOriginURL(url)).toBe(true);
    expect(usesWorkOrigin(SOURCE)).toBe(true);
  });

  it('falls back when the OS has no works server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('connection refused')))
    );
    expect((await resolved(SOURCE)).kind).toBe('unavailable');
    expect(usesWorkOrigin(SOURCE)).toBe(false);
  });

  it('leaves non-HTML data: sources and web sources on the old paths', () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(resolveWorkOrigin('data:image/svg+xml,<svg/>').kind).toBe(
      'unavailable'
    );
    expect(resolveWorkOrigin('https://example.com/').kind).toBe(
      'unavailable'
    );
  });

  it('stays off when the player is not on loopback', () => {
    vi.stubGlobal('location', {
      hostname: 'player.example.com',
      port: '',
      protocol: 'https:',
    });
    vi.stubGlobal('fetch', vi.fn());
    expect(resolveWorkOrigin(SOURCE).kind).toBe('unavailable');
    expect(usesWorkOrigin(SOURCE)).toBe(false);
  });

  it('forgets labels no slot shows', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null))));
    await resolved(SOURCE);
    forgetWorkOrigins([]);
    expect(resolveWorkOrigin(SOURCE).kind).toBe('pending');
  });

  it('recognizes only work-origin frame URLs', () => {
    expect(isWorkOriginURL('http://abc.localhost:8081/')).toBe(true);
    expect(isWorkOriginURL('http://abc.localhost:8080/')).toBe(false);
    expect(isWorkOriginURL('https://abc.localhost:8081/')).toBe(false);
    expect(isWorkOriginURL('blob:http://127.0.0.1:8080/x')).toBe(false);
    expect(isWorkOriginURL('not a url')).toBe(false);
  });
});

describe('resolveWorkOrigin probe lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('location', loopback);
  });
  afterEach(() => {
    forgetWorkOrigins([]);
    resetWorkOriginServerForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('notifies a subscriber that arrived while another mount\'s probe was in flight', async () => {
    let settle: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(resolve => {
            settle = resolve;
          })
      )
    );
    const first = subscribeWorkOrigins(() => undefined);
    expect(resolveWorkOrigin(SOURCE).kind).toBe('pending');
    first();
    let heard = 0;
    const second = subscribeWorkOrigins(() => {
      heard += 1;
    });
    settle(new Response(null));
    await vi.waitFor(() => {
      expect(heard).toBeGreaterThanOrEqual(1);
    });
    second();
  });

  it('re-asks after a minute, so a works server that died sends later works to the blob path', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const probe = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal('fetch', probe);
    expect((await resolved(SOURCE)).kind).toBe('ready');
    probe.mockImplementation(() =>
      Promise.reject(new TypeError('connection refused'))
    );
    now.mockReturnValue(1_000_000 + 30_000);
    expect(resolveWorkOrigin(SOURCE).kind).toBe('ready');
    now.mockReturnValue(1_000_000 + 61_000);
    expect(resolveWorkOrigin(SOURCE).kind).toBe('pending');
    expect((await resolved(SOURCE)).kind).toBe('unavailable');
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('labels a padded source by its trimmed form, the string it sends', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null))));
    const padded = 'data:text/html,<p>ok</p>\n';
    expect(await resolved(padded)).toEqual({
      kind: 'ready',
      url: `http://${labelOf(padded.trim())}.localhost:8081/`,
    });
  });
});

/**
 * Loads public/data-document/index.html's script into a VM context standing
 * in for the shell's window on `hostname`, and exposes what it did.
 */
function loadShell(hostname: string) {
  const html = readFileSync(
    path.resolve(__dirname, '../../public/data-document/index.html'),
    'utf8'
  );
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
  const toParent: unknown[] = [];
  const listeners: Partial<Record<string, (event: unknown) => void>> = {};
  const navigated: string[] = [];
  const parent = {
    postMessage: (message: unknown) => {
      toParent.push(message);
    },
  };
  vm.runInContext(
    script,
    vm.createContext({
      parent,
      location: {
        hostname,
        replace: (url: string) => {
          navigated.push(url);
        },
      },
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listener;
      },
      document: { readyState: 'complete' },
      setTimeout,
      crypto: globalThis.crypto,
      TextEncoder,
      Uint8Array,
      Array,
      URL,
      fetch,
      console: { error: () => undefined },
    })
  );
  const send = async (source: unknown, from: unknown = parent) => {
    listeners.message?.({
      source: from,
      data: { type: WORK_ORIGIN_MESSAGE.open, source },
    });
    await new Promise(resolve => setTimeout(resolve, 50));
  };
  return { toParent, navigated, send };
}

describe('public/data-document/index.html', () => {
  const host = `${labelOf(SOURCE)}.localhost`;

  it('asks for the work, announces the navigation, then opens the exact bytes with the fragment', async () => {
    const shell = loadShell(host);
    expect(shell.toParent).toEqual([{ type: WORK_ORIGIN_MESSAGE.ready }]);
    await shell.send(`${SOURCE}#seed42`);
    expect(shell.toParent).toEqual([
      { type: WORK_ORIGIN_MESSAGE.ready },
      { type: WORK_ORIGIN_MESSAGE.navigating },
    ]);
    expect(shell.navigated).toHaveLength(1);
    expect(shell.navigated[0]).toMatch(/^blob:.*#seed42$/);
    const blobURL = shell.navigated[0]?.split('#')[0] ?? '';
    const blob = await (await fetch(blobURL)).blob();
    expect(blob.type).toBe('text/html');
    expect(await blob.text()).toBe(HTML);
  });

  it('refuses bytes that do not match its origin', async () => {
    const shell = loadShell(host);
    await shell.send(`data:text/html,${encodeURIComponent('<p>other work</p>')}`);
    expect(shell.navigated).toEqual([]);
    expect(shell.toParent.at(-1)).toEqual({ type: WORK_ORIGIN_MESSAGE.error });
  });

  it('refuses non-HTML data: URLs even when the label matches', async () => {
    const svg = 'data:image/svg+xml,<svg/>';
    const shell = loadShell(`${labelOf(svg)}.localhost`);
    await shell.send(svg);
    expect(shell.navigated).toEqual([]);
    expect(shell.toParent.at(-1)).toEqual({ type: WORK_ORIGIN_MESSAGE.error });
  });

  it('ignores messages that are not from its parent, and opens only once', async () => {
    const shell = loadShell(host);
    await shell.send(SOURCE, {});
    expect(shell.navigated).toEqual([]);
    await shell.send(SOURCE);
    await shell.send(SOURCE);
    expect(shell.navigated).toHaveLength(1);
  });

  it('accepts the trimmed source the player hashes and sends', async () => {
    const padded = 'data:text/html,<p>ok</p>\n';
    const shell = loadShell(`${labelOf(padded.trim())}.localhost`);
    await shell.send(padded.trim());
    expect(shell.navigated).toHaveLength(1);
  });
});
