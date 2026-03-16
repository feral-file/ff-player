# Playlist to ArtworkPlayer Use Cases

## Purpose

This document captures the runtime contract between:

- `src/app/playlist/playlist-client.tsx`
- `src/components/artwork-player/ArtworkPlayer.tsx`

Use it when changing cast commands, playlist timing, keyboard controls, media type detection, or artwork rendering.

## Key Invariants

- `castPreviewURL` must always match the currently selected playlist item source.
- `currentItemDisplayPreference` must belong to the same item as `currentItemRef`.
- `startTime` must stay aligned with the ordering used by `getIndex()`.
- A stale async media-type response must never override the latest `previewURL`.

## Keyboard Transport Contract

Keyboard transport controls are intentionally **not always-on**.

- Production behavior: enabled only when `displayPreferences.interaction.keyboard` explicitly opts in.
- Local testing behavior: enabled on `localhost` and `127.0.0.1`.
- Repeated keydown events are ignored to avoid overlap transitions from key-repeat.

Accepted opt-in tokens:

- `transport`
- `transportControls`
- `nextArtwork`
- `previousArtwork`
- `togglePause`

## SVG Rendering Contract

SVG must render via `<object>` path, not `<img>`.

- MIME match: `image/svg*` maps to object rendering.
- Do not force `<object type="text/html">` for SVG/object content.
- This preserves scripted or interactive SVG behavior (including Casey's recent works).

## Repeatable Merge Checklist

Run these scenarios before merging playlist/player changes:

1. Navigate rapidly with next/previous commands and confirm no double-overlay state.
2. Hold right/left arrow keys and confirm no repeated-transition artifacts.
3. Pause/resume mid-item and confirm timeline continuity.
4. Load static SVG and scripted SVG and confirm object-path behavior.
5. Verify image, iframe, video, and audio still load and clear loading state correctly.
6. Validate offline -> online while video is active.

## Change Review Questions

- Did this change alter when keyboard navigation is active?
- Did this change alter which media element is chosen for SVG?
- Did this change introduce async paths that can resolve after `previewURL` changed?
- Did this change alter timer ownership between cast state and local playlist state?
