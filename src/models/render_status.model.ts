/**
 * Numeric render lifecycle for the current artwork mount.
 *
 * Contract for FF app / status polls (`CheckDeviceStatusReply.renderStatus`):
 * - Additive stable codes only — do not renumber existing values.
 * - Live-only: never persist; boot and DeviceManager strip this field so a
 *   stored ready/failed cannot be reported before ArtworkPlayer mounts.
 * - After boot/hydrate, `undefined` means “no lifecycle yet”, not a terminal
 *   state. Explicit casts (e.g. nowDisplay) set `pending` immediately.
 * - CanvasService resets to `pending` when the selected artwork identity
 *   (playlist item id + source) changes, including same-id source refresh.
 */
export enum RenderStatus {
  pending = 0,
  loading = 1,
  ready = 2,
  failed = 3,
}
