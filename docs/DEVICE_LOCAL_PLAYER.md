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
- It renders only while no cast is active. When `castInfo` exists (for example an OTA `updating` overlay raised over live playback), the user's playing artwork remains what shows beneath the scrim.

## Compatibility note

- Persisted storage keys for cast, display settings, and boot recovery are unchanged by this document. Do not rename persisted keys without a migration plan.

## Playlist artwork source compatibility

`CanvasService` validates artwork sources before accepting `now_display`,
`schedule_play`, or a playlist refresh. Absolute `http:`, `https:`, and
payload-bearing `data:` sources are accepted, as are relative and
protocol-relative sources; the latter are resolved by the player against its
current web origin. Empty, malformed, and non-web schemes (such as `about:`,
`tezos:`, or `invalid:`) are rejected with `{ ok: false }` before they can
replace cast or schedule state.

This guard rejects inputs the player already knows it cannot render while
preserving relative DP1 sources used by device-local deployments. Acceptance
does not promise a successful fetch: an accepted source that later cannot load
is represented by a renderer failure, rather than being rejected at cast time.
