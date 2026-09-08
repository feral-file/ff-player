import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import { contentPolicyStore } from './ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';
import DeviceManager from '@/utils/DeviceManager';
import { CastCommand } from '@/models';
import { DP1Action, DP1Call, DP1Item, DP1License } from '@/models/dp1.model';

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
