/**
 * The design canvas is 1280×720, so every px value in the frame is relative to
 * a 720-tall *landscape* viewport. `designPx` converts frame px to vmin — the
 * viewport's short side — so a value holds its designed proportion at any
 * output resolution *and* orientation.
 *
 * Why vmin and not vh: FF1 rotation is display-level, so a portrait wall
 * really reports a 1080×1920 viewport. There, vh binds to the 1920 long side
 * and inflates every value 1.78× while the label's own axis (width) shrinks —
 * the label ends up ~3× its designed proportion. vmin equals vh in landscape
 * (no visual change there) and pins portrait to the short side, matching a
 * physical plaque: rotating the wall does not grow the label. This mirrors
 * `useDeviceRotation`'s screenRatio, which also scales by the short side.
 *
 * Shared by the tombstone label and its confirmation toast, which have to scale
 * together.
 *
 * The rule this enforces — and the exceptions to it — is written out in
 * `docs/TOMBSTONE_SIZING_CONTRACT.md` and scanned by `sizingContract.test.ts`.
 */
export const designPx = (px: number): string =>
  `${((px / 720) * 100).toFixed(4)}vmin`;
