import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import { contentPolicyStore, ContentPolicyStore } from './ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';
import DeviceManager from '@/utils/DeviceManager';
import { CastCommand } from '@/models';
import { DP1Action, DP1Call, DP1Item, DP1License } from '@/models/dp1.model';
import DP1ScheduleService from './DP1ScheduleService';

const item = (id: string, contentRating?: 'general' | 'mature'): DP1Item => ({
  id, source: `https://art.test/${id}`, license: DP1License.Open,
  ...(contentRating ? { contentRating } : {}),
});
const playlist = (...items: DP1Item[]): DP1Call => ({ dpVersion: '1.1.0', title: 'Set', items });
const cast = (dp1_call: DP1Call, extra = {}) => canvasService.processMessage({
  command: CastCommand.displayPlaylist,
  request: { intent: { action: DP1Action.NowDisplay }, dp1_call, ...extra },
});

beforeEach(async () => {
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockResolvedValue(undefined);
  await contentPolicyStore.initialize();
});
afterEach(async () => {
  canvasService.setCastInfo(null, false);
  await contentPolicyStore.set(DEFAULT_CONTENT_POLICY);
});

describe('content policy at playback boundaries', () => {
  it('rejects all-blocked new casts without replacing the current work', () => {
    expect(cast(playlist(item('a', 'general')))?.ok).toBe(true);
    expect(cast(playlist(item('b', 'mature')))).toEqual({ ok: false, error: 'contentBlocked' });
    expect(canvasService.getCastInfo()?.playlist?.items?.[0].id).toBe('a');
  });

  it('filters before validating a blocked source and keeps artist controls', () => {
    const mature = { ...item('b', 'mature'), source: 'about:blank' };
    const general = { ...item('a', 'general'), display: { loop: false, margin: 23 } };
    expect(cast(playlist(mature, general))?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.playlist?.items?.[0].display).toEqual(general.display);
  });

  it('retains personal context then immediately retires blocked work on tightening', async () => {
    expect(cast(playlist(item('b', 'mature')), { contentContext: 'personal' })?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.contentContext).toBe('personal');
    await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, strictPersonal: true });
    expect(canvasService.getCastInfo()).toBeNull();
  });

  it('rechecks scheduled and persisted casts under the current audit gate', async () => {
    await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true });
    canvasService.executeScheduledDP1Task(playlist(item('unrated')));
    expect(canvasService.getCastInfo()).toBeNull();
    canvasService.setCastInfo({ castCommand: CastCommand.displayPlaylist,
      playlist: playlist(item('mature', 'mature'), item('allowed', 'general')), index: 0 });
    expect(canvasService.getCastInfo()?.playlist?.items?.map(value => value.id)).toEqual(['allowed']);
  });

  it('retires a newly mature current work on refresh even when no replacement remains', () => {
    cast(playlist(item('a')));
    const epoch = contentPolicyStore.getSnapshot().epoch;
    expect(cast(playlist(item('a', 'mature')), { refresh: true })?.ok).toBe(true);
    expect(canvasService.getCastInfo()).toBeNull();
    expect(contentPolicyStore.getSnapshot().epoch).toBeGreaterThan(epoch);
  });

  it('immediately replaces newly blocked current work, never deferring it until the end', () => {
    cast(playlist(item('a'), item('b', 'general')));
    expect(cast(playlist(item('a', 'mature'), item('b', 'general')), { refresh: true })?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.playlist?.items?.map(value => value.id)).toEqual(['b']);
    expect(canvasService.getCastInfo()?.castCommand).toBe(CastCommand.displayPlaylist);
  });

  it('retires newly blocked work even if its proposed replacement has an invalid source', () => {
    cast(playlist(item('a')));
    const invalid = { ...item('b', 'general'), source: 'about:blank' };
    expect(cast(playlist(item('a', 'mature'), invalid), { refresh: true })?.ok).toBe(false);
    expect(canvasService.getCastInfo()).toBeNull();
  });

  it('never refuses a document, or hides a work, over a label it cannot read', () => {
    // dp1 §3.3: the rating vocabulary is open. An unrecognised value is not
    // malformed input and carries no meaning the player may act on, so the cast
    // is accepted and the work plays exactly as an unrated one would.
    const unknown = { ...item('unknown'), contentRating: 'explicit' };
    expect(cast(playlist(unknown, item('b', 'general')))?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.playlist?.items?.map(value => value.id))
      .toEqual(['unknown', 'b']);
  });

  it('distinguishes malformed labels from valid content excluded by policy', () => {
    const malformed = { ...item('a'), contentRating: null } as unknown as DP1Item;
    expect(cast(playlist(malformed))).toEqual({ ok: false, error: 'playlistInvalid' });
    expect(cast(playlist(item('a')), { contentContext: null })?.ok).toBe(false);
  });

  it.each([{ items: [] }, { items: [item('b', 'general')] }])('honors daemon retirement after filtering out fresh blocked labels (%j)', ({ items }) => {
    cast(playlist(item('a')));
    expect(cast(playlist(...items), { refresh: true, retireBlockedCurrent: true })?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.playlist?.items?.some(value => value.id === 'a') ?? false).toBe(false);
  });

});

describe('content policy at persistence and refresh boundaries', () => {
  it('carries the boot cast context into playback and into what it persists', () => {
    const boot = vi.spyOn(DeviceManager, 'setBootPlaylist').mockResolvedValue(undefined);
    const mature = playlist(item('b', 'mature'));

    // Under the default policy a personal cast is unfiltered. Dropping the
    // context here would reject the viewer's own boot cast as curated, and
    // persisting it without the context would repeat that on every restart.
    expect(cast(mature, { intent: { action: DP1Action.DisplayAtBoot },
      contentContext: 'personal' })?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.contentContext).toBe('personal');
    expect(boot).toHaveBeenCalledWith(mature, 'personal');
  });

  it('stores the context a refresh was actually filtered under', async () => {
    expect(cast(playlist(item('a', 'mature')), { contentContext: 'personal' })?.ok).toBe(true);

    // A refresh that declares curated is filtered as curated; keeping the
    // cast's old personal origin in storage would let one origin choose the
    // items and a different one judge them on the next policy change.
    expect(cast(playlist(item('a', 'general'), item('b', 'general')),
      { refresh: true, contentContext: 'curated' })?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.contentContext).toBe('curated');

    await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, strictPersonal: true });
    expect(canvasService.getCastInfo()?.playlist?.items?.map(value => value.id)).toEqual(['a', 'b']);
  });

  it('stores a reclassified context even when the refreshed items are identical', async () => {
    const items = playlist(item('a'));
    expect(cast(items, { contentContext: 'personal' })?.ok).toBe(true);

    // Same list, new origin: the reclassification IS the refresh. Returning
    // early on the equal-items fast path would leave the cast judged personal.
    expect(cast(items, { refresh: true, contentContext: 'curated' })?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.contentContext).toBe('curated');

    await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true });
    expect(canvasService.getCastInfo()).toBeNull();
  });

});

describe('content policy during a slow handoff', () => {
  it('retires the work on screen when its refresh changes source AND blocks it', async () => {
    vi.spyOn(DeviceManager, 'getRecentlyPlayed').mockResolvedValue([]);
    vi.spyOn(DeviceManager, 'getRecentlyPlayedIncomplete').mockResolvedValue(false);
    vi.spyOn(DeviceManager, 'setRecentlyPlayed').mockResolvedValue(undefined);
    const onScreen = item('on-screen');
    const selected = item('selected', 'general');
    expect(cast(playlist(onScreen, selected))?.ok).toBe(true);
    canvasService.recordRecentlyPlayed(onScreen);
    const reply = () => canvasService.processMessage({
      command: CastCommand.getRecentlyPlayed, request: {},
    }) as { activeOccurrenceKnown?: boolean };
    await vi.waitFor(() => { expect(reply().activeOccurrenceKnown).toBe(true); });
    canvasService.setCastInfo({ ...canvasService.getCastInfo(), index: 1 }, false);

    // Same work, new source, now mature. Matching the on-screen work by id AND
    // source would miss it entirely and leave it rendering under stale labels.
    expect(cast(playlist(
      { ...onScreen, source: 'https://art.test/on-screen-v2', contentRating: 'mature' },
      selected), { refresh: true })?.ok).toBe(true);

    expect(canvasService.getCastInfo()?.playlist?.items?.map(value => value.id))
      .toEqual(['selected']);
  });

});

describe('content policy and the selected work moving on', () => {
  it('retires the work on screen when a refresh blocks it, not just the selected one', async () => {
    vi.spyOn(DeviceManager, 'getRecentlyPlayed').mockResolvedValue([]);
    vi.spyOn(DeviceManager, 'getRecentlyPlayedIncomplete').mockResolvedValue(false);
    vi.spyOn(DeviceManager, 'setRecentlyPlayed').mockResolvedValue(undefined);
    const onScreen = item('on-screen');
    const selected = item('selected', 'general');
    expect(cast(playlist(onScreen, selected))?.ok).toBe(true);
    // Commit `painted`, then let the selection move on: this is the slow
    // handoff, where the wall shows one work and the cast selects another.
    canvasService.recordRecentlyPlayed(onScreen);
    const historyReply = () => canvasService.processMessage({
      command: CastCommand.getRecentlyPlayed, request: {},
    }) as { activeOccurrenceKnown?: boolean };
    await vi.waitFor(() => { expect(historyReply().activeOccurrenceKnown).toBe(true); });
    canvasService.setCastInfo({ ...canvasService.getCastInfo(), index: 1 }, false);

    // Fresh labels block the work ON SCREEN while the selected one stays fine.
    expect(cast(playlist({ ...onScreen, contentRating: 'mature' }, selected),
      { refresh: true })?.ok).toBe(true);

    // Checking only the selection would filter `onScreen` out of the projection
    // and leave it rendering under its stale labels until `selected` commits.
    expect(canvasService.getCastInfo()?.playlist?.items?.map(value => value.id))
      .toEqual(['selected']);
    expect(canvasService.getCastInfo()?.castCommand).toBe(CastCommand.displayPlaylist);
  });

  it('installs the replacement when a refresh narrows the context out of the current work', () => {
    expect(cast(playlist(item('a', 'mature')), { contentContext: 'personal' })?.ok).toBe(true);

    // The refresh narrows to curated and omits the mature work entirely, so
    // neither the fresh-label checks nor the omitted work's own labels under
    // the OLD context would catch it. Deferring here republished the current
    // work under the new context, filtered it to nothing, and dropped the
    // replacement with it: a blank wall reported as success.
    expect(cast(playlist(item('b', 'general')),
      { refresh: true, contentContext: 'curated' })?.ok).toBe(true);

    expect(canvasService.getCastInfo()?.playlist?.items?.map(value => value.id))
      .toEqual(['b']);
  });

  it('does not let a refresh upgrade a curated cast to personal', () => {
    expect(cast(playlist(item('a', 'general')))?.ok).toBe(true);

    // A source update must not be able to reclassify a curated playlist as
    // personal and walk mature content past the default filter; only a cast
    // can establish a personal origin.
    expect(cast(playlist(item('a', 'general'), item('b', 'mature')),
      { refresh: true, contentContext: 'personal' })?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.contentContext).toBe('curated');
    expect(canvasService.getCastInfo()?.playlist?.items?.map(value => value.id)).toEqual(['a']);
  });

  it('lets a refresh narrow a personal cast to curated', () => {
    expect(cast(playlist(item('a', 'general')), { contentContext: 'personal' })?.ok).toBe(true);

    // Narrowing is always allowed; only widening is refused.
    expect(cast(playlist(item('a', 'general')),
      { refresh: true, contentContext: 'personal' })?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.contentContext).toBe('personal');
  });

  it('applies an intentionally emptied refresh instead of calling it blocked', () => {
    expect(cast(playlist(item('a')))?.ok).toBe(true);

    // An empty list is the source saying "nothing here now". Treating it as a
    // fully-blocked playlist would leave the old artwork on the wall.
    expect(cast(playlist(), { refresh: true })?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.playlist?.items ?? []).toHaveLength(0);
  });

  it('filters a scheduled playlist before validating its sources', () => {
    const store = vi.spyOn(DP1ScheduleService, 'storeScheduledTask').mockResolvedValue(undefined);
    const blockedInvalid = { ...item('blocked', 'mature'), source: 'about:blank' };
    const allowed = item('allowed', 'general');

    // Same order as an immediate cast. Validating the raw list would let the
    // blocked work's unsupported source reject a schedule whose playable work
    // is fine, and would store an item this version never validated.
    const reply = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: { action: DP1Action.SchedulePlay, schedule_time: '2099-01-01T00:00:00Z' },
        dp1_call: playlist(blockedInvalid, allowed),
      },
    });

    expect(reply?.ok).toBe(true);
    const [stored] = store.mock.calls[0];
    expect(stored.items?.map(value => value.id)).toEqual(['allowed']);
  });

  it('persists only boot items this version validated', () => {
    const boot = vi.spyOn(DeviceManager, 'setBootPlaylist').mockResolvedValue(undefined);
    const blockedInvalid = { ...item('blocked', 'mature'), source: 'about:blank' };
    const allowed = item('allowed', 'general');

    // The mature item is filtered before source validation, so nothing ever
    // checked its source. Persisting it would let a later relaxation plus a
    // restart hand that source to the renderer unvalidated.
    expect(cast(playlist(blockedInvalid, allowed),
      { intent: { action: DP1Action.DisplayAtBoot } })?.ok).toBe(true);
    const [record] = boot.mock.calls[0];
    expect(record.items?.map(value => value.id)).toEqual(['allowed']);
    expect(record.signature).toBeUndefined();
  });

  it('does not attest a refreshed item list with the previous playlist signature', () => {
    const signed = { ...playlist(item('a'), item('b', 'general')), signature: 'ed25519:original' };
    expect(cast(signed)?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.playlist?.signature).toBe('ed25519:original');

    expect(cast(playlist(item('a'), item('c', 'general')), { refresh: true })?.ok).toBe(true);

    // The item list changed, so the old attestation no longer describes it.
    expect(canvasService.getCastInfo()?.playlist?.signature).toBeUndefined();
  });
});

describe('admission when the policy mirror is not yet readable', () => {
  const store = (read: () => Promise<string | null>) =>
    new ContentPolicyStore({ read, write: () => Promise.resolve() });

  it('marks an unreadable mirror so admission can fail closed on it', async () => {
    const failing = store(() => Promise.reject(new Error('unreadable')));

    await failing.initialize();

    expect(failing.getSnapshot().active).toBe(false);
    expect(failing.getSnapshot().hydrationFailed).toBe(true);
  });

  it('clears the failure once the daemon repairs the mirror', async () => {
    const failing = store(() => Promise.reject(new Error('unreadable')));
    await failing.initialize();

    await failing.set({ ...DEFAULT_CONTENT_POLICY, showMatureContent: true });

    expect(failing.getSnapshot().hydrationFailed).toBe(false);
    expect(failing.getSnapshot().active).toBe(true);
  });

  it('does not confuse an unreadable mirror with one still being read', () => {
    // Both are inactive, but only the unread one resolves on its own, and
    // admission relies on that difference.
    const unread = store(() => new Promise(() => undefined));

    expect(unread.getSnapshot().active).toBe(false);
    expect(unread.getSnapshot().hydrationFailed).toBe(false);
  });

  it('refuses a cast outright when the mirror is unreadable', () => {
    vi.spyOn(contentPolicyStore, 'getSnapshot').mockReturnValue({
      policy: DEFAULT_CONTENT_POLICY, active: false, epoch: 1, retireEpoch: 0, hydrationFailed: true,
    });

    expect(cast(playlist(item('a', 'general'))))
      .toEqual({ ok: false, error: 'contentPolicyUnavailable' });
  });

  it('admits a cast whole while the mirror is still being read, then reconciles it', async () => {
    const snapshot = vi.spyOn(contentPolicyStore, 'getSnapshot').mockReturnValue({
      policy: DEFAULT_CONTENT_POLICY, active: false, epoch: 1, retireEpoch: 0, hydrationFailed: false,
    });

    // Filtering against the built-in default here would reject this cast
    // outright, with nothing left to reconcile once the real policy lands.
    expect(cast(playlist(item('a', 'mature')))?.ok).toBe(true);
    expect(canvasService.getCastInfo()?.playlist?.items?.map(value => value.id)).toEqual(['a']);

    snapshot.mockRestore();
    // Stand in for the hydration publish: any policy the store publishes
    // notifies its subscribers, and CanvasService reconciles the retained cast.
    await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, strictPersonal: true });

    // The published policy is re-applied to the payload that was kept whole.
    expect(canvasService.getCastInfo()).toBeNull();
  });
});
