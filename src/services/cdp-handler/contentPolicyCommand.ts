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
      await contentPolicyStore.set(policy);
    } else {
      await contentPolicyStore.initialize();
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
