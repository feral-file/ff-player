# Playlist to ArtworkPlayer Use Cases

## Purpose

This document defines the runtime contract from `src/app/playlist/playlist-client.tsx` to `src/components/artwork-player/ArtworkPlayer.tsx`.

Use it when changing playlist state, cast commands, media loading, timing, loop/shuffle behavior, or artwork rendering. The goal is to avoid state mismatches and provide a repeatable test checklist before merging.

## System Boundary

- `PlaylistClient` owns playlist-level state:
  - active playlist items (as provided by `CanvasService` / cast state)
  - active index
  - `startTime`
  - queued playlist replacement
  - pause/resume timing
  - enforcement of loop and shuffle behavior at the timer/index level
  - merged display preferences for the current item
- `CanvasService` owns controller/cast-level state:
  - source playlist (`CastInfo.playlist`) and its current ordering
  - loop and shuffle mode flags (`loopMode`, `shuffle`)
  - shuffle order computation and restoration from `originalPlaylistItems`
- `ArtworkPlayer` owns item-level rendering:
  - media type detection
  - loading state
  - iframe/image/video/audio/object rendering
  - scaling and margin application
  - network-sensitive playback
  - WebGL crash recovery for iframe content

## Data Contract

### Inputs from `PlaylistClient` to `ArtworkPlayer`

- `previewURL`
  - Must always point to the currently selected playlist item source.
  - Must change when the visible artwork changes.
- `displayPreferences`
  - Must already be fully merged before render.
  - Merge priority is:
    1. playlist defaults
    2. `item.ref` manifest display
    3. `item.override.display`
    4. `item.display`

### Inputs from cast state to `PlaylistClient`

- `castInfo.castCommand`
  - Drives playlist state transitions.
- `castInfo.startTime`
  - Acts as the wall-clock anchor for calculating the current item.
- `castInfo.index`
  - Used for explicit jumps and controller-driven navigation.
- `castInfo.isPaused`, `elapsedTime`, `remainTime`
  - Control pause and resume behavior.
- `castInfo.playlist.items`
  - Source of truth for initial display, refresh, and shuffle.
- `castInfo.loopMode`
  - Controls stop-at-end, replay-playlist, or replay-current-item behavior.

## End-to-End Flow

1. `PlaylistClient` receives `castInfo`.
2. `castCommand` is dispatched to a handler.
3. The handler updates playlist state, timer state, or queued playlist state.
4. When `currentIndex` changes, `PlaylistClient`:
   - normalizes the index against playlist length
   - sets `currentItemRef`
   - merges display preferences
   - sets `castPreviewURL`
   - starts the timer unless paused
5. `ArtworkPlayer` receives the new `previewURL` and `displayPreferences`.
6. `ArtworkPlayer`:
   - detects media type from MIME or URL response
   - delays the loading spinner by 2 seconds
   - loads the media with CORS-aware helpers when needed
   - renders the proper HTML element
   - marks the item loaded and reveals it

## Core Invariants

- `currentIndex` must always refer to a valid item when `playlist.length > 0`.
- `castPreviewURL` must match `playlist[currentIndex % playlist.length].source`.
- `currentItemDisplayPreference` must belong to the same item as `currentItemRef`.
- `startTime` must always describe the same playlist ordering that `getIndex()` uses.
- `startInterval()` must never run with stale playlist, stale index, or stale duration.
- `queuedPlaylistRef` must be applied only at a boundary or at an explicit command that is designed to swap immediately.
- `ArtworkPlayer` must derive its visible state only from the current `previewURL` and `displayPreferences`.
- A stale async MIME lookup or media load must not win after `previewURL` changes.

## Playlist Use Cases

### 1. Initial playlist display

Expected behavior:

- `displayPlaylist` resets prior playback state.
- Playlist defaults are loaded.
- `startTime` is applied from `castInfo`.
- `currentIndex` is derived from `getIndex(playlist, startTime)`.
- `ArtworkPlayer` receives the selected item source and merged display settings.

Must verify:

- first visible item matches expected timeline position
- correct display preference precedence
- timer starts when not paused

### 2. Normal timed progression

Expected behavior:

- `startInterval(duration)` schedules the next `updateIndex`.
- `getIndex(playlist, startTimeRef.current)` resolves the next visible item.
- `currentIndex` updates once per item duration.

Must verify:

- no double-advance
- no skipped item
- correct rollover in playlist loop mode

### 3. Pause casting

Expected behavior:

- timer is cleared
- `elapsedTimeRef` and `remainTimeRef` are stored from cast state
- visible artwork remains unchanged

Must verify:

- no index change while paused
- resuming continues from the same artwork position

### 4. Resume casting

Expected behavior:

- queued playlist is applied first if present
- otherwise `startTime` is restored from cast state
- duration restarts from `remainTimeRef`, or falls back to the current item duration

Must verify:

- resume after pause mid-item
- resume after offline to online transition
- resume while a queued playlist exists

### 5. Next artwork

Expected behavior:

- current timer is cleared
- `currentIndex` becomes the controller-provided target index
- `startTime` is updated to match the new index anchor
- `ArtworkPlayer` updates immediately

Must verify:

- no flash of previous item after navigation
- correct item chosen after repeated rapid next commands

### 6. Previous artwork

Expected behavior:

- same contract as next, but with the prior item index

Must verify:

- previous from first item behaves correctly for the active loop mode

### 7. Move to a specific artwork

Expected behavior:

- `moveToArtwork` uses the explicit target index
- if a queued playlist is applied first, the target index is normalized against the new ordering

Must verify:

- jumping into the middle of the playlist
- jumping while a queued playlist is pending

### 8. Update duration

Expected behavior:

- durations are replaced by item id
- active item timer restarts with the new duration
- `startTime` stays aligned with cast state

Must verify:

- duration change on current item
- duration change on non-current items
- duration `0`
- duration `NO_DURATION_VALUE`

### 9. Refresh playlist at boundary

Expected behavior:

- `refreshPlaylist` does not interrupt the current item
- new playlist is queued in `queuedPlaylistRef`
- queued playlist is swapped in at the next interval boundary
- next item is resolved against the new playlist

Must verify:

- current item keeps playing uninterrupted
- next item comes from the refreshed playlist
- no stale timer survives the swap

### 10. Shuffle

Expected behavior:

- shuffle mode and the shuffled ordering are computed in `CanvasService`:
  - when enabled, the current item is anchored and moved to position `0`
  - the remaining items are shuffled and appended after the current item
- the shuffled order is then queued in `PlaylistClient`, not applied mid-item
- current item continues uninterrupted
- next boundary moves into the shuffled order

Must verify:

- current item remains the same after shuffle command
- next item follows the shuffled order, not the old order
- unshuffling restores the original order and re-anchors the current item by id

### 11. Loop mode: `none`

Expected behavior:

- playback stops when the last item finishes
- timer is cleared
- playlist does not wrap

Must verify:

- last item ends and no next item is shown

### 12. Loop mode: `playlist`

Expected behavior:

- `getIndex()` wraps based on elapsed wall-clock time
- playback continues from the beginning after the last item

Must verify:

- last item transitions to first item
- timeline anchor still produces the expected item after a long run

### 13. Loop mode: `one`

Expected behavior:

- timer triggers `updateIndex` for the current item again
- `startTime` is recalculated for the current real index
- playlist does not drift forward in wall-clock terms

Must verify:

- current item repeats indefinitely
- switching from loop-one back to playlist or none does not jump unexpectedly
- loop-one still works after shuffle or refresh

### 14. Offline to online

Expected behavior:

- offline pauses playback
- online resumes playback
- visible media state remains consistent with current item

Must verify:

- video pauses and resumes
- timer state resumes at the correct position

## ArtworkPlayer Use Cases

### 1. MIME detection by explicit MIME type

Expected behavior:

- if `artworkPreviewMIMEType` exists, it is used directly
- no network MIME probe should override it

Must verify:

- explicit MIME type wins over response content-type

### 2. MIME detection by URL response

Expected behavior:

- `getContentTypeFromURL()` determines the preview type
- stale async responses are ignored after `previewURL` changes

Must verify:

- rapid artwork changes do not end with the wrong media element rendered

### 3. Image rendering

Expected behavior:

- `<img>` loads through `mediaLoader`
- scaling maps to correct `object-fit`
- `loadedSource()` clears loading state

Must verify:

- JPG/PNG/WebP
- large image
- CORS-hosted image

### 4. SVG rendering

Expected behavior:

- SVG MIME should render as `<object>` for the current implementation
- this protects scripted or interactive SVG behavior from being treated like a plain image

Must verify:

- static SVG
- scripted SVG

### 5. HTML/object rendering

Expected behavior:

- `<object>` is used for object-like content
- load completion clears loading state

Must verify:

- HTML artwork
- object content with internal scripts

### 6. Iframe rendering

Expected behavior:

- `<iframe>` uses `displaySoftwareURL`
- `display_mode` query is updated from scaling for iframe content
- successful load checks WebGL availability before revealing content

Must verify:

- scaling `fit`
- scaling `fill`
- base64 source should not have `display_mode` appended

### 7. PDF iframe rendering

Expected behavior:

- PDF content renders in iframe mode
- load completion clears loading state

Must verify:

- PDF load success
- PDF load failure

### 8. Non-streaming video

Expected behavior:

- video is loaded via `mediaLoader`
- playback starts after `loadeddata`
- autoplay failures retry muted
- click unmutes video

Must verify:

- MP4 playback
- muted retry path
- manual unmute
- online/offline pause and resume

### 9. Streaming video (`.m3u8`)

Expected behavior:

- HLS attaches when supported
- source is loaded with `clientBandwidthHint`
- media errors attempt recovery for buffer stall cases

Must verify:

- HLS startup
- temporary network interruption
- recoverable media stall

### 10. Audio playback

Expected behavior:

- audio is loaded via `mediaLoader`
- `loadeddata` clears loading state
- autoplay and loop follow display preferences

Must verify:

- MP3 or AAC playback
- pause/resume through playlist controls

### 11. Slow-loading media spinner

Expected behavior:

- spinner appears only after 2 seconds
- fast loads should not flash the spinner
- images/iframes/objects should not show the delayed spinner unless still unresolved

Must verify:

- fast image
- slow video
- slow audio
- rapid item change before 2 seconds

### 12. WebGL loss and recovery

Expected behavior:

- iframe load checks WebGL support
- WebGL loss hides artwork and shows modal
- recovery polling retries iframe reload after availability returns

Must verify:

- load failure modal
- WebGL unavailable on load
- recovery timeout path

## Mismatch Risks Engineers Must Watch

### Playlist mismatches

- Changing `currentIndex` without updating `castPreviewURL`
- Updating `playlist` without resetting `indexRef` when the resolved item should be reconsidered
- Recalculating `startTime` against a different playlist order than `getIndex()` uses
- Applying queued playlists immediately when the UX contract says boundary-only
- Restarting timers before state updates settle

### Display preference mismatches

- Passing raw item display data to `ArtworkPlayer` without the full merge
- Updating display precedence in one place without updating this contract
- Forgetting that `item.ref` fetch is async and stale responses must be ignored

### Player mismatches

- Changing MIME mapping without updating the test matrix
- Removing stale-request guards around async media type detection
- Changing loading state semantics so the spinner no longer reflects real readiness
- Updating iframe query behavior without testing `fit`, `fill`, and base64 sources
- Changing online/offline behavior without testing active video playback

## Pre-Commit Test Matrix

Run these scenarios before merging any change that touches playlist or rendering code.

- Display a playlist with at least 3 items and verify initial item selection from `startTime`.
- Let timed progression run through at least 2 transitions.
- Pause mid-item, wait, then resume and verify the item continues from the same position.
- Trigger `nextArtwork`, `previousArtwork`, and `moveToArtwork` repeatedly.
- Refresh the playlist during playback and confirm the current item is not interrupted.
- Shuffle during playback and confirm the next boundary follows the shuffled order.
- Test loop mode `none`, `playlist`, and `one`.
- Test duration update on the current item and a later item.
- Test image, SVG, iframe HTML, PDF iframe, MP4, HLS, and audio.
- Test one CORS-hosted media file per type that uses `mediaLoader`.
- Test online to offline to online while video is playing.
- Test iframe content on a device or browser profile where WebGL can fail or be disabled.
- Test a rapid sequence of navigation commands to expose stale async updates.

## Recommended Fixtures

- Playlist A: 3 static images, short durations
- Playlist B: image + iframe + MP4
- Playlist C: HLS + audio + PDF
- Playlist D: same items as A, shuffled
- Playlist E: changed durations for current and next item

## Change Review Questions

- Did this change alter who owns timing state: cast state, playlist state, or player state?
- Did this change alter when `startTime` is recalculated?
- Did this change alter when timers start, stop, or restart?
- Did this change alter which media element renders for a MIME type?
- Did this change alter when loading is considered complete?
- Did this change alter the boundary between current-item continuity and next-item transition?
- Did this change introduce any async path that can resolve after `previewURL` or `currentIndex` has already changed?

## Definition of Done for Playlist/Player Changes

- The state ownership remains clear.
- The invariants in this document still hold.
- Every affected use case above has been manually tested.
- Any new use case introduced by the change has been added to this document.
