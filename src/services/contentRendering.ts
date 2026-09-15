import { CastInfo } from '@/models/cast_info.model';
import { DP1Item } from '@/models/dp1.model';
import { ContentPolicySnapshot } from './ContentPolicyStore';
import { allowsContent, parseContentContext } from './contentPolicy';

/**
 * Final media boundary: is the work the renderer is CURRENTLY showing still
 * allowed by the live cast and policy?
 *
 * `showing` is the item that owns the preview URL on screen, which need not be
 * the cast's selected item — Canvas can advance before React consumes
 * updateIndex, and a tightening can promote a different item while the outgoing
 * one is still painted. The question is answered about that showing work and no
 * other: it must still be present in the cast under its own identity, id AND
 * source, and still pass admission.
 *
 * Matching on the URL alone is what this deliberately does not do. Two works
 * can carry the same source with different curator labels, so a freshly blocked
 * work could otherwise be kept on the wall by an allowed sibling whose source
 * happens to match — precisely the immediate-retirement rule this gate exists
 * to enforce. A cleared cast, an unhydrated policy, or a showing work that has
 * left the cast all mean the same thing: stop rendering it.
 */
export function permitsCurrentPreview(cast: CastInfo | null,
  showing: DP1Item | undefined, url: string | null,
  snapshot: ContentPolicySnapshot): boolean {
  if (!cast || !snapshot.active || !url || !showing) {return false;}
  const items = cast.playlist?.items ?? [];
  const candidate = items.find(item => item.id === showing.id && item.source === url);
  return !!candidate && allowsContent(candidate, snapshot.policy, parseContentContext(cast.contentContext));
}
