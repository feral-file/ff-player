/** @vitest-environment jsdom */
import { CastCommand, RenderStatus, type CastInfo } from '@/models';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';

/** Render-status must remain a status-poll concern, not a replayed cast. */
function activeCast(): CastInfo {
  const item: DP1Item = {
    id: 'artwork',
    source: 'https://example.com/artwork.jpg',
    license: {},
  } as DP1Item;
  const playlist: DP1Call = {
    dpVersion: '1',
    id: 'playlist',
    title: 'playlist',
    items: [item],
  };
  return {
    castCommand: CastCommand.displayPlaylist,
    playlist,
    index: 0,
  };
}

afterEach(() => {
  canvasService.onCastInfoChange = null;
  canvasService.setCastInfo(null, false);
});

describe('CanvasService render-status publication', () => {
  it('updates status without replaying the active cast command', () => {
    const onCastInfoChange = vi.fn();
    canvasService.onCastInfoChange = onCastInfoChange;
    canvasService.setCastInfo(activeCast(), false);

    canvasService.setRenderStatus(RenderStatus.loading);

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);
    expect(canvasService.getCastInfo()?.renderStatus).toBe(
      RenderStatus.loading
    );
    expect(onCastInfoChange).not.toHaveBeenCalled();
  });
});
