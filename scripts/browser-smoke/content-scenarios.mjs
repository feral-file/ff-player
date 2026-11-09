import assert from 'node:assert/strict';
import { pause } from './fixtures.mjs';
import { directorySource, textDrawing } from './content-fixtures.mjs';

/** Exercise native text contrast and seed-preserving navigation in the built player. */
export async function checkArtworkContent(player) {
  const work = (id, source) => ({
    id,
    source,
    title: id,
    duration: 120,
    license: 'open',
    contentRating: 'general',
    display: { background: '#000000' },
  });
  await player.cast([work('plain-text', 'http://127.0.0.1:8080/drawing.txt')]);
  await player.ready();
  await pause(750);
  const text = await player.browser.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    const pre = frame.contentDocument.querySelector('pre');
    return { canvas: getComputedStyle(frame).backgroundColor,
      color: getComputedStyle(pre).color, content: pre.textContent };
  })()`);
  assert.equal(text.canvas, 'rgb(255, 255, 255)');
  assert.equal(text.color, 'rgb(0, 0, 0)');
  assert.equal(text.content, textDrawing);
  player.record('plain-text-contrast', text);
  await player.screenshot('plain-text-contrast');

  await player.cast([
    work('html-transparency', 'http://127.0.0.1:8080/transparent.html'),
  ]);
  await player.ready();
  await pause(750);
  const htmlCanvas = await player.browser.evaluate(
    `getComputedStyle(document.querySelector('iframe')).backgroundColor`
  );
  assert.equal(htmlCanvas, 'rgba(0, 0, 0, 0)');
  player.record('html-transparency-preserved', { htmlCanvas });
  await player.screenshot('html-transparency');

  await player.cast([work('directory-seed', directorySource)]);
  await player.ready();
  await pause(750);
  const directory = await player.browser.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    return { url: frame.contentWindow.location.href,
      drawn: frame.contentDocument.body.textContent,
      background: getComputedStyle(frame.contentDocument.body).backgroundColor };
  })()`);
  assert.equal(new URL(directory.url).searchParams.get('fxhash'), 'ooSeed');
  assert.equal(new URL(directory.url).hash, '#work');
  assert.equal(directory.drawn, 'Seed');
  assert.equal(directory.background, 'rgb(54, 170, 119)');
  player.record('directory-seed-preserved', directory);
  await player.screenshot('directory-seed');

  await player.cast([
    work('cached-directory', 'http://127.0.0.1:8080/ipfs/QmCached?edition=1'),
  ]);
  await player.ready();
  await pause(750);
  const cached = await player.browser.evaluate(`(() => {
    const frame = document.querySelector('iframe');
    return { source: frame.src, drawn: frame.contentDocument.body.textContent };
  })()`);
  assert.equal(new URL(cached.source).pathname, '/ipfs/QmCached');
  assert.equal(cached.drawn, 'Cached artwork');
  player.record('cached-directory-preserved', cached);
}
