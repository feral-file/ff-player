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
  vi.useRealTimers();
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

  it('treats error as terminal and ignores later load polling', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const onLoad = vi.fn();

    const { container } = render(
      <ModelViewerScreen
        src="https://example.com/model.glb"
        onError={onError}
        onLoad={onLoad}
      />
    );

    const viewer = container.querySelector('model-viewer');
    expect(viewer).toBeTruthy();

    viewer?.dispatchEvent(new Event('error'));
    expect(onError).toHaveBeenCalledTimes(1);

    Object.defineProperty(viewer, 'loaded', {
      configurable: true,
      value: true,
    });
    await vi.advanceTimersByTimeAsync(250);

    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByText('Unable to load 3D model')).toBeTruthy();
  });
});

describe('ModelViewerScreen — loading overlay switch', () => {
  it('shows its own loading overlay by default while the model is not loaded', () => {
    render(<ModelViewerScreen src="https://example.com/model.glb" />);

    expect(screen.queryByText('Loading 3D model')).toBeTruthy();
  });

  it('suppresses the loading overlay when showLoadingOverlay is false', () => {
    // ArtworkPlayer is this component's only consumer. It passes
    // `showRenderLoadingOverlay && showLoading`, so this prop carries both the
    // display.json kill switch and the shared RENDER_LOADING_DELAY_MS gate.
    render(
      <ModelViewerScreen
        src="https://example.com/model.glb"
        showLoadingOverlay={false}
      />
    );

    expect(screen.queryByText('Loading 3D model')).toBeNull();
  });
});
