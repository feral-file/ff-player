/**
 * `AppWrapper` reads `NEXT_PUBLIC_DISABLE_VERSION_CHECK` at module load to skip
 * `version.json` polling on static FF OS builds. Tests use `vi.resetModules()` +
 * dynamic `import()` so each scenario sees the intended env snapshot while
 * `AppContext` is re-imported together with `AppWrapper` (same context identity).
 */
import { LocalStorageItem } from '@/constants';
import { act, render } from '@testing-library/react';
import React, { useMemo } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentVersion, getVersion, setItemSpy, checkScheduledTask } =
  vi.hoisted(() => ({
    getCurrentVersion: vi.fn(),
    getVersion: vi.fn(),
    setItemSpy: vi.fn().mockResolvedValue(undefined),
    checkScheduledTask: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@/services/app.service', () => ({
  default: {
    getCurrentVersion,
    getVersion,
  },
}));

vi.mock('@/utils/DeviceManager', () => ({
  default: {
    setItem: setItemSpy,
  },
}));

vi.mock('@/services/DP1ScheduleService', () => ({
  default: {
    checkScheduledTask,
  },
}));

vi.mock('./ScheduleDisplay', () => ({
  default: () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/',
}));

function buildContextValue(durationMs?: number) {
  return {
    context: {
      isInitialized: true,
      isOnline: true,
      appRemoteConfig:
        durationMs !== undefined
          ? {
              duration: durationMs,
              defaultPlaylistURL: 'https://example.com/pl',
            }
          : {},
      displaySettings: null,
      cursorPositions: null,
      castInfo: null,
    },
  };
}

function TestTree(props: {
  AppContextModule: typeof import('@/context/AppContext').AppContext;
  AppWrapper: React.ComponentType<{ children: React.ReactNode }>;
  durationMs?: number;
}) {
  const { AppContextModule, AppWrapper, durationMs } = props;
  const value = useMemo(() => buildContextValue(durationMs), [durationMs]);

  return (
    <AppContextModule.Provider value={value as never}>
      <AppWrapper>
        <span data-testid="child">child</span>
      </AppWrapper>
    </AppContextModule.Provider>
  );
}

async function loadAppShell() {
  const [{ AppContext: AppContextModule }, { default: AppWrapper }] =
    await Promise.all([
      import('@/context/AppContext'),
      import('./AppWrapper'),
    ]);
  return { AppContextModule, AppWrapper };
}

function resetHoistedSpies() {
  checkScheduledTask.mockReset();
  checkScheduledTask.mockResolvedValue(undefined);
  setItemSpy.mockReset();
  setItemSpy.mockResolvedValue(undefined);
}

function cleanupModuleAndEnv() {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
}

function prepareWebEnv() {
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_DISABLE_VERSION_CHECK', 'false');
  vi.resetModules();
  getCurrentVersion.mockReset();
  getVersion.mockReset();
  getCurrentVersion.mockResolvedValue('v-same');
  getVersion.mockResolvedValue('v-same');
  setItemSpy.mockClear();
}

function prepareFfStaticEnv() {
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_DISABLE_VERSION_CHECK', 'true');
  vi.resetModules();
  getCurrentVersion.mockReset();
  getVersion.mockReset();
  getCurrentVersion.mockResolvedValue('v-same');
  getVersion.mockResolvedValue('v-same');
  setItemSpy.mockClear();
}

async function assertWebSchedulesVersionInterval(): Promise<void> {
  vi.useFakeTimers();
  const setIntervalSpy = vi.spyOn(window, 'setInterval');
  const { AppContextModule, AppWrapper } = await loadAppShell();
  const pollMs = 12_345;

  render(
    <TestTree
      AppContextModule={AppContextModule}
      AppWrapper={AppWrapper}
      durationMs={pollMs}
    />
  );

  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });

  expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), pollMs);
  setIntervalSpy.mockRestore();
}

async function assertWebSkipsPollingWithoutDuration(): Promise<void> {
  const setIntervalSpy = vi.spyOn(window, 'setInterval');
  const { AppContextModule, AppWrapper } = await loadAppShell();

  render(
    <TestTree AppContextModule={AppContextModule} AppWrapper={AppWrapper} />
  );

  await act(async () => {
    await Promise.resolve();
  });

  expect(setIntervalSpy).not.toHaveBeenCalled();
  setIntervalSpy.mockRestore();
}

async function assertWebPersistsReloadFlagOnVersionChange(): Promise<void> {
  vi.useFakeTimers();
  const reloadStub = vi.fn();
  const locationDescriptor = Object.getOwnPropertyDescriptor(
    window,
    'location'
  );
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload: reloadStub } as unknown as Location,
  });

  getCurrentVersion.mockResolvedValue('1.0.0');
  getVersion.mockResolvedValue('2.0.0');

  const { AppContextModule, AppWrapper } = await loadAppShell();

  try {
    render(
      <TestTree
        AppContextModule={AppContextModule}
        AppWrapper={AppWrapper}
        durationMs={60_000}
      />
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(setItemSpy).toHaveBeenCalledWith(
      LocalStorageItem.versionUpdateReload,
      'true'
    );
    expect(reloadStub).toHaveBeenCalled();
  } finally {
    if (locationDescriptor) {
      Object.defineProperty(window, 'location', locationDescriptor);
    }
  }
}

async function assertFfStaticSkipsVersionPolling(): Promise<void> {
  const setIntervalSpy = vi.spyOn(window, 'setInterval');
  const { AppContextModule, AppWrapper } = await loadAppShell();

  render(
    <TestTree
      AppContextModule={AppContextModule}
      AppWrapper={AppWrapper}
      durationMs={5000}
    />
  );

  await act(async () => {
    await Promise.resolve();
  });

  expect(setIntervalSpy).not.toHaveBeenCalled();
  expect(getVersion).not.toHaveBeenCalled();
  setIntervalSpy.mockRestore();
}

describe('AppWrapper version polling (web)', () => {
  beforeEach(() => {
    resetHoistedSpies();
    prepareWebEnv();
  });

  afterEach(cleanupModuleAndEnv);

  it('schedules interval polling when remote config supplies a positive duration', () =>
    assertWebSchedulesVersionInterval());

  it('does not schedule polling when duration is missing from context', () =>
    assertWebSkipsPollingWithoutDuration());

  it('persists the version update reload flag when the deployed version changes', () =>
    assertWebPersistsReloadFlagOnVersionChange());
});

describe('AppWrapper version polling (static FF OS)', () => {
  beforeEach(() => {
    resetHoistedSpies();
    prepareFfStaticEnv();
  });

  afterEach(cleanupModuleAndEnv);

  it('does not schedule version polling even when duration is present', () =>
    assertFfStaticSkipsVersionPolling());
});
