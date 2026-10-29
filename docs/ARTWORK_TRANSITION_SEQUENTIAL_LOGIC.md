# Artwork transitions

`ArtworkPlayer` composes the renderer owners. Its props and route callbacks are
stable interfaces; `CanvasService` remains the command/status interface.

## Owners

| Owner | State and responsibility |
|---|---|
| `ArtworkTransition` / `useArtworkTransition` | Two slot layers, selected target, active/incoming slot, opacity, transition tokens, showing latches, and accepted load/commit events. |
| `useArtworkSource` | MIME detection and software-URL selection for the current request. |
| `SlotMediaResources` / `useSlotMedia` | Elements, blob loaders, abort controllers, per-slot watchdogs, HLS instances, and media setup/cleanup. |
| `ArtworkRecovery` / `useArtworkRecovery` | Render lifecycle, overlay delay, retry budget, and degraded reporting. |
| `useWebGLRecovery` | GPU probe, context events, and recovery interval. |
| `useCommittedComposition` | Selected versus committed visual settings and the layout-phase composition reporter. |
| `useWorkOriginFrame` | Authenticated shell handshake and private-channel completion. |
| `ArtworkStage` / `ArtworkSlot` | Presentation of the committed snapshot and media-specific DOM. |

Controllers retain private mutable state. Other owners call operations or read
snapshots. React owns the visible state; layout effects publish committed props
and slot snapshots before browser events can observe them. An effect's dependency
list must preserve its resource lifetime, not merely silence the hooks rule.

## Slot identity and request setup

A layer carries source URLs, MIME/preview type, streaming/loading state, an
`iframeKey`, item identity, and showing key. Guards distinguish all of these:

- URL changes include same-item source replacement.
- Item identity distinguishes adjacent entries sharing a URL.
- Showing key distinguishes repeated showings of the same item and source.
- `iframeKey` distinguishes recreated elements and rejects an older mount's
  completion where the caller supplies its layer.
- Transition tokens invalidate an obsolete fade timeout.

The playlist's internal showing key is a JSON tuple of slot index, item identity,
and source. Controller-visible showing identity is an opaque UUID; internal
source-bearing identities must not escape in status.

A request invalidates the previous fade, removes the stale non-active layer,
publishes pending, arms the loading delay, and creates an incoming layer. It
resets that mount's failure and played latches. MIME results apply only while
that request remains current. Unknown/unconfirmed types use iframe fallback;
corroborated-offline detection follows the separate recovery contract.

The active layer remains mounted while incoming media loads. The delayed global
loading overlay can cover it; retaining the outgoing slot does not imply that
it remains visible through an opaque overlay.

## Accepted readiness and callback timing

A media completion must pass the current slot/URL/item/showing checks. A different
incoming slot that still owns the requested source rejects a competing claim.
Only a loading-to-settled change queues transition processing; repeated load
events cannot requeue an already-settled transition.

| Path | `onItemCommitted` / successful `onItemPlayed` | Settings latch, active slot, and `ready` |
|---|---|---|
| First load, no outgoing layer | Immediately on accepted readiness. | Immediately. |
| Overlap crossfade | At fade start. | At fade end, after 650 ms. |
| Sequential handoff | At the handoff after outgoing fade-out, 650 ms. | At that same handoff. |

`onItemCommitted` also fires for failed transitions. `onItemPlayed` is withheld
for failures and fires at most once per showing. The delayed history callback
reads the latest cast context. Do not combine these callbacks with `ready` into
one event: they intentionally have different timing and success conditions.

A genuine late success after a failed load cancels its retry, restores readiness,
and supplies a played callback if that showing has none. It does not cancel a
pending sequential handoff. The same per-showing latch prevents its later
handoff or another iframe load from recording playback again. A successful
played callback may return a recovery receipt. A later genuine success for that
same showing invokes the receipt to restore its history occurrence; the history
owner rejects receipts invalidated by a stop or a newer commit.

## Fade modes and media lifetime

The transition is sequential when either side is iframe, object, or model.
Other combinations overlap, including video-to-video and PDF. A PDF's longer
watchdog does not make it a sequential-transition type.

Both modes pause outgoing video/audio and stop HLS network loading at fade start.
They retain the outgoing element and HLS instance until removal:

- Sequential: set both opacities to zero; after 650 ms remove outgoing, latch
  settings, and start incoming fade-in.
- Overlap: fade outgoing to zero and incoming to one together; after 650 ms
  remove outgoing and latch settings.

Full HLS destruction occurs on outgoing slot cleanup after the fade. Stale-layer
collapse on a new request may tear it down immediately. One slot's cleanup must
not abort, destroy, or clear another slot's resources.

Ordinary media setup keys on display URL, preview type, streaming flag, item
identity, and showing key. HLS setup keys on display URL, preview type, and
streaming flag. A WebGL iframe-key-only reload does not rerun those effects.
The watchdog has a separate lifetime keyed by the ordinary-media keys plus the
element's iframe key. It gets a fresh deadline on recovery reload and cancels on
replacement or unmount. Only a still-current pending/loading slot can fail.

Video plays only when visible (opacity above 0.05) and the current target.
Offline connectivity pauses streaming video only; buffered/local video remains
playable. Source-ended callbacks carry item identity and reject mismatched URL,
item, or showing state.

Images await `decode()` before accepted readiness. Missing/rejected decode falls
back to ordinary readiness; it is not a terminal failure. Every element-specific
listener and media fetch belongs to its setup attempt.

## Visual composition

Background, margin, and image/video scaling use committed visual settings.
Selection can run ahead during loading, so reading selected settings directly
would restyle the outgoing work. Both fade layers occupy the same inner viewport
inside the stage's matte; cursor and global overlays cover the full screen.

During an overlap, the incoming work briefly uses outgoing scaling until the
fade-end latch. Iframe `display_mode` is per-slot: the incoming target uses
selected settings; other layers retain committed settings. A data-document slot
keeps its chosen origin/blob path. `loop` and `autoPlay` remain live behavioral
settings rather than visual latches.

Same-showing adjustments apply in layout when no transition is pending. The
composition reporter carries the committed showing and whether it can accept
updates. Its revision must settle before a later command is accepted. Failed
incoming slots still release the transition latch so later adjustments can apply.

## Loading and failure presentation

The 2 s loading delay belongs to the load attempt. Accepted transition readiness
cancels it immediately, preventing a timer from raising an overlay during a fade.
An overlay already raised stays until ready. `showRenderLoadingOverlay` gates
presentation only. A visible, loading model uses its own overlay; an invisible
incoming model does not suppress the global one.

Failure publishes failed and removes the loading overlay at the failure site,
rather than waiting for the fade. A failed layer still completes the handoff,
with the error modal above it and no successful-played callback. Failure budget,
offline recovery, and current limitations are defined in
[Device-local player](DEVICE_LOCAL_PLAYER.md#render-status-and-bounded-failures).

Work-origin frames ignore the outer shell's load/error events. Only its verified
private-channel completion reaches the ordinary artwork load/failure path;
[the device contract](DEVICE_LOCAL_PLAYER.md#artwork-sources-and-isolated-data-documents)
owns hashing, sandbox, port, and shell rules.
