import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Chromium } from './browser-smoke/chromium.mjs';
import { SmokeFixtures } from './browser-smoke/fixtures.mjs';
import {
  PlayerProbe,
  initializePlayer,
  checkImages,
  checkVideo,
  checkIsolatedHTML,
  checkSleepWake,
} from './browser-smoke/scenarios.mjs';

const option = (name, fallback) =>
  process.argv
    .find(arg => arg.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? fallback;

/** Exercise a built player with disposable storage and retain evidence on failure. */
async function main() {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ff-player-smoke-')
  );
  const artifacts = path.resolve(
    option('artifacts', path.join(temporary, 'evidence'))
  );
  await fs.mkdir(artifacts, { recursive: true });
  const fixtures = new SmokeFixtures(
    path.resolve(option('bundle', 'out')),
    temporary
  );
  let browser;
  let player;
  try {
    await fixtures.start();
    browser = new Chromium(
      option('chromium', 'chromium'),
      path.join(temporary, 'profile'),
      process.argv.includes('--no-sandbox')
    );
    await browser.initialize();
    player = new PlayerProbe(browser, artifacts);
    await initializePlayer(player);
    await checkImages(player);
    await checkVideo(player);
    await checkIsolatedHTML(player, fixtures);
    await checkSleepWake(player);
    console.log(`Browser smoke passed. Evidence: ${artifacts}`);
  } catch (error) {
    process.exitCode = 1;
    console.error(error);
    if (player) {
      try {
        await player.screenshot('failure');
      } catch {
        /* Browser may have exited. */
      }
    }
  } finally {
    await fs.writeFile(
      path.join(artifacts, 'evidence.json'),
      JSON.stringify(player?.evidence ?? [], null, 2)
    );
    await fs.writeFile(
      path.join(artifacts, 'chromium.log'),
      browser?.diagnostics ?? ''
    );
    await browser?.close();
    await fixtures.close();
    // Evidence is retained; only disposable browser storage and generated media go.
    await fs.rm(path.join(temporary, 'profile'), {
      recursive: true,
      force: true,
    });
    for (const file of ['a.png', 'b.png', 'video.mp4']) {
      await fs.rm(path.join(temporary, file), { force: true });
    }
  }
}

await main();
