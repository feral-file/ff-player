import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('closes after Chromium has already exited from a signal', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'smoke-signal-'));
  const executable = path.join(temporary, 'browser');
  writeFileSync(executable, '#!/bin/sh\nkill -TERM $$\n', { mode: 0o755 });
  const moduleURL = pathToFileURL(
    path.resolve('scripts/browser-smoke/chromium.mjs')
  ).href;
  const script = `
    import { once } from 'node:events';
    import { Chromium } from ${JSON.stringify(moduleURL)};
    const browser = new Chromium(${JSON.stringify(executable)}, ${JSON.stringify(temporary)});
    await once(browser.process, 'exit');
    if (browser.process.signalCode !== 'SIGTERM') { throw new Error('Expected a signal exit'); }
    await browser.close();
    console.log('closed');
  `;
  try {
    expect(
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim()
    ).toBe('closed');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
