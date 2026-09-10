// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const owner = {};
const signedSource =
  'https://cdn.example.com/work.png?signature=private-access-token';

describe('CanvasService composition identity', () => {
  beforeEach(() => vi.resetModules());

  it('reports a random showing ID without exposing the signed source', async () => {
    const { canvasService } = await import('./CanvasService');
    const remove = canvasService.registerDisplaySettingsReporter(() => ({
      showingKey: `0|work-a|${signedSource}`,
      settings: { margin: '10%' },
    }), owner);

    const settings = canvasService.getStatus().deviceSettings;
    expect(settings?.showingKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(JSON.stringify(settings)).not.toContain(signedSource);
    expect(JSON.stringify(settings)).not.toContain('private-access-token');
    remove();
  });

  it('keeps the showing ID across adjustments and retiring reporters', async () => {
    const { canvasService } = await import('./CanvasService');
    const removeFirst = canvasService.registerDisplaySettingsReporter(() => ({
      showingKey: `0|work-a|${signedSource}`,
      settings: { margin: '10%' },
    }), owner);
    const initial = canvasService.getStatus().deviceSettings;
    // React cleans up the previous layout effect before installing its update.
    removeFirst();
    const removeSecond = canvasService.registerDisplaySettingsReporter(() => ({
      showingKey: `0|work-a|${signedSource}`,
      settings: { margin: '20%' },
    }), owner);
    removeFirst();
    expect(canvasService.getStatus().deviceSettings).toMatchObject({
      showingKey: initial?.showingKey,
      margin: '20%',
    });
    expect(
      canvasService.getStatus().deviceSettings?.compositionRevision
    ).toBeGreaterThan(initial?.compositionRevision ?? 0);
    removeSecond();
    expect(canvasService.getStatus().deviceSettings?.showingKey).toBeUndefined();
  });

  it('changes identity for a new source, slot, and return between polls', async () => {
    const { canvasService } = await import('./CanvasService');
    const register = (showingKey: string): void => {
      canvasService.registerDisplaySettingsReporter(() => ({
        showingKey,
        settings: undefined,
      }), owner);
    };
    register(`0|work-a|${signedSource}`);
    const first = canvasService.getStatus().deviceSettings?.showingKey;
    register('0|work-a|https://cdn.example.com/replacement.png');
    const second = canvasService.getStatus().deviceSettings?.showingKey;
    expect(second).not.toBe(first);
    register('1|work-a|https://cdn.example.com/replacement.png');
    const third = canvasService.getStatus().deviceSettings?.showingKey;
    expect(third).not.toBe(second);
    register(`0|work-a|${signedSource}`);
    register('1|work-a|https://cdn.example.com/replacement.png');
    expect(canvasService.getStatus().deviceSettings?.showingKey).not.toBe(third);
  });

});

describe('CanvasService display settings target', () => {
  beforeEach(() => vi.resetModules());

  it('accepts only the observed committed showing for ephemeral writes', async () => {
    const { canvasService } = await import('./CanvasService');
    const listener = vi.fn();
    canvasService.addDisplaySettingsChangedListener(listener);
    const request = { isSaved: false, margin: '10%' };
    expect(canvasService.updateDisplaySettings(request).ok).toBe(false);
    let acceptsUpdates = true;
    canvasService.registerDisplaySettingsReporter(() => ({
      showingKey: 'work-a',
      settings: undefined,
      acceptsUpdates,
    }), owner);
    const showingKey = canvasService.getStatus().deviceSettings?.showingKey;
    expect(
      canvasService.updateDisplaySettings({ ...request, showingKey }).ok
    ).toBe(true);
    expect(listener).toHaveBeenLastCalledWith(false, request);
    acceptsUpdates = false;
    expect(
      canvasService.updateDisplaySettings({ ...request, showingKey }).ok
    ).toBe(false);
    expect(canvasService.updateDisplaySettings(request).ok).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    // Device defaults have device scope and remain writable during a transition.
    expect(
      canvasService.updateDisplaySettings({ ...request, isSaved: true }).ok
    ).toBe(true);
  });
});


describe('CanvasService showing lifetime', () => {
  it('rejects a pre-unmount command after the same source remounts', async () => {
    vi.resetModules();
    const { canvasService } = await import('./CanvasService');
    const reporter = () => ({ showingKey: 'same-slot-and-source', settings: undefined });
    const remove = canvasService.registerDisplaySettingsReporter(reporter, {});
    const oldKey = canvasService.getStatus().deviceSettings?.showingKey;
    remove();
    expect(canvasService.getStatus().deviceSettings?.showingKey).toBeUndefined();
    canvasService.registerDisplaySettingsReporter(reporter, {});
    expect(canvasService.getStatus().deviceSettings?.showingKey).not.toBe(oldKey);
    expect(canvasService.updateDisplaySettings({ isSaved: false, showingKey: oldKey, margin: '10%' }).ok).toBe(false);
  });
});
