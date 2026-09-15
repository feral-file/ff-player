import { CastInfo } from '@/models/cast_info.model';
import { DP1Item } from '@/models/dp1.model';
import { ContentPolicySnapshot } from './ContentPolicyStore';
import { allowsContent, parseContentContext } from './contentPolicy';

/**
 * Final media boundary: is the work the renderer is CURRENTLY showing still
 * allowed by the live cast and policy?
 *
 * `showing` is the item on screen, which need not be the cast's selected item —
 * Canvas can advance before React consumes updateIndex, and a tightening can
 * promote a different item while the outgoing one is still shown.
 *
 * Admission is judged on the FRESHEST copy of that work: the one in the live
 * cast when it is still there, matched by id AND source. Matching by URL alone
 * is what this deliberately does not do — two works can carry the same source
 * with different curator labels, so a freshly blocked work could otherwise be
 * kept on the wall by an allowed sibling whose source happens to match.
 *
 * A showing work that has LEFT a still-populated cast is judged on its own
 * labels rather than refused outright. Absence from the cast is not a policy verdict: during an
 * ordinary handoff the outgoing work is legitimately gone from the incoming
 * cast while the two-slot transition still paints it, and refusing it there
 * unmounts the player mid-transition and turns every playlist replacement into
 * a hard cut. Forcing a work off immediately is a different mechanism — the
 * retire epoch — which exists precisely so this gate does not have to guess.
 * A cleared cast or an unhydrated policy still mean: render nothing.
 */
export function permitsCurrentPreview(cast: CastInfo | null,
  showing: DP1Item | undefined, url: string | null,
  snapshot: ContentPolicySnapshot): boolean {
  if (!cast || !snapshot.active || !url || !showing) {return false;}
  const items = cast.playlist?.items ?? [];
  // An empty cast is not a handoff: nothing is loading to replace what is on
  // screen, so there is nothing to keep painting for.
  if (!items.length) {return false;}
  // Matched on the SHOWING work's own source, never on the preview URL. During
  // a same-id source refresh the URL has already moved to the incoming source
  // while the outgoing one is still shown, so pairing the outgoing id with
  // the incoming URL finds the incoming item and judges the wrong work — which
  // would keep mature media on screen because its allowed replacement, not yet
  // loaded, passed admission. `url` is only a presence check: no URL, nothing
  // shown, nothing to permit.
  const fresh = items.find(
    item => item.id === showing.id && item.source === showing.source);
  return allowsContent(fresh ?? showing, snapshot.policy, parseContentContext(cast.contentContext));
}
