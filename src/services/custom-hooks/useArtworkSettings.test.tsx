/** @vitest-environment jsdom */
/**
 * Layer contract for useArtworkSettings: the item's merged DP-1 preference
 * is the base, a session-scoped (`isSaved: false`) viewer adjustment sits on
 * top for the current showing only, and a persistent (`isSaved: true`)
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

  it('applies a session write on top and forgets it on item change', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { result, rerender } = renderHook(
      ({ preference }: { preference: DP1DisplayPreference }) =>
        useArtworkSettings(preference),
      { initialProps: { preference: fillPreference } }
    );

    sendDisplaySettings({ scaling: Scaling.Fit, isSaved: false });
    expect(result.current.displaySettings?.scaling).toBe(Scaling.Fit);
    expect(result.current.displaySettings?.changed).toBe(true);

    // Next item: its own merged preference replaces the whole stack.
    rerender({ preference: { ...fillPreference } });
    expect(result.current.displaySettings?.scaling).toBe(Scaling.Fill);
    expect(result.current.displaySettings?.changed).toBeUndefined();
  });

  it('does not let a persistent write override the merged preference', () => {
    const { result } = renderHook(() => useArtworkSettings(fillPreference));

    sendDisplaySettings({ scaling: Scaling.Fit, isSaved: true });
    expect(result.current.displaySettings?.scaling).toBe(Scaling.Fill);
  });
});
