# Device-local FF Player (FF1)

The FF1 player is the static Next.js export served by FF OS. This document
states the device runtime and compatibility contracts. Transition mechanics
live in [Artwork transitions](ARTWORK_TRANSITION_SEQUENTIAL_LOGIC.md);
verification procedures live in [Verification](verification.md).

## Build, hosting, and updates

- `npm run build` produces `out/` using `output: 'export'`. FF OS owns the
  installation paths, HTTP servers, and image/OTA delivery.
- Serve the bundle at `http://127.0.0.1:8080/`. The logging proxy accepts
  exactly that origin. Subpaths require a matching Next `basePath` and asset
  and routing verification. `file://` is unsupported: assets and routes use
  ordinary web origins and root-relative paths.
- The device export sets `NEXT_PUBLIC_DISABLE_VERSION_CHECK=true` and updates
  with the device image or updater. The web build retains `version.json`
  polling; nothing deploys that build.
- `public/ffos-player-contract.json` is the deploy-time capability manifest.
  Controllers must feature-detect contracts there; an absent live status field
  can mean a supported lifecycle has not reported yet.

## Runtime configuration

`RemoteConfigService` reads `${NEXT_PUBLIC_PUB_DOC_URL}/configs/display.json`,
or same-origin `/configs/display.json` when that environment variable is empty.

| Key | Rule |
|---|---|
| `duration` | Browser version-polling interval. |
| `defaultPlaylistURL` | Source of fallback playback. |
| `showRenderLoadingOverlay` | Controls visible loading overlays, not status codes. |

Other published keys are ignored. A failed read returns local defaults without
caching them. The first successful remote read wins for the page lifetime;
concurrent reads converge on it. AppContext must publish that successful cached
result even if the effect that initiated it has been superseded.

## Playback ownership

- `CanvasService` is the stable command and route facade.
- `canvas/PlaybackSession` owns live cast state, render-status continuity,
  shuffle order, deferred refresh, and parked artwork refreshes.
- `canvas/PlaylistCommands` applies admission and policy rules before changing
  the session or scheduling work. `canvas/BootPlaylistStore` serializes boot
  writes and refresh supersession against the owning cast.
- `canvas/PlaybackRecovery` owns hydration, halt, sleep/wake, and conditional
  default ordering. AppContext owns fetching and retrying the fallback playlist.
- `canvas/RecentPlaybackService` owns durable history and active-occurrence
  knowledge. Selection alone is never evidence that a work played.
- `canvas/DisplaySettingsService` owns composition identity and revision-based
  command acceptance; the mounted renderer supplies the committed composition.
- `ArtworkPlayer` composes transition, source, media, recovery, and composition
  owners. A slot's load event is not interchangeable with visual commitment.

## Render status and bounded failures

Status replies expose optional numeric `renderStatus`: `0` pending, `1` loading,
`2` ready, `3` failed. It describes the current page mount only. Persistence and
boot recovery strip it. After hydration it may be absent until the renderer
reports; `contracts.renderStatus` distinguishes that case from unsupported builds.

A selected artwork change is identified by both ID and source. It immediately
publishes pending, including same-ID source replacement. An unchanged selection
preserves its lifecycle. Renderer status updates do not re-emit cast commands or
restart playlist timers.

`ready` means load completion accepted by the transition pipeline, with the
loading overlay removed. It is not verification of painted content. On first
load it publishes immediately; ordinary transitions publish it at the fade's
handoff/end, 650 ms after accepted readiness. The transition contract specifies
the distinct callback and composition timings.

- The loading overlay has a 2 s delay. Accepting a slot for transition disarms
  that delay; an already-visible overlay remains until ready or failure.
- Ordinary terminal load failures use a per-item budget with limit `3`: the
  first two failures schedule an in-place retry after 3 s; the third calls
  `onArtworkExhausted`. A new item or genuine success resets the budget. A
  same-item remount cancels the old timer but retains the budget.
- A non-streaming load attempt gets a per-slot watchdog when its load mechanism
  is ready: 15 s for image/video/audio, 45 s for iframe/object/model/PDF. Failure
  aborts that slot's pending media fetch. HLS uses its own error classification:
  fatal errors enter the failure budget; non-fatal errors remain with hls.js.
- A late genuine success cancels retry, restores readiness, and records played
  at most once for that showing. Failed slots still complete the visual handoff
  so settings do not remain held behind an abandoned incoming slot.
- Corroborated-offline MIME detection reports failed and degraded, without a
  fallback iframe or artwork-error modal. Offline recovery owns that case.
- WebGL recovery polls every 5 s for up to 10 minutes. On availability, it waits
  2 s and reloads the active iframe key. Recovery completion or timeout resumes
  an item retry suspended by GPU loss without charging another attempt. Each
  reloaded element receives a fresh watchdog; a stalled iframe recovery fails
  after 45 s and enters the ordinary bounded retry/advance path.
- Exhaustion follows the playlist's ordinary advance path, including queued
  replacements. When repeat-one or repeat-off's final slot has no next target,
  it starts another bounded retry cycle in place.

Current limitations that callers must preserve:

- Chromium can emit iframe/PDF `load` for its own navigation-error page. Such a
  load may report ready; the player cannot inspect a cross-origin document.
- For the first ordinary media/model/iframe error on a newly degraded URL,
  AppContext's M7 recovery can request an immediate reload and shorten the
  nominal 3 s retry pacing. Watchdog and fatal-HLS failures do not raise that
  degraded signal. The failure budget still bounds attempts.

## Recently played

`getRecentlyPlayed` returns a bounded reverse-chronological timeline of successful
showings. Retention limits and replay projection live in `recentPlaybackHistory`.
Clearing playback preserves the timeline; restoring a persisted cast does not
itself append a record.

`activeOccurrenceKnown` answers whether the device can identify a retained
record as the work on the wall:

| Situation | Answer |
|---|---|
| Restart before the first commit | Unknown/pending. |
| Successful commit awaiting a durable append | Unknown/pending. |
| Durable append for the current showing | Known; its record is active. |
| Record omitted as oversize | Known; no retained record is active. |
| Disconnect, sleep, error navigation, empty cast, or blocked visible work | Known; no retained record is active. |
| Failed render | Unknown/pending until genuine recovery, a later commit, or stop. |

An allowed outgoing work remains active while its replacement loads. Policy
changes that leave it playing do not retire it. Generation checks prevent an
append or oversize omission settling after a stop/new commit from claiming the
current occurrence. Timestamps are captured at commitment, before queued storage.

A failed append reports an error and marks the timeline incomplete. The player
tries to persist the gap marker; a later successful append clears the error only
after making that marker durable. If even the marker write fails, the gap is
known only for that page lifetime. An unreadable history starts empty and
incomplete, allowing subsequent commits to rebuild it.

Failure suspends the current occurrence. Each successful commit returns a
session-only recovery receipt to its renderer. Genuine recovery of that same
showing restores its occurrence without appending a duplicate; a pending write
must still settle before history becomes known. Stops and newer commits
invalidate older receipts. A bare `ready` status cannot restore an occurrence.
A suspended receipt does not identify a visible work for policy/refresh checks;
otherwise relabelling an already-retired predecessor could restart the cast.

## Offline recovery and connectivity

`playbackDegraded` belongs to the current artwork URL and item identity. A genuine
success or a different item clears it; a same-item retry retains it. A video/audio
mount that has failed cannot clear degradation through a later stray `loadeddata`.
A new slot mount resets that per-mount latch.

MIME detection treats a response-less fetch failure as offline only with
corroboration: `navigator.onLine === false` or the daemon connectivity verdict.
It may wait up to `DAEMON_VERDICT_WAIT_MS` for the first daemon verdict. Reached
HTTP errors, unknown types, and uncorroborated failures retain iframe fallback.
A fallback-typed iframe (`mimeType: null`) reports no success outcome from `load`.

`CDPRequestHandler` records connectivity in `DaemonConnectivity` before dispatch.
The network hook seeds from the store and rereads it when attaching. Daemon
notifications include generation-ready level replay, so repeated online values
still matter. Browser online/offline events supplement the daemon for link-down;
interface-up without WAN requires the daemon verdict.

AppContext refreshes degraded playback on online notifications and degradation
changes. Its per-URL M7 budget permits three refreshes with 15 s, 60 s, and 240 s
backoff. It rearms on a different degraded URL, a genuine offline-to-online edge,
60 s of clear settle, or 10 minutes of continuous elapsed time. Timers drive the
next opportunity; recovery does not depend on another external notification.

The setup artwork supplies an offline backdrop when degradation and offline
signals agree. On reconnection the backdrop can hold for up to 30 s while the
work recovers. Cached/progressive video keeps playing without WAN; streaming
video pauses. Current signal limitations include iframe navigation-error loads,
HLS failures that do not raise degradation, and a silent daemon on an interface
that stays up. A LAN-reachable but CORS-blocked source with no WAN may be classified
offline; this is a limitation of WAN corroboration.

## Hydration, halts, and default playback

While boot hydration is pending, a null cast means unknown. Conditional
`displayDefaultPlaylist` requests defer until hydration completes; forced requests
remain immediate. A halt cancels older deferred defaults, while a later request
can defer anew. A clearing halt prevents persisted-cast restoration; a preserving
halt permits restoration but suppresses navigation and fallback arming.

Sleep preserves cast state; disconnect clears it. Wake restores a retained
playlist, or rearms fallback only when ending a real sleep. An explicit cast
cancels a pending fallback; the fallback's own cast must not announce itself as
explicit intent. Async fallback completion rechecks cancellation before casting.

## Controller status and refresh

`window.__ffosPlayerStatus()` is installed by `CDPRequestHandler.initialize()` and
cleared by cleanup. It synchronously returns JSON from live state:

| Field | Meaning |
|---|---|
| `protocol` | Payload version, currently `1`. |
| `route` | Current browser pathname. |
| `handlerRegistered` | Whether the route registered its artwork reload handler. |
| `hasArtwork` | Whether the session has reportable artwork under the applied policy. |
| `bootHydration` | `pending`, `ok`, `halted_cleared`, `halted_preserving`, or `failed`. |

Only cast-hydration failure produces `bootHydration: failed`; a display-settings
read failure does not. The runtime protocol and manifest
`contracts.playerStatus.version` are separate checks and must be updated together
when their contract changes. `checkStatus.stamp` always exists on a supporting
player: the document stamp, or `''` before stamping.

`refreshArtwork` retains its legacy error strings and stable refusal codes:

| Code | Error | Handling |
|---|---|---|
| `no_artwork` | `No active artwork to refresh` | No refresh is parked. |
| `handler_pending` | `No playlist handler registered yet` | Park for registration. |
| `preview_update_failed` | `Playlist handler could not update preview URL` | Park for a healthy registration. |

A replacement cast supersedes a parked refresh; index, loop, duration, and
connection changes within that cast preserve it. An applied refresh publishes
pending before acknowledging, without changing playlist position.

## Artwork sources and isolated data documents

Live display, schedule, and refresh commands accept absolute HTTP(S), relative,
protocol-relative, and payload-bearing `data:` sources. They reject empty,
malformed, or non-web sources before state mutation. Explicit base64 must have
valid alphabet/padding; other data payloads remain opaque, including literal `%`.
Policy admission precedes source validation. Persisted boot, cast, and scheduled
records are recovery snapshots and are not revalidated as fresh commands.

HTML `data:` works on a loopback player with a works server use
`http://<label>.localhost:8081/`. The label is the first 16 SHA-256 bytes in hex,
computed over the trimmed data URL excluding its fragment. FF OS serves only
this bundle's `data-document/` directory on that port.

The shell announces ready. The player checks frame identity and origin, then
sends the trimmed source and a private MessagePort once per frame. The shell
verifies the label and navigates a child frame to a blob of the decoded bytes.
Only the child's first trusted completion, reported over that port, commits
playback. The outer shell's DOM load and public completion messages do not.
The shell retains the blob for reloads and transfers keyboard focus only while
it has focus. Each work has its own secure origin and storage, isolated from
the player and other works.

The works-server probe caches either answer for up to one minute. A slot keeps
the path it chose. For iframe-rendered data without that server, off loopback, or with a non-HTML
media type, `dataDocument` uses a secure blob frame with `allow-scripts` only and no storage.
Sandbox changes remount the frame. Port, shell location, and label derivation
are paired contracts with ffos-user.

## Setup and mint overlays

Setup panels render the bundled, offline-complete `public/setup-artwork/` beneath
their scrim when no cast is active, or when offline playback is degraded. This
is a render-only layer; it must not replace persisted cast or fallback state.

`softap_qr` requires `ssid` and accepts `password`, `portal_url`, `reason`, and
`client_attached`. A valid HTTP(S) portal URL supplies direct-IP recovery. Once
`client_attached` is true, that URL replaces the join QR with the portal QR.
Without the URL the join panel remains. `reason` carries failed-join detail.
`connecting` narrates provisioned-device connectivity; `setup_error` reports a
persistent setup failure. Setup-state arbitration remains with the existing
controller/overlay contract.

Mint pairing uses `{command: "mintPairingDisplay", request: {state, pairingCode?,
browserName?}}`, with states `pairing_code`, `request_received`, `creating_token`,
and `hidden`. It overlays playback without unmounting it. FF OS checks
`ffos-player-contract.json` before enabling this command.

Persisted storage keys and wire payload shapes are compatibility boundaries.
Changing them requires the corresponding migration or paired-controller work.
