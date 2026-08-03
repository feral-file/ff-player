import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Fixture-based coverage for scripts/check-copy.mjs, so AST/scope changes
 * cannot silently weaken the gate (banned copy passing) or create false
 * build failures (non-UI literals being flagged). Runs the real script as a
 * child process against a throwaway fixture directory — the same way CI
 * invokes it via `npm run test`.
 */

function runChecker(fixtureDir: string) {
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), 'scripts', 'check-copy.mjs'), fixtureDir],
    { encoding: 'utf8' }
  );
  return { status: result.status, out: result.stdout + result.stderr };
}

const fixtureDirs: string[] = [];

afterAll(() => {
  for (const dir of fixtureDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function withFixture(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-copy-'));
  fixtureDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

describe('check-copy script', () => {
  it('flags banned terms in JSX text and in state-setter strings', () => {
    const dir = withFixture({
      'Bad.tsx': `
export function Bad({ setMessage }: { setMessage: (s: string) => void }) {
  setMessage('Please reboot the device and check the WiFi.');
  return <p>Pair your frame with the app.</p>;
}
`,
    });
    const { status, out } = runChecker(dir);
    expect(status).toBe(1);
    expect(out).toContain('Art Computer'); // frame -> Art Computer
    expect(out).toContain('Wi-Fi'); // WiFi -> Wi-Fi
  });

  it('ignores non-UI literals outside JSX and setters', () => {
    const dir = withFixture({
      'Ok.tsx': `
function qr(ssid: string) {
  return 'WIFI:T:WPA;S:' + ssid + ';;'; // wire payload, not copy
}
const state = 'softap_qr'; // CDP contract token
export function Ok() {
  return <p>Set up your Art Computer over Wi-Fi. {qr('FF1-x')} {state}</p>;
}
`,
    });
    const { status, out } = runChecker(dir);
    expect(status).toBe(0);
    expect(out).toContain('copy OK');
  });
});
