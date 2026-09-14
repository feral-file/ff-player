import { describe, expect, it } from 'vitest';
import { CastCommand } from '@/models';
import { DP1Item, DP1License } from '@/models/dp1.model';
import { ContentPolicySnapshot } from './ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';
import { permitsCurrentPreview } from './contentRendering';

const a: DP1Item = { id: 'a', source: 'https://art.test/a', license: DP1License.Open };
const b: DP1Item = { ...a, id: 'b', source: 'https://art.test/b' };
const snapshot: ContentPolicySnapshot = { policy: DEFAULT_CONTENT_POLICY, active: true,
  epoch: 1, hydrationFailed: false };
const cast = (items: DP1Item[], index = 0) => ({ castCommand: CastCommand.displayPlaylist,
  playlist: { dpVersion: '1.1.0', title: 'Art', items }, index });

describe('final current-preview admission', () => {
  it('permits Canvas advancing ahead of React and an allowed outgoing selection', () => {
    expect(permitsCurrentPreview(cast([a, b], 1), a, b.source, snapshot)).toBe(true);
    expect(permitsCurrentPreview(cast([a, b], 1), a, a.source, snapshot)).toBe(true);
  });

  it('never renders after clearing or before policy hydration', () => {
    expect(permitsCurrentPreview(null, a, a.source, snapshot)).toBe(false);
    expect(permitsCurrentPreview(cast([a]), a, a.source, { ...snapshot, active: false })).toBe(false);
    expect(permitsCurrentPreview(cast([]), a, a.source, snapshot)).toBe(false);
  });

  it('uses fresh live labels, not a stale allowed React item', () => {
    expect(permitsCurrentPreview(cast([{ ...a, contentRating: 'mature' }, b], 1), a, a.source, snapshot)).toBe(false);
    expect(permitsCurrentPreview(cast([b]), a, a.source, snapshot)).toBe(false);
  });

  it('cannot borrow a rating merely because another work shares a source URL', () => {
    const mature = { ...a, contentRating: 'mature' as const };
    expect(permitsCurrentPreview(cast([mature, { ...b, source: a.source }]), a, a.source, snapshot)).toBe(false);
  });
});
