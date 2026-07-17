import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const helperMocks = vi.hoisted(() => ({
  getContentTypeFromURL: vi.fn(),
}));

vi.mock('@/utils/helper', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/helper')>();
  return {
    ...mod,
    getContentTypeFromURL: helperMocks.getContentTypeFromURL,
  };
});

vi.mock('@google/model-viewer', () => {
  throw new Error('model-viewer chunk failed');
});

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const MODEL_URL =
  'https://ipfs.filebase.io/ipfs/bafybeiht7hyohzvnje3aozwfkoqowuvmb7fooqh4pbyigzv6qm2dolwgxu';

function renderWithContext(ui: React.ReactElement): ReturnType<typeof render> {
  const value = {
    context: {
      isInitialized: true,
      isOnline: true,
      appRemoteConfig: {},
      displaySettings: null,
      cursorPositions: null,
      castInfo: null,
    },
  };
  return render(
    <AppContext.Provider value={value as never}>{ui}</AppContext.Provider>
  );
}

afterEach(() => {
  helperMocks.getContentTypeFromURL.mockReset();
  cleanup();
});

describe('ArtworkPlayer — model bootstrap error handling', () => {
  it('settles the error state without leaving the loading overlay visible', async () => {
    helperMocks.getContentTypeFromURL.mockResolvedValue('model/gltf-binary');

    renderWithContext(
      <ArtworkPlayer
        previewURL={MODEL_URL}
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Unable to load 3D model')).toBeTruthy();
    });

    expect(screen.queryByText('Loading...')).toBeNull();
  });
});
