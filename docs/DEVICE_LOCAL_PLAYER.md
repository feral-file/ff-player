# Device-local FF Player (FF1)

This document describes how the static export of `ff-player` is intended to run on FF1 when the player is served from the device instead of a remote host (for example `https://display.feralfile.com`).

## Build artifact

- Run `npm run build`. Next.js is configured with `output: 'export'`; output is the `out/` directory.
- Ship the contents of `out/` on the device image or OTA bundle. FF OS owns install paths and the local HTTP server.

## Serve URL (canonical)

- Serve the bundle at the **root** of the local origin, for example `http://127.0.0.1:<PORT>/`.
- Avoid subpaths such as `/player/` unless `basePath` is added in Next config and the app is smoke-tested for assets and routing.

## Why HTTP, not `file://`

The export uses standard web origins and paths (for example `/_next/static/...`). A local HTTP server keeps origin, routing, and asset loading consistent with remote hosting.

## Remote config (`display.json`)

- At runtime, [RemoteConfigService](../src/services/remoteConfigService.ts) loads `${NEXT_PUBLIC_PUB_DOC_URL}/configs/display.json` when `NEXT_PUBLIC_PUB_DOC_URL` is set at build time.
- When `NEXT_PUBLIC_PUB_DOC_URL` is empty, the request is same-origin: `/configs/display.json` (serve a matching file from `public/` in the bundle if needed).
- `duration` controls the browser version-polling interval for web/Pages deployments, and `defaultPlaylistURL` controls fallback playback. Other keys in the published JSON are ignored.
- A failed fetch resolves with the local defaults but is **not** cached, so the next caller retries the network. Only a config that actually came back from the remote read is cached for the page lifetime. Without this, a device that boots offline pins itself to the local defaults forever and never reads the published `display.json`, even after Wi-Fi comes up.
- Overlapping reads settle first-landed-wins: the first successful remote read populates the cache, and a slower concurrent read — whether it fails or succeeds with what is by then an older response — converges on that cached config instead of overwriting it. Once populated, the page-lifetime cache never changes.
- A superseded `AppContext` read that lands the remote config still publishes it to the player: the effect's cancel guard only drops results that are NOT the immutable cache. Without the carve-out, an older read succeeding after a newer one already failed over to local defaults (flapping link) would strand the published config in the cache — with no further online notification due, the wall would stay on the built-in default.

## Player updates

- The Cloudflare Pages/web build still uses `version.json` polling and reload to pick up new deployments.
- The FF OS static export sets `NEXT_PUBLIC_DISABLE_VERSION_CHECK=true`, so the device-local bundle does not self-refresh and should be updated with the FF1 image or updater policy.

## Mint pairing overlay

- `feral-controld` drives browser-session mint pairing display through the CDP command `mintPairingDisplay`.
- The command payload is `{ command: "mintPairingDisplay", request: { state, pairingCode?, browserName? } }`.
- Supported states are `pairing_code`, `request_received`, `creating_token`, and `hidden`.
- The overlay renders above the active artwork player and does not unmount or navigate away from playback. In `pairing_code`, the player shows a code-only External Device Pairing Mode screen and asks the user to enter that code on the requesting website.
- In `request_received`, the player instructs the user to open the Feral File mobile app, go to Settings > Art Computer, and approve the browser session.
- The device-local static export ships `ffos-player-contract.json` at the bundle root. `feral-controld` and `feral-player.service` use that manifest to verify the deployed player supports this CDP contract before enabling mint pairing.

## Setup overlay background artwork

- Every visible `setupDisplay` state (scanning, softap_qr, joining, finalizing, updating, claim_qr, factory_reset, join_failed) renders a bundled artwork beneath its panel, behind the panels' existing dark scrim. The panels themselves are unchanged.
- The artwork ships in `public/setup-artwork/` (`index.html` plus a local `p5.min.js`). Source: `https://generator.artblocks.io/1/0x0000000c687daed0fba60d1dba4e5f6149e8b894/55`, saved with the CDN p5.js reference rewritten to the local sibling so it renders with zero connectivity — factory-fresh setup runs before Wi-Fi exists, so the background must be same-origin and offline-complete.
- The background is deliberately NOT cast through `CanvasService`: a cast is persisted as `castInfo` and would replace the boot fallback-playlist recovery contract. It is a render-only layer inside `SetupOverlay` ([SetupArtworkBackground](../src/components/setup/SetupArtworkBackground.tsx)).
- Under a panel it renders only while no cast is active. When `castInfo` exists (for example an OTA `updating` overlay raised over live playback), the user's playing artwork remains what shows beneath the scrim. The one exception is a device whose playback is degraded — see *Offline playback recovery* below.

## Offline playback recovery

The same bundled artwork doubles as the offline backdrop for a **claimed** device, and the player retries its own failed loads when connectivity returns.

- `ArtworkPlayer` reports the load outcome of the artwork it is currently trying to show through `AppContext.context.playbackDegraded`. It is set at the media/model/iframe error handlers and cleared by a genuine success (`loadeddata`, image decode, model load, iframe load) or by moving to a different artwork (a change of `previewURL` **or** playlist-item identity — adjacent items may share a URL). Failure sites still commit their slot through `loadedSource`, so the commit itself cannot distinguish success from failure — the flag is recorded at the error and success sites instead.
  - **Known gap — iframe/HTML artworks.** A cross-origin iframe fires `load` even when the browser rendered its own network-error page, and nothing in-page can inspect that document, so an offline HTML artwork reads as a success and neither raises the backdrop nor triggers the reconnect refresh. `onError` does not fire for navigation failures in Chromium. Offline, `getContentTypeFromURL`'s `HEAD` also fails and the type is inferred from the file extension, so extensionless sources fall through to the iframe path too — image/video/audio/model artworks keep their real error signals. Treating an offline iframe `load` as a failure would be wrong: `feral-controld`'s offline-cache replay legitimately serves iframe artworks with no WAN, and flagging those would paint the backdrop over working playback.
  - **Known gap — `<object>` artworks.** SVG and the other `FileUseObject` / `MIMETypeObject` routes render through `<object>`, which is wired with `onLoad` only and has no error handler at all, so these artworks can never raise the flag. Wiring `onError` there is a separate change.
  - **Known gap — streaming (HLS).** These layers report neither outcome: `setupMediaForSlot` skips them and the hls.js `NETWORK_ERROR` branch is deliberately non-fatal. The existing `isOnline` gate pauses streaming playback offline instead.
- `AppContext` calls `canvasService.requestArtworkRefresh()` on two edges: when an online notification arrives while playback is degraded, and when playback becomes degraded. Together they cover both orderings of the race between "Wi-Fi came back" and "the fetch finally gave up" — on a single-item playlist there is no playlist advance to retry a load that errors seconds after reconnect. The refresh re-mounts the current artwork through the playlist route's registered handler, re-running the exact asset fetches that failed, with the player's normal crossfade. It does not touch `castInfo` or playlist position.
  - Keyed on the online *notification*, not the derived `isOnline` boolean — `useNetworkManger` starts at `true`, so the first real notification after provisioning is a `true→true` no-op. This mirrors the boot fallback-playlist loop.
  - No attempt cap is needed because it cannot loop: the refresh re-mounts the **same** `previewURL`, so a repeat failure finds the flag already set, the player writes no new context state, and neither dependency changes. Recovery is one nudge per genuine transition.
- The remote-config effect is re-keyed on the same online notification, which is what makes the `display.json` retry above reachable — otherwise the one-shot mount fetch would leave an offline boot pinned to the local defaults for the page lifetime.
  - A fallback cast that lands with a **stale URL** is superseded rather than prevented. The fallback loop deliberately races the refetch (blocking casts on a config read — 10s timeout, re-cancelled by every further notification — could leave the wall showing nothing, and stale beats nothing): if a still-armed retry casts the built-in default first and clears the request, or the cast outruns the refetch entirely because the playlist host is reachable while the config host is not, the published `defaultPlaylistURL` landing later re-arms the loop and replaces the wrong fallback. The wrong cast is a bounded transient — the page-lifetime config cache means the URL changes at most once — and an explicit cast disarms the supersede, so the controller's content is never replaced.
- `SetupArtworkBackground` shows when `(panelVisible || offlineDegraded) && (!castInfo || offlineDegraded)`, where `offlineDegraded = !isOnline && playbackDegraded`. This keeps the original setup-flow behavior, adds the offline backdrop for a claimed device whose artwork cannot load, and preserves the invariant that a device playing artwork normally never gets this layer over it. Both factors use `offlineDegraded` rather than the bare flag on purpose: an artwork that fails while **online** is a broken asset or an unsupported format, which the player's own error modal explains, and this `z-index: 999` layer must not cover that modal.
- While the backdrop is up with no setup panel visible, a small "No internet connection" chip renders inside the same layer, so it fades and unmounts with the artwork. When a panel is visible the panel copy owns the messaging and the chip is suppressed.

### Limitation: `isOnline` is edge-triggered, so the backdrop is best-effort

`window.handleConnectivityChange` is pushed by the daemon strictly on edges — a single boot seed per `sys-monitord` process, then transitions only — and `useNetworkManger` seeds `isOnline = true`. After a page reload while the device is *already* offline, the page can therefore never learn it is offline: no transition occurs, the boot seed has already been spent, and `isOnline` stays stuck at its optimistic `true`.

The consequences split cleanly, and the split is deliberate:

- **The recovery half is unaffected.** The reconnect refresh keys off `onlineSignal` and `playbackDegraded`, never `isOnline`, so it rides the `false→true` edge the daemon does deliver reliably. A device that reloads while offline still retries its artwork the moment connectivity actually returns.
- **The backdrop half is best-effort.** It is gated on `offlineDegraded`, which needs `!isOnline`. In the stuck-`true` case the artwork still fails and the flag is still raised, but the backdrop does not appear until the next real connectivity transition. The wall shows the failed artwork's black frame until then.

This is why the reconnect effect deliberately does *not* gate on `isOnline` — doing so would drag recovery down to the backdrop's reliability. Making the backdrop dependable needs the daemon to level-trigger connectivity pushes (send current state on request, or re-seed per page load); that is a planned daemon-side follow-up, not something the player can fix on its own.

## Compatibility note

- Persisted storage keys for cast, display settings, and boot recovery are unchanged by this document. Do not rename persisted keys without a migration plan.
