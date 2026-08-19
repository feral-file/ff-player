# Tombstone Sizing Contract

`src/components/tombstone/` renders over the artwork on a wall that can be hung either way up. Every dimension in that directory scales by the viewport's **short edge**.

## The rule

Sizes, spacing, and type in the tombstone components come from `designPx` (`src/components/tombstone/designPx.ts`). No hand-written `vw`, `vh`, or ancestor-relative percentage dimensions.

`designPx(px)` maps a value in the 1280×720 design frame to vmin: `(px / 720) * 100`. So `designPx(16)` is `2.2222vmin`, and `designPx(720)` is the whole short edge.

## Why the short edge

FF1 rotation is display-level, not CSS-level. A portrait wall really reports a 1080×1920 viewport, so:

- `vh` binds to the 1920 **long** side and inflates every value ~1.78× while the label's own axis shrinks.
- `vw` and a `%` of the container bind to the width, which is the short side in portrait and the long side in landscape — the opposite mapping in each orientation.
- `vmin` equals `vh` in landscape (so landscape is visually unchanged) and pins portrait to the short side, which is how a physical plaque behaves: rotating the wall does not resize the label.

This matches `useDeviceRotation`'s `screenRatio`, which also scales by the short side.

## The failure mode

Twice a percentage width has survived among otherwise-vmin values and shipped a portrait-only bug: the label's type stayed vmin while its `maxWidth` bound to the viewport width, so on a 1080×1920 wall a `60%` cap was 648px against 1080-sized type and long artist/title/curator strings wrapped far earlier than in landscape.

- `030872c` replaced a `50%` cap with `designPx(640)` and added the first regression test.
- #283 reverted the value to `60%` and deleted that test along with it.
- #286 restored `designPx(640)` — half the 1280 frame, so landscape is pixel-identical, and `88.8889vmin`, which can never exceed the viewport width because `vmin <= vw` by definition — and re-added the test.

The value was easy to reintroduce because the rule lived only in a comment inside `designPx.ts`. This document is the rule; the tests below are the enforcement.

## Deliberate exceptions

- `0%` and `100%` are allowed: they mean "collapse" and "fill the parent", and the parent is already vmin-sized. The timer bar's track and depleting fill use them.
- Percentages that **place** rather than size — `left: '50%'` with `transform: 'translateX(-50%)'` on the toast — are allowed. They centre correctly in either orientation.
- `TombstoneToast`'s `maxWidth: '80%'` is an inert safety net: the toast's fixed strings are `nowrap` and never approach it. It is allowlisted by value in the scan, so changing it fails the test.

## Enforcement

- `designPx.test.ts` pins the px-to-vmin conversion.
- `TombstoneOverlay.test.tsx` asserts the rendered container carries no `vh`/`vw`/`%` dimension.
- `sizingContract.test.ts` scans the source of every non-test file in `src/components/tombstone/` for viewport-axis units and ancestor-relative percentage dimensions, so the rule holds for files the component test never renders.
