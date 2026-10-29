import { contentPolicyStore, policyInForce } from '../ContentPolicyStore';
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
      // Read path, before the mirror is applied. Awaiting hydration would hold
      // the promise for as long as the IndexedDB read takes — and forever if it
      // stalls — so the daemon would time out rather than get an answer. Start
      // the read without waiting on it; it is retried, so a mirror that becomes
      // readable is picked up by a later poll.
      void contentPolicyStore.initialize();
    }
    return JSON.stringify({ messageID, message: policyReply() });
  } catch (error) {
    return JSON.stringify({ messageID, message: { ok: false,
      error: error instanceof Error && error.message === 'invalidContentPolicy' ?
        'invalidContentPolicy' : 'contentPolicyUnavailable' } });
  }
}

/**
 * Three states, not two. `active:true` is a policy that is applied AND durable.
 * `active:false` WITH a policy is the degraded case: the mirror could not be
 * read, the built-in default is in force, and the device is still playing under
 * it — the daemon needs to see that to repair the mirror, and cannot if it is
 * reported as unavailable. `contentPolicyUnavailable` is reserved for genuinely
 * pending hydration, where there is no policy to report yet.
 */
function policyReply(): Record<string, unknown> {
  const state = contentPolicyStore.getSnapshot();
  const inForce = policyInForce(state);
  if (!inForce) {
    return { ok: false, error: 'contentPolicyUnavailable' };
  }
  return { ok: true, contentPolicy: inForce, active: state.active };
}
