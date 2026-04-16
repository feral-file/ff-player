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
- Only `defaultPlaylistURL` is read; other keys in the published JSON are ignored.

## Player updates

- In-browser version polling and reload-on-`version.json` have been removed. Treat the installed `out/` tree as the player version; coordinate updates with FF1 image or updater policy.

## Compatibility note

- Persisted storage keys for cast, display settings, and boot recovery are unchanged by this document. Do not rename persisted keys without a migration plan.
