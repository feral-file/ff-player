/** @vitest-environment jsdom */
/**
 * Layer contract for useArtworkSettings: the item's merged DP-1 preference
 * is the base, a session-scoped (`isSaved: false`) viewer adjustment sits on
 * top for the current showing only — keyed to the item identity, so it
 * survives a re-merge of the same work — and a persistent (`isSaved: true`)
 * write is NOT an override — it is the device layer of the merge itself.
 */
import { defaultDP1DisplayPreference, Scaling } from '@/models/dp1.model';
import type { DP1DisplayPreference } from '@/models/dp1.model';
import type { UpdateDisplaySettingsRequest } from '@/models/cast_request_reply.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useArtworkSettings } from './useArtworkSettings';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const fillPreference: DP1DisplayPreference = {
  ...defaultDP1DisplayPreference,
  scaling: Scaling.Fill,
};

/** Drive the same listener path the cast command handler uses. */
function sendDisplaySettings(request: Partial<UpdateDisplaySettingsRequest>) {
  act(() => {
    canvasService.updateDisplaySettings(
      request as UpdateDisplaySettingsRequest
    );
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useArtworkSettings', () => {
  it('renders the merged DP-1 preference as-is', () => {
    const { result } = renderHook(() => useArtworkSettings(fillPreference));
    expect(result.current.displaySettings?.scaling).toBe(Scaling.Fill);
    expect(result.current.displaySettings?.background).toBe('#000000');
  });

  it('applies a session write on top and forgets it when the work changes', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { result, rerender } = renderHook(
      ({ identity }: { identity: string }) =>
        useArtworkSettings(fillPreference, identity),
      { initialProps: { identity: 'A' } }
    );

    sendDisplaySettings({ scaling: Scaling.Fit, isSaved: false });
    expect(result.current.displaySettings?.scaling).toBe(Scaling.Fit);
    expect(result.current.displaySettings?.changed).toBe(true);

    // Next work: its own merged preference replaces the whole stack.
    rerender({ identity: 'B' });
    expect(result.current.displaySettings?.scaling).toBe(Scaling.Fill);
    expect(result.current.displaySettings?.changed).toBeUndefined();
  });

  it('keeps a session write across a re-merge of the same work', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { result, rerender } = renderHook(
      ({ preference }: { preference: DP1DisplayPreference }) =>
        useArtworkSettings(preference, 'A'),
      { initialProps: { preference: fillPreference } }
    );

    sendDisplaySettings({ scaling: Scaling.Fit, isSaved: false });
    expect(result.current.displaySettings?.scaling).toBe(Scaling.Fit);

    // The device scaling record landing late re-resolves the same slot and
    // hands ArtworkPlayer a fresh preference object for the same work.
    rerender({ preference: { ...fillPreference } });
    expect(result.current.displaySettings?.scaling).toBe(Scaling.Fit);
    expect(result.current.displaySettings?.changed).toBe(true);
  });

  it('does not let a persistent write override the merged preference', () => {
    const { result } = renderHook(() => useArtworkSettings(fillPreference));

    sendDisplaySettings({ scaling: Scaling.Fit, isSaved: true });
    expect(result.current.displaySettings?.scaling).toBe(Scaling.Fill);
  });
});
