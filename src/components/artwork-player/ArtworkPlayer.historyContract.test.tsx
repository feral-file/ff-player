import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CastCommand, RenderStatus, Reply } from '@/models';
import { defaultDP1DisplayPreference, DP1Item, DP1License } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { contentPolicyStore } from '@/services/ContentPolicyStore';
import DeviceManager from '@/utils/DeviceManager';
import ArtworkPlayer from './ArtworkPlayer';

vi.mock('@/context/AppContext', () => ({useAppContext: () => ({context: {
  isOnline: true, appRemoteConfig: {}, displaySettings: null,
  cursorPositions: null, deviceRotation: {viewMode: 'landscape'},
}})}));
vi.mock('@/services/custom-hooks/useArtworkSettings', () => ({
  useArtworkSettings: (displaySettings: unknown) => ({displaySettings}),
}));

const works: DP1Item[] = ['a', 'b'].map(id => ({
  id, source: `https://feralfile.com/${id}.jpg`, license: DP1License.Open,
}));
const history = () => canvasService.processMessage({command: CastCommand.getRecentlyPlayed}) as Reply & {
  activeOccurrenceKnown: boolean; records: {isActive: boolean; title?: string}[];
};

/** Drain the serialized history writes without moving the fade/retry clock. */
async function settle() {
  await act(async () => {
    for (let step = 0; step < 20; step++) {await Promise.resolve();}
  });
}

function select(index: number) {
  canvasService.setCastInfo({
    castCommand: CastCommand.displayPlaylist,
    playlist: {dpVersion: '1', title: 'Contract', items: works}, index,
  }, false);
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'getRecentlyPlayed').mockResolvedValue([]);
  vi.spyOn(DeviceManager, 'getRecentlyPlayedIncomplete').mockResolvedValue(false);
  vi.spyOn(DeviceManager, 'setRecentlyPlayed').mockResolvedValue(undefined);
  vi.spyOn(DeviceManager, 'setRecentlyPlayedIncomplete').mockResolvedValue(undefined);
  await contentPolicyStore.initialize();
  await canvasService.primeRecentlyPlayed();
});

afterEach(() => {
  cleanup(); canvasService.setCastInfo(null, false);
  vi.useRealTimers(); vi.restoreAllMocks();
});

it('preserves fade-start history, fade-end composition, and pending history after in-place recovery', async () => {
  const played = vi.fn((identity: string) => {
    const work = works.find(item => item.id === identity);
    if (work) {canvasService.recordRecentlyPlayed(work);}
  });
  const node = (index: number) => <ArtworkPlayer
    previewURL={works[index].source} itemIdentity={works[index].id}
    artworkPreviewMIMEType="image/jpeg" onItemPlayed={played}
    displayPreferences={{...defaultDP1DisplayPreference, background: index === 0 ? '#112233' : '#445566'}} />;
  select(0);
  const mounted = render(node(0));
  await settle();
  const first = mounted.container.querySelector('img');
  if (!first) { throw new Error('First image did not mount'); }
  await act(async () => { fireEvent.load(first); await Promise.resolve(); });
  await settle();
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
  expect(history().activeOccurrenceKnown).toBe(true);
  expect(history().records.filter(record => record.isActive)).toHaveLength(1);

  select(1);
  mounted.rerender(node(1));
  await settle();
  expect(played).toHaveBeenCalledTimes(1);
  expect(history().records.filter(record => record.isActive)).toHaveLength(1);
  const incoming = mounted.container.querySelectorAll('img')[1];
  await act(async () => { fireEvent.load(incoming); await Promise.resolve(); });
  await settle();
  expect(played).toHaveBeenLastCalledWith('b');
  expect(played).toHaveBeenCalledTimes(2);
  expect(canvasService.getStatus()).toMatchObject({
    renderStatus: RenderStatus.pending, deviceSettings: {background: '#112233'},
  });
  expect(history().activeOccurrenceKnown).toBe(true);
  act(() => { vi.advanceTimersByTime(650); });
  expect(canvasService.getStatus()).toMatchObject({
    renderStatus: RenderStatus.ready, deviceSettings: {background: '#445566'},
  });

  act(() => { fireEvent.error(incoming); });
  expect(history().activeOccurrenceKnown).toBe(false);
  await act(async () => { fireEvent.load(incoming); await Promise.resolve(); });
  await settle();
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
  expect(played).toHaveBeenCalledTimes(2);
  expect(history().activeOccurrenceKnown).toBe(false);
  canvasService.setSleepMode({sleepMode: true});
  expect(history().activeOccurrenceKnown).toBe(true);
  expect(history().records.some(record => record.isActive)).toBe(false);
});
