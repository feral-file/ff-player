import { AppSettings } from '@/constants';
import axios from 'axios';
import * as Sentry from '@sentry/nextjs';

export interface AppRemoteConfig {
  /** Poll interval for `version.json`; omit, `undefined`, or `0` disables polling. */
  duration?: number;
  defaultPlaylistURL: string;
}

/**
 * Ceiling for a single `display.json` read. Long enough to tolerate the slow
 * link a just-provisioned device often has, short enough that a request on a
 * dead link gives up well inside the interval between connectivity changes.
 */
const REMOTE_CONFIG_TIMEOUT_MS = 10_000;

/**
 * Re-report window for Sentry sampling (see `reportFailureSampled`): how
 * long a single event for a given error class stands in for every repeat
 * before the class is allowed to report again. Bounds volume on a
 * persistently offline device without keying by page lifetime alone, which
 * cannot distinguish "still the same five-minute outage" from "this has now
 * been failing for six hours" — the latter is new information worth a fresh
 * event.
 */
const SENTRY_REPORT_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Maps `display.json` `duration` for version polling: valid finite values ≥0
 * are kept; negatives clamp to `0`; absent or invalid values become `undefined`
 * (no polling). `AppWrapper` treats falsy duration as disabled.
 */
function normalizePublishedDuration(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || Number.isNaN(raw) || !Number.isFinite(raw)) {
    return undefined;
  }
  if (raw < 0) {
    return 0;
  }
  return raw;
}

/**
 * Loads published runtime config for display defaults and falls back to local
 * constants if the remote document is unavailable or incomplete.
 *
 * Published `display.json` may still contain legacy fields (for example a
 * historical `duration` used by older clients). This service accepts that
 * field for version polling, but only `defaultPlaylistURL` affects fallback
 * playback selection.
 */
class RemoteConfigService {
  /**
   * Config cache, populated ONLY by a successful remote read. `fetchConfig`
   * never rejects — it answers a failed request with the local defaults — so
   * caching its result unconditionally pinned an offline boot to those
   * defaults for the whole page lifetime and the published `display.json`
   * was never read again, even after Wi-Fi came up. The device then kept
   * playing the built-in default playlist instead of the published one.
   */
  private appRemoteConfig: AppRemoteConfig | null = null;

  /**
   * Wall-clock moment each error class was last reported to Sentry (see
   * `fetchConfig`'s catch). AppContext now re-runs `getAppRemoteConfig` on
   * every online notification while no remote config has landed, so an
   * unsampled `captureException` would emit one Sentry event per
   * notification for the life of a persistently offline device. Keyed by
   * class rather than page lifetime alone (§ SENTRY_REPORT_WINDOW_MS): a
   * bare "reported once" latch would go permanently silent on an outage that
   * outlives the first event, hiding exactly the information an operator
   * needs — that the device is STILL down.
   */
  private reportedErrorClasses = new Map<string, number>();

  /**
   * Resolves the published runtime config, reading the network at most once
   * per successful fetch. A failed read still resolves — with the local
   * defaults, so callers never have to handle an error — but is deliberately
   * not cached, so the next call retries the network. Callers may therefore
   * see local defaults first and published values on a later call.
   *
   * Calls can overlap: `AppContext` re-runs this on every online
   * notification, so a request left hanging on a dying link can still be in
   * flight when a later one succeeds. The re-read of the cache AFTER the
   * fetch is what makes that safe — a slow failure must never hand its local
   * fallback back to a caller once a published config has landed, because
   * the caller would then commit it and revert `defaultPlaylistURL` to the
   * built-in default, re-arming exactly the fallback-playlist bug this
   * service's caching rule exists to prevent.
   */
  public async getAppRemoteConfig(): Promise<AppRemoteConfig> {
    // Read into a local rather than testing the field directly: narrowing the
    // field here would convince the compiler it is still `null` after the
    // await, and the whole point of the re-read below is that a concurrent
    // call may have written it in the meantime.
    const cached = this.appRemoteConfig;
    if (cached) {
      return cached;
    }

    const { config, fromRemote } = await this.fetchConfig();
    if (fromRemote) {
      // Same overlap, inverse outcome: two successful reads can interleave
      // too. First landed wins — a concurrent caller may already have
      // committed the landed config, so overwriting it would leave future
      // callers disagreeing with what is on screen. The point is not which
      // response is fresher (both read the same document seconds apart) but
      // that the page-lifetime cache is immutable once populated: every
      // caller converges on one result.
      this.appRemoteConfig ??= config;
      return this.appRemoteConfig;
    }

    return this.appRemoteConfig ?? config;
  }

  /**
   * The immutable page-lifetime cache, or null before any remote read has
   * landed. Exposed so AppContext can tell a resolution that carries the
   * cached (remote-sourced) config apart from one carrying transient local
   * defaults: the former is safe to commit even from a superseded effect
   * run — every later call resolves to the SAME object (by reference; do
   * not defensively copy, the identity check depends on it) — the latter
   * is not.
   */
  public getCachedConfig(): AppRemoteConfig | null {
    return this.appRemoteConfig;
  }

  /**
   * Reads `display.json`, reporting via `fromRemote` whether the returned
   * config actually came from the network or is the local fallback, which is
   * what `getAppRemoteConfig` uses to decide whether the result is cacheable.
   */
  private async fetchConfig(): Promise<{
    config: AppRemoteConfig;
    fromRemote: boolean;
  }> {
    try {
      const response = await axios.get<Partial<AppRemoteConfig>>(
        `${process.env.NEXT_PUBLIC_PUB_DOC_URL ?? ''}/configs/display.json`,
        // Bounded so a request cannot outlive the connectivity change that
        // triggered the next one. An FF1 losing WAN mid-request leaves the
        // socket open rather than resetting it, and an unbounded fetch on
        // that dying link is what makes a stale completion interleave with a
        // newer, successful one in the first place.
        { timeout: REMOTE_CONFIG_TIMEOUT_MS }
      );

      return {
        config: {
          duration: normalizePublishedDuration(response.data.duration),
          defaultPlaylistURL:
            typeof response.data.defaultPlaylistURL === 'string' &&
            response.data.defaultPlaylistURL.trim() !== ''
              ? response.data.defaultPlaylistURL.trim()
              : AppSettings.DEFAULT_PLAYLIST_URL,
        },
        fromRemote: true,
      };
    } catch (error) {
      console.log('[API] Failed to load config:', error);
      this.reportFailureSampled(error);
      // Return default value if failed to load config
      return {
        config: {
          duration: AppSettings.VERSION_CHECK_INTERVAL_DURATION,
          defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
        },
        fromRemote: false,
      };
    }
  }

  /**
   * Sampled Sentry reporting: at most one event per distinct error class (by
   * constructor name — e.g. `AxiosError` vs a generic `Error`) per
   * SENTRY_REPORT_WINDOW_MS, not one per failed read. A dead config host is
   * already visible from the first event, so every repeat within the window
   * adds volume without new information — but an outage that outlives the
   * window is new information (still down), so the class becomes reportable
   * again rather than staying latched silent for the rest of the page
   * lifetime.
   */
  private reportFailureSampled(error: unknown): void {
    const errorClass = error instanceof Error ? error.constructor.name : typeof error;
    const now = Date.now();
    const lastReportedAt = this.reportedErrorClasses.get(errorClass);
    if (
      lastReportedAt !== undefined &&
      now - lastReportedAt < SENTRY_REPORT_WINDOW_MS
    ) {
      return;
    }
    this.reportedErrorClasses.set(errorClass, now);
    Sentry.captureException(error);
  }
}

export default RemoteConfigService;
