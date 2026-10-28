import { afterEach, describe, expect, it } from 'vitest';
import {
  artworkIframeSandbox,
  blobFromDataURL,
  dataDocumentURL,
  releaseDataDocumentURLs,
} from './dataDocument';

const HTML = '<!doctype html><title>Pressure — Study</title><p>ok</p>';
const base64HTML = `data:text/html;base64,${Buffer.from(HTML).toString('base64')}`;

describe('blobFromDataURL', () => {
  it('decodes a base64 HTML source byte for byte, keeping the media type', async () => {
    const blob = blobFromDataURL(base64HTML);
    expect(blob?.type).toBe('text/html');
    expect(await blob?.text()).toBe(HTML);
  });

  it('percent-decodes a plain source and keeps a stray % literal', async () => {
    const blob = blobFromDataURL('data:text/html;charset=utf-8,%3Cp%3E100%%3C/p%3E');
    expect(blob?.type).toBe('text/html;charset=utf-8');
    expect(await blob?.text()).toBe('<p>100%</p>');
  });

  it('defaults an omitted media type to text/plain', () => {
    expect(blobFromDataURL('data:,hello')?.type).toBe(
      'text/plain;charset=us-ascii'
    );
  });

  it('returns null for invalid base64 or a non-data source', () => {
    expect(blobFromDataURL('data:text/html;base64,@@@')).toBeNull();
    expect(blobFromDataURL('https://example.com/a.html')).toBeNull();
  });
});

describe('dataDocumentURL', () => {
  afterEach(() => {
    releaseDataDocumentURLs([]);
  });

  it('serves a data source as one cached blob URL with an isolated sandbox', () => {
    const url = dataDocumentURL(base64HTML);
    expect(url.startsWith('blob:')).toBe(true);
    expect(dataDocumentURL(base64HTML)).toBe(url);
    expect(artworkIframeSandbox(url)).toBe('allow-scripts');
  });

  it('leaves web sources and undecodable data sources unchanged', () => {
    const web = 'https://example.com/work/index.html';
    const broken = 'data:text/html;base64,@@@';
    expect(dataDocumentURL(web)).toBe(web);
    expect(dataDocumentURL(broken)).toBe(broken);
    expect(artworkIframeSandbox(web)).toBe('allow-same-origin allow-scripts');
    expect(artworkIframeSandbox(broken)).toBe('allow-same-origin allow-scripts');
  });

  it('revokes only sources no slot still shows', () => {
    const other = `data:text/html;base64,${Buffer.from('<p>2</p>').toString('base64')}`;
    const kept = dataDocumentURL(base64HTML);
    const dropped = dataDocumentURL(other);
    releaseDataDocumentURLs([base64HTML]);
    expect(dataDocumentURL(base64HTML)).toBe(kept);
    expect(artworkIframeSandbox(dropped)).toBe(
      'allow-same-origin allow-scripts'
    );
    expect(dataDocumentURL(other)).not.toBe(dropped);
  });
});
