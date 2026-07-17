// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { applyModelViewerCursorLock } from './ModelViewerScreen';

describe('applyModelViewerCursorLock', () => {
  it('forces the host cursor to none and injects a shadow-root override', () => {
    const appendChild = vi.fn();
    const querySelector = vi.fn().mockReturnValue(null);
    const viewer = {
      style: { cursor: 'grab' },
      shadowRoot: {
        appendChild,
        querySelector,
      },
    } as unknown as HTMLElement;

    applyModelViewerCursorLock(viewer);

    expect(viewer.style.cursor).toBe('none');
    expect(querySelector).toHaveBeenCalledWith('style#ff-model-viewer-cursor-lock');
    expect(appendChild).toHaveBeenCalledTimes(1);
    const style = appendChild.mock.calls[0][0] as HTMLStyleElement;
    expect(style.textContent).toContain('cursor: none !important;');
  });
});
