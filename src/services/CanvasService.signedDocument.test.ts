// @vitest-environment jsdom
import { CastCommand } from '@/models';
import { DP1Action, type DP1Call, type DP1Item } from '@/models/dp1.model';
import DeviceManager from '@/utils/DeviceManager';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import { contentPolicyStore } from './ContentPolicyStore';
import { dp1Document, fixtureId } from '@/testing/dp1Fixtures';

const item = (id: string, extra: Partial<DP1Item> = {}): DP1Item => ({
  id: fixtureId(id),
  source: `https://example.com/${id}.jpg`,
  ...extra,
});

const signedDocument = (items: DP1Item[], duration: number): DP1Call =>
  dp1Document({
    id: fixtureId('signed'),
    title: 'signed',
    defaults: { duration },
    items,
    signature: 'ed25519:abc',
  });

const display = (dp1Call: DP1Call, extra: Record<string, unknown> = {}) =>
  canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: dp1Call,
      ...extra,
    },
  });

// Status only reports a cast once a content policy is in force.
beforeEach(async () => {
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  await contentPolicyStore.initialize();
});

afterEach(() => {
  canvasService.setCastInfo(null, false);
  vi.restoreAllMocks();
});

describe('the signed DP-1 document the player holds', () => {
  it('is re-emitted by status exactly as it was cast (DP-1 §7.1)', () => {
    const sent = signedDocument([item('a'), item('b', { duration: 5 })], 30);
    const original = structuredClone(sent);

    expect(display(sent)).toMatchObject({ ok: true });

    const status = canvasService.getStatus();
    expect(status.playlist).toEqual(original);
    expect(status.items).toEqual(original.items);
    expect(sent).toEqual(original);
  });
});

describe('source refresh (DP-1 core §3.1 inheritance)', () => {
  it('resolves the new items against the new document defaults', () => {
    display(signedDocument([item('a'), item('b')], 30));

    display(signedDocument([item('a'), item('b'), item('c')], 7), {
      refresh: true,
    });

    expect(canvasService.getCastInfo()?.playlist?.defaults).toEqual({
      duration: 7,
    });
  });

  it('applies a refresh that changes only defaults', () => {
    display(signedDocument([item('a'), item('b')], 30));

    display(signedDocument([item('a'), item('b')], 7), { refresh: true });

    expect(canvasService.getCastInfo()?.playlist?.defaults).toEqual({
      duration: 7,
    });
    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);
  });
});
