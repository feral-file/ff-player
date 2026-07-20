// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModelViewerScreen from './ModelViewerScreen';

const cursorLockMocks = vi.hoisted(() => {
  let shadowRoot:
    | {
        appendChild: ReturnType<typeof vi.fn>;
        querySelector: ReturnType<typeof vi.fn>;
      }
    | null = null;

  return {
    getShadowRoot: () => shadowRoot,
    setShadowRoot: (
      next:
        | {
            appendChild: ReturnType<typeof vi.fn>;
            querySelector: ReturnType<typeof vi.fn>;
          }
        | null
    ) => {
      shadowRoot = next;
    },
  };
});

vi.mock('@google/model-viewer', () => {
  if (!customElements.get('model-viewer')) {
    customElements.define(
      'model-viewer',
      class extends HTMLElement {
        get shadowRoot() {
          return cursorLockMocks.getShadowRoot() as ShadowRoot | null;
        }
      }
    );
  }

  return {};
});

afterEach(() => {
  cleanup();
  cursorLockMocks.setShadowRoot(null);
  vi.useRealTimers();
});

describe('ModelViewerScreen cursor lock', () => {
  it('retries until the shadow root appears and injects the cursor override', async () => {
    vi.useFakeTimers();

    let appendedStyle: HTMLStyleElement | null = null;
    const querySelector = vi.fn((selector: string) => {
      if (selector === 'style#ff-model-viewer-cursor-lock') {
        return appendedStyle;
      }

      return null;
    });
    const appendChild = vi.fn((style: HTMLStyleElement) => {
      appendedStyle = style;
      return style;
    });

    render(<ModelViewerScreen src="https://example.com/model.glb" />);

    const viewer = document.querySelector('model-viewer') as HTMLElement | null;
    expect(viewer).toBeTruthy();
    expect(viewer?.style.cursor).toBe('none');

    cursorLockMocks.setShadowRoot({
      appendChild,
      querySelector,
    });

    await vi.advanceTimersByTimeAsync(60);

    expect(querySelector).toHaveBeenCalledWith(
      'style#ff-model-viewer-cursor-lock'
    );
    expect(appendChild).toHaveBeenCalledTimes(1);
    const style = appendChild.mock.calls[0][0];
    expect(style.textContent).toContain('cursor: none !important;');
  });

  it('stops cursor-lock retries when model-viewer reports an error', async () => {
    vi.useFakeTimers();

    const onError = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    render(
      <ModelViewerScreen
        src="https://example.com/model-without-shadow-root.glb"
        onError={onError}
      />
    );

    const viewer = document.querySelector('model-viewer') as HTMLElement | null;
    expect(viewer).toBeTruthy();

    viewer?.dispatchEvent(new Event('error'));

    await vi.advanceTimersByTimeAsync(500);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  });
});
