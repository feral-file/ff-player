import { CastInfo } from '@/models/cast_info.model';
import { DP1Item } from '@/models/dp1.model';
import { normalizePlaylistIndex } from '@/utils/playlist';
import { ContentPolicySnapshot } from './ContentPolicyStore';
import { allowsContent, parseContentContext } from './contentPolicy';

/**
 * Final media boundary. Canvas can advance before React consumes updateIndex;
 * permit its live selection or a still-allowed prior slot during transition.
 * A cleared cast or freshly excluded item must never leave outgoing art alive.
 */
export function permitsCurrentPreview(cast: CastInfo | null,
  prior: DP1Item | undefined, url: string | null,
  snapshot: ContentPolicySnapshot): boolean {
  if (!cast || !snapshot.active || !url) {return false;}
  const items = cast.playlist?.items ?? [];
  const selected = items.at(normalizePlaylistIndex(cast.index ?? 0, items.length));
  const candidate = selected?.source === url ? selected :
    items.find(item => item.id === prior?.id && item.source === url);
  return !!candidate && allowsContent(candidate, snapshot.policy, parseContentContext(cast.contentContext));
}
