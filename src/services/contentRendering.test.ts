import { describe, expect, it } from 'vitest';
import { CastCommand } from '@/models';
import { DP1Item, DP1License } from '@/models/dp1.model';
import { ContentPolicySnapshot } from './ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';
import { permitsCurrentPreview } from './contentRendering';

const a: DP1Item = { id: 'a', source: 'https://art.test/a', license: DP1License.Open };
const b: DP1Item = { ...a, id: 'b', source: 'https://art.test/b' };
const snapshot: ContentPolicySnapshot = { policy: DEFAULT_CONTENT_POLICY, active: true,
  epoch: 1, retireEpoch: 0, hydrationFailed: false };
const cast = (items: DP1Item[], index = 0) => ({ castCommand: CastCommand.displayPlaylist,
  playlist: { dpVersion: '1.1.0', title: 'Art', items }, index });

describe('final current-preview admission', () => {
  it('permits the showing work whether or not the cast has advanced past it', () => {
    // The gate asks about the work on screen, identified by the URL it owns,
    // so Canvas advancing ahead of React does not change the answer.
    expect(permitsCurrentPreview(cast([a, b], 1), b, b.source, snapshot)).toBe(true);
    expect(permitsCurrentPreview(cast([a, b], 1), a, a.source, snapshot)).toBe(true);
  });

  it('never renders after clearing or before policy hydration', () => {
    expect(permitsCurrentPreview(null, a, a.source, snapshot)).toBe(false);
    expect(permitsCurrentPreview(cast([a]), a, a.source, { ...snapshot, active: false })).toBe(false);
    expect(permitsCurrentPreview(cast([]), a, a.source, snapshot)).toBe(false);
  });

  it('uses fresh live labels, not a stale allowed React item', () => {
    expect(permitsCurrentPreview(cast([{ ...a, contentRating: 'mature' }, b], 1), a, a.source, snapshot)).toBe(false);
  });

  it('keeps painting an allowed outgoing work through an ordinary handoff', () => {
    // The outgoing work is legitimately absent from the incoming cast while the
    // two-slot transition loads its replacement. Refusing it here unmounts the
    // player mid-transition and turns every playlist replacement into a hard
    // cut; forcing a work off immediately is the retire epoch's job.
    expect(permitsCurrentPreview(cast([b]), a, a.source, snapshot)).toBe(true);
    // Still judged by its own labels, so a blocked outgoing work never lingers.
    expect(permitsCurrentPreview(cast([b]), { ...a, contentRating: 'mature' },
      a.source, snapshot)).toBe(false);
  });

  it('cannot borrow a rating merely because another work shares a source URL', () => {
    const mature = { ...a, contentRating: 'mature' as const };
    expect(permitsCurrentPreview(cast([mature, { ...b, source: a.source }]), a, a.source, snapshot)).toBe(false);
  });

  it('judges the painted source, not the one already queued to replace it', () => {
    // Same-id source refresh mid-load: the preview URL has moved to the
    // incoming source while the outgoing one is still painted. Pairing the
    // outgoing id with the incoming URL finds the incoming item, so a mature
    // work would stay on screen because its allowed replacement passed —
    // indefinitely if that replacement stalls.
    const paintedMature = { ...a, source: 'https://art.test/a-v1',
      contentRating: 'mature' as const };
    const incomingAllowed = { ...a, source: 'https://art.test/a-v2',
      contentRating: 'general' as const };

    expect(permitsCurrentPreview(cast([incomingAllowed]), paintedMature,
      incomingAllowed.source, snapshot)).toBe(false);
    // Once the replacement is what is painted, it plays normally.
    expect(permitsCurrentPreview(cast([incomingAllowed]), incomingAllowed,
      incomingAllowed.source, snapshot)).toBe(true);
  });

  it('retires a blocked showing work even after an allowed sibling with its source is selected', () => {
    // Post-filter shape: the mature work has been removed from the projection
    // and a different work carrying the same source is now selected, while the
    // screen still holds the blocked one. Permitting through the selected
    // item's matching URL would keep blocked artwork visible through the
    // transition.
    const mature = { ...a, contentRating: 'mature' as const };
    const sibling = { ...b, source: a.source, contentRating: 'general' as const };

    expect(permitsCurrentPreview(cast([sibling]), mature, a.source, snapshot)).toBe(false);
  });
});
