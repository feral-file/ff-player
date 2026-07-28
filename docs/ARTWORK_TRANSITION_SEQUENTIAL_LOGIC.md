# Artwork Transition Sequential Logic

This document explains the transition model currently implemented in `src/components/artwork-player/ArtworkPlayer.tsx`.

## Overview

Artwork transitions in ArtworkPlayer to use a 2-slot overlay model with safer media lifecycle handling and improved transition stability.

- Implemented two-slot transition pipeline (slots[0|1]) with per-slot state:
  - previewURL, previewType, displayPreviewURL, displaySoftwareURL, mimeType, isStreaming, loading, iframeKey
- Added per-slot opacity/z-order transition control:
  - slotOpacity, activeSlot, topSlotIndex
- Added stale-transition guards:
  - incomingSlotRef, pendingReadySlotRef, transitionTokenRef, timeout cancellation
- Kept heavy embedded content (iframe, object) on sequential handoff to reduce performance/GPU pressure.
- Model MIME types now render through `ModelViewerScreen` directly inside `ArtworkPlayer` so glTF / GLB assets stay inside the playlist transition pipeline instead of falling back to the raw binary/object path.
- Model-viewer bootstrap/load failures still clear the loading indicators and commit the failed model slot so the error modal replaces the outgoing artwork instead of leaving the prior slot visible underneath it.
- Added per-slot media/HLS bookkeeping:
  - hlsInstancesRef, hlsLoadedURLRef, playedVideoURLRef
- Split streaming video setup by slot (avoid cross-slot teardown/re-attach side effects).
- Split media loading by slot (avoid one slot cleanup retriggering the other slot’s media pipeline).
- Unified video play gating in a reusable helper (playVideoForSlot) so target-slot and duplicate-play checks are consistent.
- Non-streaming video now uses media-loader path + loadeddata playback hook.

## 1) Core model: two slots (A/B)

Code references:

- `ArtworkPlayer.tsx` lines `43-76` (`SLOT_INDICES`, `SlotIndex`, `SlotLayer`, helpers)
- `ArtworkPlayer.tsx` lines `90-146` (slot state + refs)

The player uses two visual slots:

- `slots[0]` and `slots[1]`
- each slot holds one `SlotLayer`:
  - `previewURL`
  - `previewType`
  - `displayPreviewURL`
  - `displaySoftwareURL`
  - `mimeType`
  - `isStreaming`
  - `loading`
  - `iframeKey`

Only one slot is considered active at a time (`activeSlot`).  
The other slot is used as incoming during transitions.

## 2) Transition state refs

Code references:

- `ArtworkPlayer.tsx` lines `112-145` (`transitionTokenRef`, `transitionTimeoutRef`, `pendingReadySlotRef`, `incomingSlotRef`, `slotsRef`, `activeSlotRef`)

Important refs used to keep transitions deterministic:

- `incomingSlotRef`: which slot is currently the incoming target.
- `pendingReadySlotRef`: which slot reported "ready" and is waiting for transition execution.
- `transitionTokenRef`: monotonic token to cancel stale timeout callbacks.
- `transitionTimeoutRef`: timeout handle for delayed cleanup.

These prevent old async callbacks from taking over new transitions.

## 3) Start of a new artwork request (`previewURL` changed)

Code references:

- `ArtworkPlayer.tsx` lines `498-615` (`previewURL` effect)
- `ArtworkPlayer.tsx` lines `503-521` (cancel previous token + collapse stale overlay)
- `ArtworkPlayer.tsx` lines `532-547` (choose incoming slot and create layer)
- `ArtworkPlayer.tsx` lines `572-609` (type detection write with stale guards)

When `previewURL` changes:

1. Increment `transitionTokenRef` to invalidate old transition callbacks.
2. Clear existing `transitionTimeoutRef` if present.
3. Collapse stale overlay:
   - Keep only `activeSlot` visible.
   - Teardown and clear the non-active slot.
4. Mark global loading state and schedule delayed spinner.
5. Create a new incoming slot layer with a new `iframeKey`.
6. Detect MIME/preview type and patch that incoming slot only if URL is still current.

This avoids stale overlays and old artwork callbacks from blocking new content.

## 4) Media readiness and single-load behavior

Code references:

- `ArtworkPlayer.tsx` lines `263-299` (`markSlotReady`, `loadedSource`)
- `ArtworkPlayer.tsx` lines `393-487` (ready-consume transition effect)
- `ArtworkPlayer.tsx` lines `135-138` and `209-216` (`mediaLoaders`, `hlsInstancesRef`, `hlsLoadedURLRef`, `playedVideoURLRef`, teardown reset)
- `ArtworkPlayer.tsx` lines `301-391` (`playVideoForSlot`, `setupStreamingVideoForSlot`)
- `ArtworkPlayer.tsx` lines `653-782` (`setupMediaForSlot`)

Each slot has isolated media resources:

- `mediaLoaders.current[slot]` for image/video/audio blob loading.
- `hlsInstancesRef.current[slot]` for streaming video.
- `hlsLoadedURLRef.current[slot]` to avoid duplicate `loadSource()` on repeated attach cycles.
- `videoRefs/audioRefs/imageRefs/iframeRefs` are all per-slot.

Readiness rules:

- `loadedSource(slotIndex)` marks that slot ready.
- `markSlotReady` updates only if slot URL still matches current `previewURL`.
- `pendingReadySlotRef` is consumed in `useLayoutEffect` to run the actual transition.

Video duplicate-start guard:

- `playedVideoURLRef[slot]` ensures `video.play()` for a given slot+URL runs once.
- Reset during teardown.
- Streaming `loadSource()` is guarded by `hlsLoadedURLRef[slot]`.

### Streaming vs non-streaming split

- Streaming video setup is done in `setupStreamingVideoForSlot(...)` and mounted through two slot-specific effects.
- Non-streaming video setup is done in `setupMediaForSlot(...)`, where `loadeddata` triggers `playVideoForSlot(...)`.

## 5) Sequential vs overlap

Code references:

- `ArtworkPlayer.tsx` lines `430-487` (mode decision + sequential/overlap branches)

The transition mode is decided when incoming slot is ready:

- **Sequential** if either side is heavy embedded:
  - heavy embedded means `iframe`, `object`, `model`
- **Overlap crossfade** for other combinations

### Sequential flow

1. Fade outgoing to `0`, keep incoming at `0`.
2. Wait `FADE_IN_OUT_DURATION_MS`.
3. Remove outgoing slot completely.
4. Set incoming to visible (`1`).
5. Commit `activeSlot = incoming`.

### Overlap flow

1. Outgoing opacity `1 -> 0`.
2. Incoming opacity `0 -> 1`.
3. After duration, remove outgoing slot and commit active slot.

## 6) Video -> video crossfade mode (Option A)

With Option A, `video -> video` uses overlap crossfade (opacity blend), but the outgoing slot is still paused immediately.

Safety comes from two guards:

1. Immediate pause: `pauseSlotPlayback(outgoing)` runs before either branch starts. It pauses the media elements, resets the played-URL guard, and calls `stopLoad()` on any HLS instance — but deliberately does NOT `Hls.destroy()`. The synchronous destroy used to run inside the pre-paint layout effect that starts the fade, which janked the fade's opening frames (MediaSource detach + buffer free) and could blank the outgoing frame instead of freezing it. The full destroy now happens after the fade, via `setupStreamingVideoForSlot`'s effect cleanup, when the post-fade timeout removes the outgoing slot layer. `pauseAndTeardownSlot` (immediate destroy) still runs in the `previewURL` effect's stale-overlay collapse, where nothing is animating.
2. Readiness target guard: `loadedSource(slotIndex)` only marks the slot ready when that slot is the current transition target (`incomingSlotRef ?? activeSlot`).

The pause, the visible-slot gating in the `isOnline` effect (§7), and `playVideoForSlot`'s target-slot guard are what keep the hidden outgoing video from resuming — destroy timing is not load-bearing for that.

## 7) Online/offline playback safety

Code references:

- `ArtworkPlayer.tsx` lines `1011-1054` (visible/target-slot play gating; `isStreaming`-only connectivity pause)

The online effect now:

- plays video only for slots that are actually visible (`slotOpacity > 0.05`) and are the current transition target
- pauses hidden video slots (prevents hidden outgoing video from resuming and flashing)
- pauses on `!isOnline` **only when `layer.isStreaming` is true** (HLS/live, which must keep fetching new segments to progress)

Progressive/local video (`isStreaming: false`) is deliberately NOT paused by connectivity. Its bytes are either already buffered or served locally with no WAN dependency — this includes `feral-controld`'s offline-cache replay, which serves cached video via CDP `Fetch` interception or its local static blob server. Gating that on `isOnline` made cached video freeze like a still image during real offline playback even though playback could continue uninterrupted. Non-streaming video failures are still caught by the element's own `onerror` -> `handleMediaError('video')` path, so no connectivity-based pre-emptive pause is needed for it.

Any future change to this effect's play/pause conditions must preserve the `isStreaming` split above — collapsing it back to a blanket `isOnline` pause reintroduces the offline-cache freeze regression.

## 8) Stale callback protection summary

Code references:

- `ArtworkPlayer.tsx` lines `281-284` (ignore stale ready slot URL)
- `ArtworkPlayer.tsx` lines `289-294` (incoming-slot stale check)
- `ArtworkPlayer.tsx` lines `441-443`, `456-457`, `477-478` (token timeout guards)
- `ArtworkPlayer.tsx` lines `574-609` (ignore stale type detection results)

A callback is ignored if any of these are true:

- slot URL does not match current `previewURL`
- a different incoming slot already matches the current URL
- `transitionTokenRef` changed before timeout callback executes

This is the main mechanism that prevents old transitions from reappearing.

## 9) Latched visual settings (background / margin / scaling)

`displaySettings` (from `useArtworkSettings`) flips to the NEXT item's preferences the moment the playlist advances — but the incoming artwork only becomes visible after load + fade, often seconds later. The stage therefore renders from `committedVisualSettings`, a latched copy that swaps only when a transition commits (`setActiveSlot`):

- Container `backgroundColor` and `padding` (margin) — latched. A `background-color 0.2s` transition softens the commit-time swap in letterbox/margin areas.
- Image/video `objectFit` (scaling) — latched. Trade-off: during the crossfade the incoming slot briefly renders with the outgoing item's scaling (bounded by `FADE_IN_OUT_DURATION_MS`, at partial opacity). This is deliberately preferred over the old behavior, where the fully-visible outgoing artwork restyled seconds before the swap.
- Iframe `display_mode` URL rewriting — per-slot: only the slot currently claimed as the incoming transition target (`incomingSlotRef`) uses live settings; every other slot keeps committed settings. Otherwise the outgoing iframe's `displaySoftwareURL` changes at playlist-advance time and the iframe reloads (blanks) mid-display. The discriminator is deliberately `incomingSlotRef`, not a `previewURL` comparison, because adjacent playlist items can share the same URL while differing in scaling.
- `loop` / `autoPlay` — intentionally LIVE, not latched. They are behavioral (end-of-stream gating per DP-1 §4.1), not visual staging, and must reflect the current item immediately.

Commit points: the first-load path (no other layer), the sequential-mode midpoint timeout, and the overlap-mode end-of-fade timeout — all in the ready-consume effect.

Live escape hatch: settings changes that arrive while no transition is pending (e.g. the user adjusts background from the app for the artwork already on screen) apply immediately. "Pending" means an incoming slot is claimed (`incomingSlotRef` non-null), or the active slot's layer URL no longer matches the current `previewURL` (the gap before the slot-setup effect claims an incoming slot). Known edge: an image/iframe load failure leaves `incomingSlotRef` claimed, so live settings changes stay held until the next artwork request — the committed settings still match the artwork left on screen, so this is cosmetic-only for the live-adjust case.

## 10) Image pre-decode before ready

The image path awaits `img.decode()` before calling `loadedSource`, so a large image's first rasterization does not land on the first painted frame of the crossfade (which janked the fade on kiosk hardware). `decode()` rejections or absence fall back to marking ready anyway — painting undecoded is the old behavior, not an error — and `loadedSource`'s URL guard drops stale results.
