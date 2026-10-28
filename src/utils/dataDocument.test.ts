import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dataDocumentURL,
  forgetDataDocuments,
  splitFragment,
  usesDataDocument,
} from './dataDocument';

const HTML = '<!doctype html><title>Pressure — Study</title><p>ok</p>';
const SOURCE = `data:text/html;base64,${Buffer.from(HTML).toString('base64')}`;

const labelOf = (body: string) =>
  createHash('sha256').update(body).digest('hex').slice(0, 32);

/** Resolves the URL for `source`, waiting out the async label hash. */
async function shellURLFor(source: string): Promise<string | null> {
  const first = dataDocumentURL(source, () => undefined);
  if (first !== null) {
    return first;
  }
  await vi.waitFor(() => {
    expect(dataDocumentURL(source, () => undefined)).not.toBeNull();
  });
  return dataDocumentURL(source, () => undefined);
}

/**
 * Runs public/data-document.html's script with `url` as its location and
 * returns what it navigated to (null when it refused).
 */
async function runShell(url: string): Promise<string | null> {
  const html = readFileSync(
    path.resolve(__dirname, '../../public/data-document.html'),
    'utf8'
  );
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
  const parsed = new URL(url);
  let navigated: string | null = null;
  const context = vm.createContext({
    location: {
      hash: parsed.hash,
      hostname: parsed.hostname,
      replace: (to: string) => {
        navigated = to;
      },
    },
    crypto: globalThis.crypto,
    TextEncoder,
    Uint8Array,
    Array,
    URL,
    fetch,
    decodeURIComponent,
    console: { error: () => undefined },
  });
  vm.runInContext(script, context);
  await new Promise(resolve => setTimeout(resolve, 50));
  return navigated;
}

describe('dataDocumentURL on an FF1 (loopback player)', () => {
  beforeEach(() => {
    vi.stubGlobal('location', {
      hostname: '127.0.0.1',
      port: '8080',
      protocol: 'http:',
    });
  });
  afterEach(() => {
    forgetDataDocuments([]);
    vi.unstubAllGlobals();
  });

  it('puts each data: work on its own content-addressed localhost origin', async () => {
    let ready = 0;
    expect(
      dataDocumentURL(SOURCE, () => {
        ready += 1;
      })
    ).toBeNull();
    await vi.waitFor(() => {
      expect(ready).toBe(1);
    });
    expect(dataDocumentURL(SOURCE, () => undefined)).toBe(
      `http://${labelOf(SOURCE)}.localhost:8080/data-document.html#${encodeURIComponent(SOURCE)}`
    );
    expect(usesDataDocument(SOURCE)).toBe(true);
  });

  it('labels by the bytes, not the fragment, and keeps the fragment', async () => {
    const url = await shellURLFor(`${SOURCE}#0xabc`);
    expect(url).toContain(`//${labelOf(SOURCE)}.localhost:8080/`);
    expect(url).toContain(encodeURIComponent('#0xabc'));
  });

  it('leaves web sources unchanged', () => {
    const web = 'https://example.com/work/index.html';
    expect(dataDocumentURL(web, () => undefined)).toBe(web);
    expect(usesDataDocument(web)).toBe(false);
  });

  it('forgets labels no slot shows', async () => {
    await shellURLFor(SOURCE);
    forgetDataDocuments([`${SOURCE}#kept-by-fragment`]);
    expect(dataDocumentURL(SOURCE, () => undefined)).not.toBeNull();
    forgetDataDocuments([]);
    expect(dataDocumentURL(SOURCE, () => undefined)).toBeNull();
  });
});

describe('dataDocumentURL off loopback (player deployed as a website)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps loading data: sources directly', () => {
    vi.stubGlobal('location', {
      hostname: 'player.example.com',
      port: '',
      protocol: 'https:',
    });
    expect(dataDocumentURL(SOURCE, () => undefined)).toBe(SOURCE);
    expect(usesDataDocument(SOURCE)).toBe(false);
  });
});

describe('public/data-document.html', () => {
  beforeEach(() => {
    vi.stubGlobal('location', {
      hostname: '127.0.0.1',
      port: '8080',
      protocol: 'http:',
    });
  });
  afterEach(() => {
    forgetDataDocuments([]);
    vi.unstubAllGlobals();
  });

  it('opens the exact bytes the player sent, keeping the work fragment', async () => {
    const url = await shellURLFor(`${SOURCE}#seed42`);
    const navigated = await runShell(url ?? '');
    expect(navigated).toMatch(/^blob:.*#seed42$/);
    const [blobURL] = splitFragment(navigated ?? '');
    expect(await (await fetch(blobURL)).text()).toBe(HTML);
  });

  it('refuses bytes that do not match its origin', async () => {
    const url = new URL((await shellURLFor(SOURCE)) ?? '');
    const evil = `data:text/html,${encodeURIComponent('<p>other work</p>')}`;
    url.hash = encodeURIComponent(evil);
    expect(await runShell(url.toString())).toBeNull();
  });

  it('refuses anything that is not a data: URL', async () => {
    const web = 'https://example.com/';
    expect(
      await runShell(
        `http://${labelOf(web)}.localhost:8080/data-document.html#${encodeURIComponent(web)}`
      )
    ).toBeNull();
  });
});
