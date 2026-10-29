import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pause } from './fixtures.mjs';

/** Poll actual browser state; failures identify the contract that did not settle. */
export async function until(check, label, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) {
      return;
    }
    await pause(75);
  }
  throw new Error(`Timeout: ${label}`);
}

const item = (id, source, display = {}) => ({
  id,
  source,
  title: id,
  duration: 120,
  license: 'open',
  contentRating: 'general',
  display,
});

/** Public CDP commands and DOM observations only; no player internals are injected. */
export class PlayerProbe {
  evidence = [];
  constructor(browser, artifacts) {
    this.browser = browser;
    this.artifacts = artifacts;
  }
  async command(command, request = {}) {
    const payload = JSON.stringify({ command, request });
    return JSON.parse(
      await this.browser.evaluate(`window.handleCDPRequest(${payload})`)
    ).message;
  }
  status() {
    return this.command('checkStatus');
  }
  history() {
    return this.command('getRecentlyPlayed');
  }
  ready() {
    return until(
      async () => (await this.status()).renderStatus === 2,
      'artwork ready'
    );
  }
  async cast(items) {
    const reply = await this.command('displayPlaylist', {
      intent: { action: 'now_display' },
      dp1_call: { dpVersion: '1.1.0', id: 'smoke', title: 'Smoke', items },
    });
    assert.equal(reply.ok, true, JSON.stringify(reply));
  }
  nodes() {
    return this.browser
      .evaluate(`Array.from(document.querySelectorAll('img,video,iframe')).map(el=>({
      tag:el.tagName,src:el.src,fit:getComputedStyle(el).objectFit,
      rect:el.getBoundingClientRect().toJSON(),paused:el.paused,readyState:el.readyState}))`);
  }
  record(name, detail) {
    this.evidence.push({ name, detail });
    console.log(`PASS ${name}`);
  }
  async screenshot(name) {
    const { data } = await this.browser.call('Page.captureScreenshot');
    await fs.writeFile(
      path.join(this.artifacts, `${name}.png`),
      Buffer.from(data, 'base64')
    );
  }
}

/** Hydration and policy activation must finish before accepting test casts. */
export async function initializePlayer(player) {
  await player.browser.call('Page.navigate', {
    url: 'http://127.0.0.1:8080/playlist',
  });
  await until(
    () =>
      player.browser.evaluate(`typeof window.handleCDPRequest === 'function'`),
    'CDP handler'
  );
  await until(
    () =>
      player.browser.evaluate(
        `JSON.parse(window.__ffosPlayerStatus()).bootHydration !== 'pending'`
      ),
    'boot hydration'
  );
  const reply = await player.command('setContentPolicy', {
    contentPolicy: {
      version: 1,
      showMatureContent: false,
      strictPersonal: false,
      blockUnratedCurated: false,
    },
  });
  assert.equal(reply.ok, true);
  player.record(
    'boot',
    await player.browser.evaluate('JSON.parse(window.__ffosPlayerStatus())')
  );
}

/** Both overlap layers retain the outgoing matte until composition commits. */
export async function checkImages(player) {
  await player.cast([
    item('image-a', 'http://127.0.0.1:8080/a.png', {
      margin: '10%',
      background: '#112233',
      scaling: 'fit',
    }),
    item('image-b', 'http://127.0.0.1:8080/b.png', {
      margin: '5%',
      background: '#445566',
      scaling: 'fit',
    }),
  ]);
  await player.ready();
  await pause(300);
  const status = await player.status();
  const image = (await player.nodes()).find(node => node.tag === 'IMG');
  assert.ok(image);
  assert.equal(image.rect.width, 1024);
  assert.equal(image.rect.height, 576);
  assert.equal(image.fit, 'contain');
  player.record('image-fit-matte', { status, image });
  for (const [scaling, fit] of [
    ['fill', 'cover'],
    ['fit', 'contain'],
  ]) {
    const reply = await player.command('updateDisplaySettings', {
      isSaved: false,
      showingKey: status.deviceSettings.showingKey,
      scaling,
    });
    assert.equal(reply.ok, true);
    await until(
      async () =>
        (await player.nodes()).find(node => node.tag === 'IMG')?.fit === fit,
      scaling
    );
    await player.screenshot(`image-${scaling}`);
  }
  await player.command('moveToArtwork', { index: 1 });
  await until(
    async () =>
      (await player.nodes()).filter(node => node.tag === 'IMG').length === 2,
    'overlap layers'
  );
  const start = await player.status();
  const layers = await player.nodes();
  assert.equal(start.deviceSettings.background, '#112233');
  assert.equal(layers[0].rect.width, layers[1].rect.width);
  player.record('overlap-start', { status: start, layers });
  await player.ready();
  await pause(250);
  const end = await player.status();
  assert.equal(end.deviceSettings.background, '#445566');
  const history = await player.history();
  assert.equal(history.activeOccurrenceKnown, true);
  assert.equal(history.records.filter(record => record.isActive).length, 1);
  assert.equal(
    history.records.find(record => record.isActive).itemId,
    'image-b'
  );
  player.record('overlap-end', { status: end, history });
}

/** A real decoded video plays inside the same inset as still images. */
export async function checkVideo(player) {
  await player.cast([
    item('video', 'http://127.0.0.1:8080/video.mp4', {
      margin: '10%',
      background: '#eeeeee',
      scaling: 'fit',
    }),
  ]);
  await player.ready();
  await pause(200);
  const video = (await player.nodes()).find(node => node.tag === 'VIDEO');
  assert.ok(video);
  assert.equal(video.paused, false);
  assert.equal(video.rect.width, 1024);
  player.record('video', { status: await player.status(), video });
}

/** Shell navigation cannot settle readiness before its delayed child loads. */
export async function checkIsolatedHTML(player, fixtures) {
  const html =
    '<!doctype html><meta charset="utf-8"><body style="margin:0;color:white;font:32px sans-serif"><script src="http://127.0.0.1:8080/slow.js"></script></body>';
  const source =
    'data:text/html;base64,' + Buffer.from(html).toString('base64');
  await player.cast([
    item('html', source, { margin: '10%', background: '#aabbcc' }),
  ]);
  await until(() => fixtures.delayedScriptStarted, 'child script starts');
  assert.notEqual((await player.status()).renderStatus, 2);
  player.record('html-child-pending', {
    status: await player.status(),
    nodes: await player.nodes(),
  });
  await player.ready();
  await until(() => fixtures.reports.length > 0, 'isolation report');
  const report = fixtures.reports[0];
  assert.equal(report.secure, true);
  assert.equal(report.storage, 'ok');
  assert.equal(report.parentBlocked, true);
  assert.match(report.origin, /http:\/\/[0-9a-f]{32}\.localhost:8081/);
  player.record('html-ready', {
    isolation: report,
    status: await player.status(),
  });
  // Ready precedes the sequential incoming fade-in; capture the settled pixels.
  await pause(750);
  await player.screenshot('html');
}

/** Stopping retires history immediately; waking creates a new successful showing. */
export async function checkSleepWake(player) {
  await player.command('setSleepMode', { sleepMode: true });
  await until(
    () => player.browser.evaluate(`location.pathname === '/sleep'`),
    'sleep route'
  );
  const asleep = await player.history();
  assert.equal(asleep.activeOccurrenceKnown, true);
  assert.equal(asleep.records.filter(record => record.isActive).length, 0);
  player.record('sleep-history', asleep);
  await player.command('setSleepMode', { sleepMode: false });
  await player.ready();
  await until(
    async () =>
      (await player.history()).records.some(record => record.isActive),
    'wake history'
  );
  player.record('wake', {
    status: await player.status(),
    history: await player.history(),
  });
  assert.deepEqual(
    player.browser.exceptions,
    [],
    'Unhandled browser exceptions'
  );
}
