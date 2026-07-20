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
  it('uses the standalone route src query before showing a no-source error', () => {
    window.history.replaceState(
      null,
      '',
      '/model-viewer?src=https%3A%2F%2Fexample.com%2Fquery-model.glb'
    );

    const { container } = render(<ModelViewerScreen />);

    const viewer = container.querySelector('model-viewer');
    expect(viewer?.getAttribute('src')).toBe(
      'https://example.com/query-model.glb'
    );
    expect(screen.getByText('Loading 3D model')).toBeTruthy();
    expect(screen.queryByText('Unable to load 3D model')).toBeNull();
  });

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

    viewer?.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText('Unable to load 3D model')).toBeNull();
  });
});
