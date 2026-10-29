import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';

export const pause = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

/** Generate a non-square PNG so Fit/Fill assertions exercise different geometry. */
function image(colors) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(600);
  header.writeUInt32BE(300, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc((600 * 3 + 1) * 300);
  for (let y = 0; y < 300; y++) {
    for (let x = 0; x < 600; x++) {
      pixels.set(colors[Math.floor(x / 300)], y * 1801 + 1 + x * 3);
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function childScript() {
  return `let parentBlocked = false;
    try { void top.document.body; } catch { parentBlocked = true; }
    localStorage.setItem('smoke', 'ok');
    const report = {secure:isSecureContext, storage:localStorage.getItem('smoke'),
      parentBlocked, gpu:!!navigator.gpu, origin:location.origin};
    fetch('http://127.0.0.1:8080/report?data='+encodeURIComponent(JSON.stringify(report)));
    document.body.style.background = '#086a43';
    document.body.textContent = 'Isolated artwork loaded';`;
}

/** Serve the real export and its work-origin shell; ports match the FF1 contract. */
export class SmokeFixtures {
  reports = [];
  delayedScriptStarted = false;
  servers = [];

  constructor(bundle, temporary) {
    this.bundle = bundle;
    this.temporary = temporary;
  }

  async start() {
    await fs.access(path.join(this.bundle, 'playlist.html'));
    await fs.writeFile(
      path.join(this.temporary, 'a.png'),
      image([
        [255, 160, 80],
        [50, 100, 200],
      ])
    );
    await fs.writeFile(
      path.join(this.temporary, 'b.png'),
      image([
        [80, 230, 160],
        [180, 50, 100],
      ])
    );
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=600x300:rate=15',
      '-t',
      '3',
      '-pix_fmt',
      'yuv420p',
      '-y',
      path.join(this.temporary, 'video.mp4'),
    ]);
    for (const port of [8080, 8081]) {
      const server = http.createServer((request, response) => {
        void this.serve(request, response, port === 8081);
      });
      this.servers.push(server);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
    }
  }

  async serve(request, response, works) {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('Access-Control-Allow-Origin', '*');
    try {
      if (url.pathname === '/report') {
        this.reports.push(JSON.parse(url.searchParams.get('data')));
        response.end('ok');
        return;
      }
      if (url.pathname === '/slow.js') {
        this.delayedScriptStarted = true;
        await pause(1600);
        response.setHeader('Content-Type', mime['.js']);
        response.end(childScript());
        return;
      }
      let file;
      if (['/a.png', '/b.png', '/video.mp4'].includes(url.pathname)) {
        file = path.join(this.temporary, url.pathname);
      } else if (works) {
        file = path.join(this.bundle, 'data-document/index.html');
      } else {
        const resource = url.pathname === '/' ? '/index.html' : url.pathname;
        file = path.join(
          this.bundle,
          resource + (path.extname(resource) ? '' : '.html')
        );
      }
      const bytes = await fs.readFile(file);
      response.setHeader(
        'Content-Type',
        mime[path.extname(file)] ?? 'application/octet-stream'
      );
      response.setHeader('Cache-Control', 'no-store');
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end('missing');
    }
  }

  async close() {
    await Promise.all(
      this.servers.map(
        server =>
          new Promise(resolve => {
            server.closeAllConnections();
            server.close(resolve);
          })
      )
    );
  }
}
