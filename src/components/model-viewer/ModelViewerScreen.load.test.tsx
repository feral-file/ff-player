import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModelViewerScreen from './ModelViewerScreen';

vi.mock('@google/model-viewer', () => {
  if (!customElements.get('model-viewer')) {
    customElements.define('model-viewer', class extends HTMLElement {});
  }
  return {};
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('ModelViewerScreen', () => {
  it('calls onLoad when the model-viewer element reports load', async () => {
    const onLoad = vi.fn();

    const { container } = render(
      <ModelViewerScreen
        src="https://example.com/model.glb"
        onLoad={onLoad}
      />
    );

    const viewer = container.querySelector('model-viewer');
    expect(viewer).toBeTruthy();
    Object.defineProperty(viewer, 'loaded', {
      configurable: true,
      value: true,
    });

    viewer?.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledTimes(1);
    });
    await new Promise(resolve => {
      setTimeout(resolve, 150);
    });

    expect(onLoad).toHaveBeenCalledTimes(1);

    expect(screen.queryByText('Unable to load 3D model')).toBeNull();
  });
});
