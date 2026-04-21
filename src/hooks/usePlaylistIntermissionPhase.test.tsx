/**
 * Tests for `usePlaylistIntermissionPhase`: playlist note (before first item),
 * per-item notes, dismissal, playlist key, and regressions.
 *
 * Overlay interrupt on context change is owned by `PlaylistClient`, not this
 * hook, so it is exercised in `playlist-client.test.tsx`.
 */
import type { DP1IntermissionNote, DP1Item } from '@/models/dp1.model';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePlaylistIntermissionPhase } from './usePlaylistIntermissionPhase';

interface HookProps {
  playlistKey: string;
  playlistLevelNote: DP1IntermissionNote | undefined;
  currentItem: DP1Item | undefined;
  currentIndex: number;
}

function note(text: string): DP1IntermissionNote {
  return { text };
}

function item(id: string, noteText?: string): DP1Item {
  return {
    id,
    source: `https://example.com/${id}.jpg`,
    license: {},
    note: noteText ? note(noteText) : undefined,
  } as DP1Item;
}

describe('usePlaylistIntermissionPhase — playlist note rendering', () => {
  it('shows playlist intro on first render when note exists', () => {
    const { result } = renderHook(() =>
      usePlaylistIntermissionPhase({
        playlistKey: 'pl-1',
        playlistLevelNote: note('Welcome'),
        currentItem: item('a'),
        currentIndex: 0,
      })
    );
    expect(result.current.phase).toBe('playlistIntro');
    expect(result.current.activeNote?.text).toBe('Welcome');
  });
  it('does not show playlist intro if note is empty', () => {
    const { result } = renderHook(() =>
      usePlaylistIntermissionPhase({
        playlistKey: 'pl-1',
        playlistLevelNote: note('   '),
        currentItem: item('a'),
        currentIndex: 0,
      })
    );
    expect(result.current.phase).toBe('artwork');
  });
});

describe('usePlaylistIntermissionPhase — playlist note dismissal', () => {
  it('dismisses playlist intro after calling completePlaylistIntro', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'pl-1',
          playlistLevelNote: note('Welcome'),
          currentItem: item('a'),
          currentIndex: 0,
        },
      }
    );
    expect(result.current.phase).toBe('playlistIntro');
    result.current.completePlaylistIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: note('Welcome'),
      currentItem: item('a'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
  });
  it('does not show playlist intro if already dismissed for that playlistKey', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'pl-1',
          playlistLevelNote: note('Welcome'),
          currentItem: item('a'),
          currentIndex: 0,
        },
      }
    );
    result.current.completePlaylistIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: note('Welcome'),
      currentItem: item('b'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
  });
});

describe('usePlaylistIntermissionPhase — playlist key change resets dismissal', () => {
  it('resets dismissal when playlistKey changes (refresh/shuffle/recovery)', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'pl-1',
          playlistLevelNote: note('Welcome to Playlist 1'),
          currentItem: item('a'),
          currentIndex: 0,
        },
      }
    );
    result.current.completePlaylistIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: note('Welcome to Playlist 1'),
      currentItem: item('a'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
    rerender({
      playlistKey: 'pl-2',
      playlistLevelNote: note('Welcome to Playlist 2'),
      currentItem: item('x'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('playlistIntro');
    expect(result.current.activeNote?.text).toBe('Welcome to Playlist 2');
  });
});

describe('usePlaylistIntermissionPhase — stable playlist id replacement', () => {
  it('resets dismissal when stable playlist.id is replaced with epoch suffix', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'stable_0',
          playlistLevelNote: note('Original playlist intro'),
          currentItem: item('a'),
          currentIndex: 0,
        },
      }
    );
    expect(result.current.phase).toBe('playlistIntro');
    result.current.completePlaylistIntro();
    rerender({
      playlistKey: 'stable_0',
      playlistLevelNote: note('Original playlist intro'),
      currentItem: item('a'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
    rerender({
      playlistKey: 'stable_1',
      playlistLevelNote: note('Refreshed playlist intro'),
      currentItem: item('b'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('playlistIntro');
    expect(result.current.activeNote?.text).toBe('Refreshed playlist intro');
  });
});

describe('usePlaylistIntermissionPhase — midstream start (playlist note)', () => {
  it('does not show playlist intro when starting at index > 0', () => {
    const { result } = renderHook(() =>
      usePlaylistIntermissionPhase({
        playlistKey: 'midstream-playlist',
        playlistLevelNote: note('Welcome note'),
        currentItem: item('item-5'),
        currentIndex: 5,
      })
    );
    expect(result.current.phase).toBe('artwork');
  });
  it('shows playlist intro after navigating to index 0 from midstream start', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'seek-test',
          playlistLevelNote: note('Welcome note'),
          currentItem: item('item-5'),
          currentIndex: 5,
        },
      }
    );
    expect(result.current.phase).toBe('artwork');
    rerender({
      playlistKey: 'seek-test',
      playlistLevelNote: note('Welcome note'),
      currentItem: item('item-0'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('playlistIntro');
  });
  it('shows playlist intro on wrap to index 0 after midstream start', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'wrap-test',
          playlistLevelNote: note('Welcome to loop'),
          currentItem: item('last-item'),
          currentIndex: 9,
        },
      }
    );
    expect(result.current.phase).toBe('artwork');
    rerender({
      playlistKey: 'wrap-test',
      playlistLevelNote: note('Welcome to loop'),
      currentItem: item('first-item'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('playlistIntro');
  });
});

describe('usePlaylistIntermissionPhase — refresh at index > 0 (playlist note)', () => {
  it('does not show playlist intro after refresh/shuffle at index > 0', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'refresh-0',
          playlistLevelNote: note('Original note'),
          currentItem: item('a'),
          currentIndex: 0,
        },
      }
    );
    expect(result.current.phase).toBe('playlistIntro');
    result.current.completePlaylistIntro();
    rerender({
      playlistKey: 'refresh-0',
      playlistLevelNote: note('Original note'),
      currentItem: item('a'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
    rerender({
      playlistKey: 'refresh-1',
      playlistLevelNote: note('Refreshed note'),
      currentItem: item('f'),
      currentIndex: 5,
    });
    expect(result.current.phase).toBe('artwork');
  });
});

describe('usePlaylistIntermissionPhase — item note after playlist note', () => {
  it('shows item intro after playlist intro is dismissed', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'pl-1',
          playlistLevelNote: note('Welcome'),
          currentItem: item('a', 'Item A note'),
          currentIndex: 0,
        },
      }
    );
    expect(result.current.phase).toBe('playlistIntro');
    result.current.completePlaylistIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: note('Welcome'),
      currentItem: item('a', 'Item A note'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('itemIntro');
    expect(result.current.activeNote?.text).toBe('Item A note');
  });
  it('shows item intro when no playlist note exists', () => {
    const { result } = renderHook(() =>
      usePlaylistIntermissionPhase({
        playlistKey: 'pl-1',
        playlistLevelNote: undefined,
        currentItem: item('a', 'Item A note'),
        currentIndex: 0,
      })
    );
    expect(result.current.phase).toBe('itemIntro');
    expect(result.current.activeNote?.text).toBe('Item A note');
  });
});

describe('usePlaylistIntermissionPhase — item note dismissal', () => {
  it('dismisses item intro after calling completeItemIntro', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'pl-1',
          playlistLevelNote: undefined,
          currentItem: item('a', 'Item A note'),
          currentIndex: 0,
        },
      }
    );
    expect(result.current.phase).toBe('itemIntro');
    result.current.completeItemIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: undefined,
      currentItem: item('a', 'Item A note'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
  });
  it('reopens item intro for different item ID (refresh/shuffle at same index)', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'pl-1',
          playlistLevelNote: undefined,
          currentItem: item('a', 'Item A note'),
          currentIndex: 0,
        },
      }
    );
    result.current.completeItemIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: undefined,
      currentItem: item('a', 'Item A note'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: undefined,
      currentItem: item('b', 'Item B note'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('itemIntro');
    expect(result.current.activeNote?.text).toBe('Item B note');
  });
});

describe('usePlaylistIntermissionPhase — item note no replay on same occurrence', () => {
  it('does not replay item intro on same occurrence (loop-one / single-item wrap)', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'pl-1',
          playlistLevelNote: undefined,
          currentItem: item('a', 'Item A note'),
          currentIndex: 0,
        },
      }
    );
    result.current.completeItemIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: undefined,
      currentItem: item('a', 'Item A note'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: undefined,
      currentItem: item('a', 'Item A note'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
  });
});

describe('usePlaylistIntermissionPhase — item note playlistKey change', () => {
  it('clears item dismissal when playlistKey changes', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'pl-1',
          playlistLevelNote: undefined,
          currentItem: item('a', 'Item A note'),
          currentIndex: 0,
        },
      }
    );
    result.current.completeItemIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: undefined,
      currentItem: item('a', 'Item A note'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
    rerender({
      playlistKey: 'pl-2',
      playlistLevelNote: undefined,
      currentItem: item('a', 'Item A note'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('itemIntro');
    expect(result.current.activeNote?.text).toBe('Item A note');
  });
});

describe('usePlaylistIntermissionPhase — item note duplicate IDs', () => {
  it('shows item intro for each occurrence of the same item ID', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'pl-1',
          playlistLevelNote: undefined,
          currentItem: item('a', 'Intro for A'),
          currentIndex: 0,
        },
      }
    );
    expect(result.current.phase).toBe('itemIntro');
    expect(result.current.activeNote?.text).toBe('Intro for A');
    result.current.completeItemIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: undefined,
      currentItem: item('a', 'Intro for A'),
      currentIndex: 0,
    });
    expect(result.current.phase).toBe('artwork');
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: undefined,
      currentItem: item('b', 'Intro for B'),
      currentIndex: 1,
    });
    expect(result.current.phase).toBe('itemIntro');
    result.current.completeItemIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: undefined,
      currentItem: item('a', 'Intro for A'),
      currentIndex: 2,
    });
    expect(result.current.phase).toBe('itemIntro');
    expect(result.current.activeNote?.text).toBe('Intro for A');
  });
  it('tracks dismissal per occurrence, not globally by ID', () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePlaylistIntermissionPhase(props),
      {
        initialProps: {
          playlistKey: 'pl-1',
          playlistLevelNote: undefined,
          currentItem: item('a', 'Note A'),
          currentIndex: 1,
        },
      }
    );
    expect(result.current.phase).toBe('itemIntro');
    result.current.completeItemIntro();
    rerender({
      playlistKey: 'pl-1',
      playlistLevelNote: undefined,
      currentItem: item('a', 'Note A'),
      currentIndex: 3,
    });
    expect(result.current.phase).toBe('itemIntro');
  });
});
