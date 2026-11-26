/** @vitest-environment jsdom */
import { CastCommand, RenderStatus, type CastInfo } from '@/models';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import { dp1Document, fixtureId } from '@/testing/dp1Fixtures';

/** Render-status must remain a status-poll concern, not a replayed cast. */
function activeCast(): CastInfo {
  const playlist = dp1Document({
    id: fixtureId('playlist'),
    title: 'playlist',
    items: [
      { id: fixtureId('artwork'), source: 'https://example.com/artwork.jpg' },
    ],
  });
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
