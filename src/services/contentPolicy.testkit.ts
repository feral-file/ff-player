import { vi } from 'vitest';
import DeviceManager from '@/utils/DeviceManager';
import { contentPolicyStore } from './ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';

/** Route harnesses skip AppProvider boot, so supply its completed policy step. */
export async function prepareContentPolicy(): Promise<void> {
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockResolvedValue(undefined);
  await contentPolicyStore.set(DEFAULT_CONTENT_POLICY);
}
