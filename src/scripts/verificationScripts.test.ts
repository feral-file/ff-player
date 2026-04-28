import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const tempRoots: string[] = [];
const shellPath = process.env.PATH ?? '';

function createTempRoot() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'ff-player-script-test-'));
  tempRoots.push(tempRoot);

  return tempRoot;
}

function writeExecutable(filePath: string, contents: string) {
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function createFakeBin(tempRoot: string, commands: Record<string, string>) {
  const binDir = path.join(tempRoot, 'bin');
  mkdirSync(binDir, { recursive: true });

  for (const [command, contents] of Object.entries(commands)) {
    writeExecutable(path.join(binDir, command), contents);
  }

  return binDir;
}

function createScriptRepo(tempRoot: string) {
  const scriptsDir = path.join(tempRoot, 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  cpSync(path.join(repoRoot, 'scripts/lint-changed.sh'), path.join(scriptsDir, 'lint-changed.sh'));
  cpSync(path.join(repoRoot, 'scripts/verify.sh'), path.join(scriptsDir, 'verify.sh'));
}

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe('verification shell scripts', () => {
  it('forwards an explicit verify base ref to the changed-file lint script', () => {
    const tempRoot = createTempRoot();
    createScriptRepo(tempRoot);
    const logPath = path.join(tempRoot, 'npm.log');
    const binDir = createFakeBin(tempRoot, {
      npm: `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${logPath}"
`,
    });

    const output = execFileSync('bash', ['scripts/verify.sh', '--base=origin/develop'], {
      cwd: tempRoot,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDir}:${shellPath}` },
    });

    expect(output).toContain('Verifying repository against origin/develop');
    expect(readFileSync(logPath, 'utf8').split('\n').filter(Boolean)).toEqual([
      'run lint -- --base=origin/develop',
      'run typecheck',
      'run test',
      'run build',
    ]);
  });

  it('skips eslint when there are no changed JavaScript or TypeScript files', () => {
    const tempRoot = createTempRoot();
    createScriptRepo(tempRoot);
    const npxLogPath = path.join(tempRoot, 'npx.log');
    const binDir = createFakeBin(tempRoot, {
      npx: `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${npxLogPath}"
`,
    });

    execFileSync('git', ['init'], { cwd: tempRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempRoot });
    execFileSync('git', ['config', 'user.name', 'Script Test'], { cwd: tempRoot });
    execFileSync('git', ['add', 'scripts'], { cwd: tempRoot });
    execFileSync('git', ['commit', '-m', 'test fixture'], { cwd: tempRoot });
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: tempRoot });

    const output = execFileSync('bash', ['scripts/lint-changed.sh', '--base=origin/main'], {
      cwd: tempRoot,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDir}:${shellPath}` },
    });

    expect(output).toContain('No changed JavaScript or TypeScript files to lint against origin/main.');
    expect(() => readFileSync(npxLogPath, 'utf8')).toThrow();
  });
});
