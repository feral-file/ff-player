/**
 * Numeric render lifecycle for the current artwork.
 * Keep this additive so the FF app can switch on stable codes.
 */
export enum RenderStatus {
  pending = 0,
  loading = 1,
  ready = 2,
  failed = 3,
}
