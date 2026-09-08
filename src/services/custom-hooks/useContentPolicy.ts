import { useSyncExternalStore } from 'react';
import { contentPolicyStore } from '../ContentPolicyStore';

/** Observe durable policy changes; the epoch retires old media slots at once. */
export function useContentPolicy() {
  return useSyncExternalStore(contentPolicyStore.subscribe,
    contentPolicyStore.getSnapshot, contentPolicyStore.getSnapshot);
}
