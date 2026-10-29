import { LocalStorageItem } from '@/constants';
import { DisplaySettings, ViewMode } from '@/models';
import { CheckDeviceStatusReply } from '@/models/cast_request_reply.model';
import { Scaling } from '@/models/dp1.model';
import { ErrorType } from '@/models/error.model';
import DeviceManager from '@/utils/DeviceManager';
import { stripEphemeralCastInfoFields } from '@/utils/castInfo';
import { deviceFraming } from '@/utils/deviceFraming';
import { coerceLoopMode } from '@/utils/loopMode';
import { coerceTombstoneMode } from '@/utils/tombstoneMode';
import { contentPolicyStore } from '../ContentPolicyStore';
import { DisplaySettingsService } from './DisplaySettingsService';
import { PlaybackSession } from './PlaybackSession';
/** Projects current device status after the existing synchronous cached-cast recovery step. Render status and composition are never restored from storage. */
export class CanvasStatus {
  // DeviceManager parses persisted JSON on every read, so object identity is
  // unstable. Keep the serialized value to avoid retrying the same rejected
  // cast on each status poll while still retrying when persistence changes.
  private rejectedCachedCastFingerprint: string | null = null;

  private rejectedCachedCastEpoch: number | null = null;

  public getStatus(): CheckDeviceStatusReply {
    try {
      const criticalTempValue = DeviceManager.getCachedItem(
        LocalStorageItem.criticalTemp
      );
      const isOverheating = criticalTempValue === 'true';

      if (isOverheating) {
        return { ok: false, error: ErrorType.Overheating };
      }

      const storedCastInfo = DeviceManager.getCachedCastInfo();
      const policyEpoch = contentPolicyStore.getSnapshot().epoch;
      const storedCastFingerprint = storedCastInfo
        ? JSON.stringify(storedCastInfo)
        : null;
      if (
        !this.session.castInfo &&
        storedCastInfo &&
        (storedCastFingerprint !== this.rejectedCachedCastFingerprint ||
          policyEpoch !== this.rejectedCachedCastEpoch)
      ) {
        // Hydrate playlist/index only. renderStatus is live-only and must wait
        // for ArtworkPlayer (or an explicit setRenderStatus) after recovery.
        // Use the shared strip helper so future ephemeral fields stay aligned
        // with AppContext boot and useCastInfo persistence.
        this.session.setCastInfo(
          stripEphemeralCastInfoFields(storedCastInfo),
          false
        );
        this.rejectedCachedCastFingerprint = this.session.renderableCastInfo()
          ? null
          : storedCastFingerprint;
        this.rejectedCachedCastEpoch = this.rejectedCachedCastFingerprint
          ? policyEpoch
          : null;
      }

      // Deliberately NOT `?? storedCastInfo`: the hydration above runs the
      // persisted cast through setCastInfo, which returns null when the active
      // policy blocks all of it. Falling back to the stored payload there would
      // report that blocked playlist, its index and its command as current
      // while the wall is showing nothing — the one state a controller must not
      // be told is active. A null result here IS the answer, and so is the
      // unavailable-policy case renderableCastInfo covers.
      const activeCastInfo = this.session.renderableCastInfo();
      const composition = this.settings.getComposition();

      return {
        ok: true,
        // The cached command describes the persisted cast, so it may only be
        // reported alongside state that survived admission.
        castCommand: activeCastInfo
          ? DeviceManager.getCachedCastInfo()?.castCommand
          : undefined,
        contentContext: activeCastInfo?.contentContext,

        playlist: activeCastInfo?.playlist,
        playlistUrl: activeCastInfo?.playlistUrl,

        items: activeCastInfo?.playlist?.items,
        index: activeCastInfo?.index,
        // Never fall back to a persisted castInfo.renderStatus — that value
        // describes a previous page render, not the current mount lifecycle.
        renderStatus: this.session.renderStatus,

        // Generation stamp echo (cross-repo recovery design §2.1, source 3):
        // rides this existing round-trip so controld can detect a
        // document-stamp mismatch without a second evaluate. The key is
        // ALWAYS present from THIS player — '' when the session has not
        // stamped the document yet (a fresh mount, or a foreign/unstamped
        // document), the stamp string otherwise — so controld can tell a new
        // player's unstamped document apart from an OLD player, which omits
        // the key entirely (pre-stamp code never sent it).
        stamp:
          (window as unknown as { __ffosDocStamp?: string }).__ffosDocStamp ??
          '',

        deviceSettings: {
          framing: deviceFraming(
            DeviceManager.getCachedDeviceDisplaySettings()?.framing
          ),
          showingKey: composition ? this.settings.showingId : undefined,
          compositionRevision: composition ? this.settings.revision : undefined,
          scaling: composition
            ? (composition.settings?.scaling ?? Scaling.Fit)
            : (DeviceManager.getCachedDeviceDisplaySettings()?.scaling ??
              DisplaySettings.defaultScaling),
          margin: composition ? (composition.settings?.margin ?? 0) : undefined,
          background: composition
            ? (composition.settings?.background ?? '#000000')
            : undefined,
          orientation: DeviceManager.getCachedViewMode() ?? ViewMode.landscape,
          defaultDuration:
            DeviceManager.getCachedDefaultItemDurationSeconds() ?? undefined,
          // Coerced, not echoed raw: getStatus must report what the overlay
          // actually does, and the overlay coerces unknown/absent values to
          // the product default (Timed).
          tombstone: coerceTombstoneMode(
            DeviceManager.getCachedDeviceDisplaySettings()?.tombstone
          ),
          // Absent means "auto": no override, and each item's own
          // `seriesPlayback` stands. Reported raw rather than coerced,
          // unlike `tombstone` above, because absent and `first` are
          // different states here — a controller has to be able to show
          // "following the playlist" apart from "always one edition".
          seriesPlayback: DeviceManager.getCachedSeriesPlayback() ?? undefined,
        },

        isPaused: window.location.pathname === '/sleep',
        sleepMode: window.location.pathname === '/sleep',

        loopMode: coerceLoopMode(activeCastInfo?.loopMode),
        shuffle: activeCastInfo?.shuffle ?? false,
      };
    } catch (error) {
      console.error('[CanvasService] Error getting status:', error);
      return { ok: false, error: ErrorType.StatusCheckFailed };
    }
  }
  constructor(
    private readonly session: PlaybackSession,
    private readonly settings: DisplaySettingsService
  ) {}
}
