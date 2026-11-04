/**
 * Stuck-load detection for one mounted artwork element.
 *
 * A fixed total deadline cannot tell a slow transfer from a dead one: on an
 * FF1 a 20 MB IPFS still arrives at ~740 KB/s and needs ~27 s, so the former
 * 15 s bound failed it on every attempt, and each retry restarted the
 * download from zero. Measured on device, Chromium itself never times out a
 * stalled image or media request (a server that sends no headers, or stops
 * mid-body, leaves the element loading forever), so a bound is still needed.
 * The bound therefore follows evidence of progress instead of wall time:
 *
 * - `transfer`: fail after LOAD_IDLE_TIMEOUT_MS without new bytes, counted
 *   from mount so a server that never answers is caught too, and never later
 *   than LOAD_TRANSFER_CEILING_MS after mount so a trickle cannot hold the
 *   wall indefinitely.
 * - `decode`: the bytes are complete; allow LOAD_DECODE_TIMEOUT_MS for the
 *   element to decode and report readiness.
 * - `opaque`: the loader fell back to a plain element load whose progress is
 *   invisible to script, so only a fixed LOAD_OPAQUE_TIMEOUT_MS applies.
 * - `fixed`: iframe/object/model/PDF, which expose no byte progress at all;
 *   keeps the established EMBEDDED_LOAD_TIMEOUT_MS.
 *
 * Cached replays served by feral-controld's offline cache arrive in one
 * piece without Content-Length (measured: 140 MB in 1.8 s), which is why no
 * phase depends on the response size.
 */
export const LOAD_IDLE_TIMEOUT_MS = 20_000;
export const LOAD_TRANSFER_CEILING_MS = 5 * 60_000;
export const LOAD_DECODE_TIMEOUT_MS = 20_000;
export const LOAD_OPAQUE_TIMEOUT_MS = 120_000;
export const EMBEDDED_LOAD_TIMEOUT_MS = 45_000;

export type LoadPhase = 'transfer' | 'decode' | 'opaque' | 'fixed';

export interface LoadProgressState {
  phase: LoadPhase;
  startedAt: number;
  lastProgressAt: number;
  phaseStartedAt: number;
}

/** Returns the epoch-ms instant at which a load in `state` counts as stuck. */
export function loadDeadline(state: LoadProgressState): number {
  switch (state.phase) {
    case 'transfer':
      return Math.min(
        state.lastProgressAt + LOAD_IDLE_TIMEOUT_MS,
        state.startedAt + LOAD_TRANSFER_CEILING_MS
      );
    case 'decode':
      return state.phaseStartedAt + LOAD_DECODE_TIMEOUT_MS;
    case 'opaque':
      return state.phaseStartedAt + LOAD_OPAQUE_TIMEOUT_MS;
    case 'fixed':
      return state.startedAt + EMBEDDED_LOAD_TIMEOUT_MS;
  }
}

/**
 * Arms one timer per element mount and re-evaluates `loadDeadline` when it
 * fires instead of re-arming on every progress event: media `progress` fires
 * several times a second and a stream delivers many chunks, so recording a
 * timestamp is the only per-event cost. `onExpire` runs at most once.
 */
export class LoadWatchdog {
  private state: LoadProgressState;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private done = false;
  constructor(
    phase: 'transfer' | 'fixed',
    private readonly onExpire: () => void,
    private readonly now: () => number = Date.now
  ) {
    const startedAt = now();
    this.state = {
      phase,
      startedAt,
      lastProgressAt: startedAt,
      phaseStartedAt: startedAt,
    };
    this.arm();
  }
  /** Records new bytes; only meaningful while transferring. */
  progress() {
    if (!this.done) {
      this.state.lastProgressAt = this.now();
    }
  }
  /** Moves to a later phase and re-arms against its own deadline. */
  enterPhase(phase: 'decode' | 'opaque') {
    if (this.done || this.state.phase === 'fixed') {
      return;
    }
    this.state = { ...this.state, phase, phaseStartedAt: this.now() };
    this.arm();
  }
  dispose() {
    this.done = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private arm() {
    clearTimeout(this.timer);
    const wait = Math.max(loadDeadline(this.state) - this.now(), 0);
    this.timer = setTimeout(() => {
      this.check();
    }, wait);
  }
  private check() {
    if (this.done) {
      return;
    }
    if (this.now() < loadDeadline(this.state)) {
      this.arm();
      return;
    }
    this.dispose();
    this.onExpire();
  }
}
