import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { canvasService } from './CanvasService';
import { contentPolicyStore } from './ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';
import { RECENTLY_PLAYED_MAX_RECORD_BYTES, type RecentlyPlayedRecord } from './recentPlaybackHistory';
import DeviceManager from '@/utils/DeviceManager';
import { CastCommand } from '@/models';
import { DP1Item, DP1License } from '@/models/dp1.model';
import { RenderStatus } from '@/models/render_status.model';

const item = (id: string): DP1Item => ({
  id, source: `https://art.test/${id}`, license: DP1License.Open,
});

const history = () => canvasService.processMessage({
  command: CastCommand.getRecentlyPlayed,
  request: {},
}) as { ok: boolean; status?: string; records?: { recordId: string; isActive?: boolean }[];
  incomplete?: boolean; activeOccurrenceKnown?: boolean };

/** Lets a test resolve the queued durable write at a moment of its choosing. */
let releaseWrite: (() => void) | null = null;
/** Held from the spy itself; reading it back off DeviceManager would be an unbound method reference. */
let setRecentlyPlayed: MockInstance<(records: RecentlyPlayedRecord[]) => Promise<void>>;

beforeEach(async () => {
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockResolvedValue(undefined);
  vi.spyOn(DeviceManager, 'getRecentlyPlayed').mockResolvedValue([]);
  vi.spyOn(DeviceManager, 'getRecentlyPlayedIncomplete').mockResolvedValue(false);
  setRecentlyPlayed = vi.spyOn(DeviceManager, 'setRecentlyPlayed').mockResolvedValue(undefined);
  vi.spyOn(DeviceManager, 'setRecentlyPlayedIncomplete').mockResolvedValue(undefined);
  releaseWrite = null;
  await contentPolicyStore.initialize();
  // Settle the lazy history load so the first getRecentlyPlayed in a test is
  // an answer about history rather than the still-loading reply.
  canvasService.recordRecentlyPlayed(item('warmup'));
  await vi.waitFor(() => { expect(history().ok).toBe(true); });
  canvasService.setCastInfo(null, false);
});

afterEach(async () => {
  canvasService.setCastInfo(null, false);
  await contentPolicyStore.set(DEFAULT_CONTENT_POLICY);
  vi.restoreAllMocks();
});

describe('recently played active occurrence follows the wall', () => {
  it('reports the committed work as the active occurrence', async () => {
    canvasService.recordRecentlyPlayed(item('a'));

    await vi.waitFor(() => {
      expect(history().activeOccurrenceKnown).toBe(true);
    });
    expect(history().records?.some(record => record.isActive)).toBe(true);
  });

  it('stops claiming an active occurrence once playback is cleared', async () => {
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    canvasService.setCastInfo(null, false);

    // The record is retained — history is a timeline — but nothing is on the
    // wall, so no occurrence may be marked active.
    expect(history().activeOccurrenceKnown).toBe(false);
    expect(history().records?.some(record => record.isActive)).toBe(false);
    expect(history().records?.length).toBeGreaterThan(0);
  });

  it('does not mark a work active once a newer work has begun committing', async () => {
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });
    const firstActive = history().records?.find(record => record.isActive)?.recordId;

    canvasService.recordRecentlyPlayed(item('b'));

    // Between the new commit and its durable write the honest answer is
    // "not known yet", never the work that has already left the wall.
    expect(history().activeOccurrenceKnown).toBe(false);
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });
    expect(history().records?.find(record => record.isActive)?.recordId).not.toBe(firstActive);
  });

  it('cannot let a write that lands after a stop resurrect an active occurrence', async () => {
    const gate = new Promise<void>(resolve => { releaseWrite = resolve; });
    setRecentlyPlayed.mockImplementationOnce(async () => gate);

    canvasService.recordRecentlyPlayed(item('a'));
    canvasService.setCastInfo(null, false);
    releaseWrite?.();
    await vi.waitFor(() => {
      expect(setRecentlyPlayed).toHaveBeenCalled();
    });

    expect(history().activeOccurrenceKnown).toBe(false);
  });

  it('stops claiming an active occurrence while the device is asleep', async () => {
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    // Sleep keeps castInfo, so the stop is invisible to setCastInfo(null).
    canvasService.setSleepMode({ sleepMode: true });

    expect(history().activeOccurrenceKnown).toBe(false);
    expect(history().records?.length).toBeGreaterThan(0);
  });

  it('stops claiming an active occurrence when a render reports failed', async () => {
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    // A failed incoming slot still commits visually; only onItemPlayed is
    // withheld, so nothing else would retire the previous work's record.
    canvasService.setRenderStatus(RenderStatus.failed);

    expect(history().activeOccurrenceKnown).toBe(false);
  });

});

describe('recently played active occurrence across cast replacement', () => {
  const castOf = (items: DP1Item[], index = 0, command = CastCommand.displayPlaylist) => ({
    castCommand: command, contentContext: 'curated' as const, index,
    playlist: { dpVersion: '1.1.0', title: 'Set', items },
  });

  it('stops claiming an active occurrence when a new cast drops the shown work', async () => {
    canvasService.setCastInfo(castOf([item('a')]), false);
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    // The rendering gate cannot find 'a' in the new playlist and unmounts it,
    // while 'b' has not committed. Reporting 'a' through that window would
    // describe a blank or loading screen.
    canvasService.setCastInfo(castOf([item('b')]), false);

    expect(history().activeOccurrenceKnown).toBe(false);
  });

  it('stops claiming an active occurrence when a refresh changes the shown source', async () => {
    canvasService.setCastInfo(castOf([item('a')]), false);
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    // Same id, new source. The rendering gate matches on the pair, so it
    // cannot find what it is showing and unmounts while the replacement loads.
    canvasService.setCastInfo(
      castOf([{ ...item('a'), source: 'https://art.test/a-v2' }]), false);

    expect(history().activeOccurrenceKnown).toBe(false);
  });

  it('cannot let a pending write promote a work the new cast displaced', async () => {
    const gate = new Promise<void>(resolve => { releaseWrite = resolve; });
    setRecentlyPlayed.mockImplementationOnce(async () => gate);
    canvasService.setCastInfo(castOf([item('a')]), false);

    // The append for 'a' has not landed, so there is no record id yet — but
    // there is very much a work that this replacement displaces.
    canvasService.recordRecentlyPlayed(item('a'));
    canvasService.setCastInfo(castOf([item('b')]), false);
    releaseWrite?.();
    await vi.waitFor(() => { expect(setRecentlyPlayed).toHaveBeenCalled(); });

    expect(history().activeOccurrenceKnown).toBe(false);
  });

  it('retires the visible work when reconciliation drops it mid-handoff', async () => {
    const visible = item('visible');
    const next = { ...item('next'), contentRating: 'general' as const };
    canvasService.setCastInfo({
      castCommand: CastCommand.displayPlaylist, contentContext: 'curated',
      // The index already names the incoming work while `visible` is still
      // committed, which is why an index-derived check inspects the wrong item.
      index: 1,
      playlist: { dpVersion: '1.1.0', title: 'Set', items: [visible, next] },
    }, false);
    canvasService.recordRecentlyPlayed(visible);
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    // Tightening removes `visible` (unrated) and keeps `next` (general), so the
    // selected slot does not change and only the displayed work disappears.
    await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true });

    expect(canvasService.getCastInfo()?.playlist?.items?.map(value => value.id)).toEqual(['next']);
    expect(history().activeOccurrenceKnown).toBe(false);
  });

  it('keeps the active occurrence while advancing within the same playlist', async () => {
    const items = [item('a'), item('b')];
    canvasService.setCastInfo(castOf(items), false);
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    canvasService.setCastInfo(castOf(items, 1, CastCommand.moveToArtwork), false);

    // 'a' is genuinely still on the wall until 'b' commits, and that commit
    // retires it. Retiring here would report pending while it is displayed.
    expect(history().activeOccurrenceKnown).toBe(true);
  });
});

describe('recently played active occurrence under policy changes', () => {
  it('stops claiming an active occurrence when a policy change moves the selection', async () => {
    canvasService.setCastInfo({
      castCommand: CastCommand.displayPlaylist,
      contentContext: 'curated',
      index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Set', items: [
        item('unrated'),
        { ...item('allowed'), contentRating: 'general' },
      ] },
    }, false);
    canvasService.recordRecentlyPlayed(item('unrated'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    // Tightening promotes a different work with no new cast and no commit, so
    // nothing else would retire the record for the work that just left.
    await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true });

    expect(canvasService.getCastInfo()?.playlist?.items?.[0].id).toBe('allowed');
    expect(history().activeOccurrenceKnown).toBe(false);
  });

  it('keeps the active occurrence when a policy change leaves the same work playing', async () => {
    canvasService.setCastInfo({
      castCommand: CastCommand.displayPlaylist,
      contentContext: 'curated',
      index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Set',
        items: [{ ...item('allowed'), contentRating: 'general' }] },
    }, false);
    canvasService.recordRecentlyPlayed({ ...item('allowed'), contentRating: 'general' });
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true });

    // Blanking this would leave History pending until the next advance, which
    // on a single-work cast may never come.
    expect(history().activeOccurrenceKnown).toBe(true);
  });

});

describe('recently played record capacity', () => {
  it('leaves no stale active occurrence when an oversize record is omitted', async () => {
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    const oversize: DP1Item = {
      ...item('huge'),
      source: `data:text/html,${'x'.repeat(RECENTLY_PLAYED_MAX_RECORD_BYTES)}`,
    };
    canvasService.recordRecentlyPlayed(oversize);

    await vi.waitFor(() => { expect(history().incomplete).toBe(true); });
    // The omitted work is the one on the wall. Reporting the previous record
    // as active would name the wrong work.
    expect(history().activeOccurrenceKnown).toBe(false);
  });

});

// Runs last on purpose: these drive CanvasService's persistence-failure state,
// and it is a process-lifetime singleton shared with the suite above.
describe('recently played persistence failures', () => {
  it('persists the gap marker when a record cannot be written', async () => {
    const marker = vi.spyOn(DeviceManager, 'setRecentlyPlayedIncomplete')
      .mockResolvedValue(undefined);
    setRecentlyPlayed.mockRejectedValueOnce(new Error('quota'));

    canvasService.recordRecentlyPlayed(item('a'));

    // In-memory `incomplete` alone would be lost on restart, and the next boot
    // would report a timeline missing a committed work as complete.
    await vi.waitFor(() => { expect(marker).toHaveBeenCalledWith(true); });
    expect(history().incomplete).toBe(true);
    expect(history().ok).toBe(false);
  });

  it('answers with records again once a later write succeeds, still marked incomplete', async () => {
    const marker = vi.spyOn(DeviceManager, 'setRecentlyPlayedIncomplete')
      .mockResolvedValue(undefined);
    setRecentlyPlayed.mockRejectedValueOnce(new Error('quota'));
    canvasService.recordRecentlyPlayed(item('dropped'));
    await vi.waitFor(() => { expect(history().ok).toBe(false); });

    canvasService.recordRecentlyPlayed(item('later'));

    // One transient IndexedDB failure must not make History an error for the
    // rest of the page's life. The gap is permanent and stays visible as
    // `incomplete`; the records themselves are answerable again.
    await vi.waitFor(() => { expect(history().ok).toBe(true); });
    expect(history().incomplete).toBe(true);
    expect(marker).toHaveBeenCalledWith(true);
  });
});
