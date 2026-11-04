// @vitest-environment jsdom
// jsdom: getStatus() reads `window` (location.pathname, __ffosDocStamp).
import { CastCommand } from '@/models';
import { DP1Action, type DP1Call, type DP1Item } from '@/models/dp1.model';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canvasService } from './CanvasService';
import { prepareContentPolicy } from './contentPolicy.testkit';

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (id: string, items: DP1Item[]): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  items,
});

const hintFor = (id: string) => ({
  [`https://example.com/${id}.jpg`]: {
    category: 'source_missing',
    reason: 'http_status',
  },
});

/**
 *
 */
/** A Now Display push, with the hint map only when the test supplies one. */
function cast(items: DP1Item[], mediaHealth?: unknown) {
  return canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: playlist('pl', items),
      ...(mediaHealth === undefined ? {} : { mediaHealth }),
    },
  });
}

/**
 *
 */
/** A refresh push of the cast on the wall, with the hint map only when supplied. */
function refresh(items: DP1Item[], mediaHealth?: unknown) {
  return canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      refresh: true,
      dp1_call: playlist('pl', items),
      ...(mediaHealth === undefined ? {} : { mediaHealth }),
    },
  });
}

describe('CanvasService mediaHealth contract v1', () => {
  beforeEach(prepareContentPolicy);

  afterEach(() => {
    canvasService.setCastInfo(null, false);
    canvasService.disconnect();
  });

  it('installs the hints of an accepted cast and keeps hinted items in status', () => {
    expect(cast([item('a'), item('b')], hintFor('b'))?.ok).toBe(true);
    expect(canvasService.getMediaHealthHint(item('b').source)).toEqual({
      category: 'source_missing',
      reason: 'http_status',
    });
    expect(canvasService.getMediaHealthHint(item('a').source)).toBeUndefined();
    expect(canvasService.getStatus().items?.map(i => i.id)).toEqual(['a', 'b']);
  });

  it('replaces the map on every push, and an absent field on a refresh means no hints', () => {
    cast([item('a'), item('b')], hintFor('b'));
    expect(refresh([item('a'), item('b'), item('c')], hintFor('c'))?.ok).toBe(
      true
    );
    expect(canvasService.getMediaHealthHint(item('b').source)).toBeUndefined();
    expect(canvasService.getMediaHealthHint(item('c').source)).toBeDefined();

    refresh([item('a'), item('b'), item('c'), item('d')]);
    expect(canvasService.getMediaHealthHint(item('c').source)).toBeUndefined();
  });

  it('leaves the live hints alone when the push is rejected', () => {
    cast([item('a'), item('b')], hintFor('b'));
    const rejected = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: { action: DP1Action.NowDisplay },
        dp1_call: playlist('empty', []),
        mediaHealth: hintFor('a'),
      },
    });
    expect(rejected?.ok).toBe(false);
    expect(canvasService.getMediaHealthHint(item('b').source)).toBeDefined();
    expect(canvasService.getMediaHealthHint(item('a').source)).toBeUndefined();
  });

  it('never rejects a cast over a malformed map', () => {
    expect(cast([item('a')], 'not a map')?.ok).toBe(true);
    expect(canvasService.getMediaHealthHint(item('a').source)).toBeUndefined();
  });

  it('clears the hints on disconnect and on a player-local scheduled cast', () => {
    cast([item('a'), item('b')], hintFor('b'));
    canvasService.executeScheduledDP1Task(playlist('scheduled', [item('b')]));
    expect(canvasService.getMediaHealthHint(item('b').source)).toBeUndefined();

    cast([item('a'), item('b')], hintFor('b'));
    canvasService.disconnect();
    expect(canvasService.getMediaHealthHint(item('b').source)).toBeUndefined();
  });

});

describe('CanvasService mediaHealth outcome ring', () => {
  beforeEach(prepareContentPolicy);

  afterEach(() => {
    canvasService.setCastInfo(null, false);
    canvasService.disconnect();
  });

  it('always reports the outcome ring and opens a cast generation per Now Display', () => {
    const before = canvasService.getStatus().outcomes;
    expect(before).toBeDefined();
    expect(before?.entries).toEqual([]);
    const castSeq = before?.castSeq ?? 0;

    cast([item('a')]);
    expect(canvasService.getStatus().outcomes?.castSeq).toBe(castSeq + 1);
    // A refresh amends the list on the wall; it is not a new cast.
    refresh([item('a'), item('b')]);
    expect(canvasService.getStatus().outcomes?.castSeq).toBe(castSeq + 1);
    cast([item('b')]);
    expect(canvasService.getStatus().outcomes?.castSeq).toBe(castSeq + 2);
  });

  it('appends recorded outcomes with page-monotonic sequence numbers', () => {
    cast([item('a')]);
    canvasService.recordPlaybackOutcome({
      kind: 'skip',
      stage: 'hint',
      source: item('a').source,
      attempt: 0,
      elapsedMs: 0,
    });
    const outcomes = canvasService.getStatus().outcomes;
    const last = outcomes?.entries.at(-1);
    expect(last).toMatchObject({
      kind: 'skip',
      stage: 'hint',
      source: item('a').source,
    });
    expect(typeof last?.seq).toBe('number');
    expect(typeof last?.at).toBe('string');
  });
});
