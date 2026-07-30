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
- `duration` controls the browser version-polling interval for web/Pages deployments, `defaultPlaylistURL` controls fallback playback, and `showRenderLoadingOverlay` controls whether the loading overlay is shown while the current artwork is still rendering. Other keys in the published JSON are ignored.

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

## Artwork render status (`renderStatus`)

- Status polls expose an optional numeric `renderStatus` on the device-status reply: `0` pending, `1` loading, `2` ready, `3` failed (`RenderStatus` in `src/models/render_status.model.ts`).
- The value describes the **current page mount** only. Persistence and boot recovery strip it so IndexedDB cannot resurrect a prior ready/failed before `ArtworkPlayer` publishes a new lifecycle.
- After boot/hydrate, `renderStatus` may be omitted/`undefined` until the player mounts; treat that as “not yet reported”, not as a terminal failure.
- `CanvasService` forces `pending` when the selected artwork identity changes (`id` + `source`), including same-id source refresh.
- Iframe and PDF navigation can complete with a browser-generated error document, and cross-origin iframe failures do not reliably emit an error event. Their `load` event therefore completes the visual transition but deliberately leaves `renderStatus` at `loading`; only a renderer-owned success signal may report `ready`.
- `showRenderLoadingOverlay` only gates the visible loading overlay; it does not change the codes reported on status polls.

## Setup overlay background artwork

- Every `setupDisplay` state renders the bundled artwork beneath its panel and dark scrim; the setup artwork is packaged locally so factory-fresh setup needs no network access.
- It is a render-only `SetupOverlay` layer, not a `CanvasService` cast: persisting it as a cast would replace fallback-playlist recovery.
- The background appears only while no cast is active. An updating/pairing overlay raised over live playback leaves the playing artwork visible beneath the scrim.

## Playlist artwork source compatibility

`CanvasService` validates artwork sources before accepting `now_display`,
`schedule_play`, or a playlist refresh. Absolute `http:`, `https:`, and
`data:` sources are accepted, as are relative and protocol-relative sources;
the latter are resolved by the player against its current web origin. Empty,
malformed, and non-web schemes (such as `about:`, `tezos:`, or `invalid:`) are
rejected with `{ ok: false }` before they can replace cast or schedule state.

This guard rejects inputs the player already knows it cannot render while
preserving relative DP1 sources used by device-local deployments. Acceptance
does not promise a successful fetch: an accepted source that later cannot load
is represented by `renderStatus: failed`, rather than being rejected at cast
time.

## Compatibility note

- Persisted storage keys for cast, display settings, and boot recovery are unchanged by this document. Do not rename persisted keys without a migration plan.

## Playlist artwork source compatibility

`CanvasService` validates artwork sources before accepting a new
`now_display`, `schedule_play`, or playlist refresh command. Absolute `http:`,
`https:`, and payload-bearing `data:` sources are accepted, as are relative
and protocol-relative sources; the latter are resolved by the player against
its current web origin. Empty and non-web schemes (such as `about:`, `tezos:`,
or `invalid:`) are rejected with `{ ok: false }` before they can replace cast
or schedule state. Non-base64 `data:` payloads remain opaque, including raw
literal percent characters; explicit `;base64` payloads must use valid base64.

This guard rejects inputs the player already knows it cannot render while
preserving relative DP1 sources used by device-local deployments. Acceptance
does not promise a successful fetch: an accepted source that later cannot load
is represented by a renderer failure, rather than being rejected at cast time.

Boot playlist, cast-info, and scheduled-task records are recovery snapshots
rather than new cast commands. They are intentionally restored or executed
without source validation so an upgrade does not interrupt a previously
persisted playlist; records written by the current version have already passed
the live-command validation boundary.
