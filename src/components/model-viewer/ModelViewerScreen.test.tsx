import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModelViewerScreen from './ModelViewerScreen';

vi.mock('@google/model-viewer', () => {
  throw new Error('model-viewer chunk failed');
});

afterEach(() => {
  cleanup();
});

describe('ModelViewerScreen', () => {
  it('enters error state and notifies the parent when the custom element chunk fails to load', async () => {
    const onError = vi.fn();

    render(
      <ModelViewerScreen
        src="https://example.com/model.glb"
        onError={onError}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Unable to load 3D model')).toBeTruthy();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Loading 3D model')).toBeNull();
  });

  it('keeps the error state when the parent rerenders with a new callback identity', async () => {
    const onError = vi.fn();

    const { container, rerender } = render(
      <ModelViewerScreen
        src="https://example.com/model.glb"
        onError={onError}
      />
    );

    const viewer = container.querySelector('model-viewer');
    expect(viewer).toBeTruthy();

    viewer?.dispatchEvent(new Event('error'));

    await waitFor(() => {
      expect(screen.getByText('Unable to load 3D model')).toBeTruthy();
    });

    const nextOnError = vi.fn();
    rerender(
      <ModelViewerScreen
        src="https://example.com/model.glb"
        onError={nextOnError}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Unable to load 3D model')).toBeTruthy();
    });

    expect(screen.getByText('Unable to load 3D model')).toBeTruthy();
    expect(screen.queryByText('Loading 3D model')).toBeNull();
    expect(nextOnError).not.toHaveBeenCalled();
  });
});
