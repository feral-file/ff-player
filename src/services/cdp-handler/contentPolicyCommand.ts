import { contentPolicyStore } from '../ContentPolicyStore';
import { parseContentPolicy } from '../contentPolicy';

/**
 * Only these commands are asynchronous. Native callers must request CDP's
 * awaitPromise so a durable-storage failure is not misreported as activation.
 */
export async function contentPolicyCommand(command: string, request: unknown,
  messageID?: string): Promise<string> {
  try {
    if (command === 'setContentPolicy') {
      const envelope = request && typeof request === 'object' ? request as Record<string, unknown> : {};
      const policy = parseContentPolicy(envelope.contentPolicy);
      // A write still resolves only once it is durable: reporting a policy as
      // active before it is persisted is the one thing this command cannot do.
      await contentPolicyStore.set(policy);
    } else if (!contentPolicyStore.getSnapshot().active) {
      // Read path, before the mirror is applied. The contract answer is an
      // immediate `contentPolicyUnavailable`, which controld retries. Awaiting
      // hydration instead would hold the promise for as long as the IndexedDB
      // read takes — and forever if it stalls — so the daemon would time out
      // rather than receive a retryable reply. Start hydration without waiting
      // on it, so the next poll can succeed.
      void contentPolicyStore.initialize();
    }
    const state = contentPolicyStore.getSnapshot();
    const message = state.active ? { ok: true, contentPolicy: state.policy, active: true } :
      { ok: false, error: 'contentPolicyUnavailable' };
    return JSON.stringify({ messageID, message });
  } catch (error) {
    return JSON.stringify({ messageID, message: { ok: false,
      error: error instanceof Error && error.message === 'invalidContentPolicy' ?
        'invalidContentPolicy' : 'contentPolicyUnavailable' } });
  }
}
