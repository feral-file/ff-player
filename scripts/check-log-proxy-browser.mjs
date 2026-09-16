import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const playerOrigin = 'http://127.0.0.1:8080';
const proxyOrigin = 'http://127.0.0.1:1111';
const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
].filter(Boolean);

async function executable(path) {
  try {
    const child = spawn(path, ['--version'], { stdio: 'ignore' });
    return await new Promise(resolve => {
      child.once('error', () => resolve(false));
      child.once('exit', code => resolve(code === 0));
    });
  } catch {
    return false;
  }
}

let chrome;
for (const candidate of chromeCandidates) {
  if (await executable(candidate)) {
    chrome = candidate;
    break;
  }
}
if (!chrome) {
  throw new Error(
    'Chrome or Chromium is required for the log proxy contract check'
  );
}

const record = message => ({
  timestamp: '2026-09-16T00:00:00.000Z',
  level: 'info',
  environment: 'test',
  message,
  context: { session_id: 'browser-contract' },
});

const page = `<!doctype html><script>
addEventListener('pagehide', () => {
  fetch('${proxyOrigin}/api/logs', {
    method: 'POST',
    body: JSON.stringify([${JSON.stringify(record('pagehide-keepalive'))}]),
    keepalive: true,
  });
});
fetch('${proxyOrigin}/api/logs', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify([${JSON.stringify(record('idle-flushed-json'))}]),
}).then(response => {
  if (!response.ok) throw new Error('proxy rejected idle batch');
  location.href = '/done';
});
</script>`;

const originServer = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(request.url === '/done' ? '<!doctype html>done' : page);
});

const requests = [];
let resolveComplete;
const complete = new Promise(resolve => {
  resolveComplete = resolve;
});
const proxyServer = createServer((request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', chunk => {
    body += chunk;
  });
  request.on('end', () => {
    requests.push({
      method: request.method,
      origin: request.headers.origin,
      contentType: request.headers['content-type'] ?? '',
      body,
    });
    response.setHeader('Access-Control-Allow-Origin', playerOrigin);
    response.setHeader('Access-Control-Allow-Methods', 'POST');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.statusCode = request.method === 'OPTIONS' ? 204 : 202;
    response.end();
    if (requests.filter(value => value.method === 'POST').length === 2) {
      resolveComplete();
    }
  });
});

await Promise.all([
  new Promise(resolve => originServer.listen(8080, '127.0.0.1', resolve)),
  new Promise(resolve => proxyServer.listen(1111, '127.0.0.1', resolve)),
]);
const profile = await mkdtemp(join(tmpdir(), 'ff-player-log-proxy-'));
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-background-networking',
    `--user-data-dir=${profile}`,
    `${playerOrigin}/`,
  ],
  { stdio: 'ignore' }
);
const browserExit = new Promise(resolve => browser.once('exit', resolve));
let contractTimeout;

try {
  await Promise.race([
    complete,
    new Promise((_, reject) => {
      contractTimeout = setTimeout(
        () => reject(new Error('browser log proxy contract timed out')),
        15_000
      );
    }),
  ]);

  const preflights = requests.filter(value => value.method === 'OPTIONS');
  const posts = requests.filter(value => value.method === 'POST');
  if (preflights.length !== 1 || posts.length !== 2) {
    throw new Error(
      `expected one preflight and two posts, got ${JSON.stringify(requests)}`
    );
  }
  if (requests.some(value => value.origin !== playerOrigin)) {
    throw new Error(
      `browser sent an unexpected Origin: ${JSON.stringify(requests)}`
    );
  }
  const jsonPost = posts.find(value =>
    value.body.includes('idle-flushed-json')
  );
  const keepalivePost = posts.find(value =>
    value.body.includes('pagehide-keepalive')
  );
  if (!jsonPost?.contentType.startsWith('application/json')) {
    throw new Error(
      `idle upload did not use JSON: ${JSON.stringify(jsonPost)}`
    );
  }
  if (!keepalivePost?.contentType.startsWith('text/plain')) {
    throw new Error(
      `pagehide upload was not CORS-safelisted: ${JSON.stringify(keepalivePost)}`
    );
  }
  console.log('Browser log proxy contract passed');
} finally {
  clearTimeout(contractTimeout);
  browser.kill('SIGTERM');
  await Promise.race([
    browserExit,
    new Promise(resolve => setTimeout(resolve, 2_000)),
  ]);
  if (browser.exitCode === null) {
    browser.kill('SIGKILL');
    await browserExit;
  }
  await Promise.all([
    new Promise(resolve => originServer.close(resolve)),
    new Promise(resolve => proxyServer.close(resolve)),
  ]);
  await rm(profile, { recursive: true, force: true });
}
