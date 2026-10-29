import {
  CastCommand,
  ConnectReplyV2,
  DisconnectReplyV2,
  DisplayDefaultPlaylistReply,
  DisplayDefaultPlaylistRequest,
  SetSleepModeReply,
  SetSleepModeRequest,
} from '@/models';
import {
  CustomEventName,
  NavigateEventDetail,
  PlaybackHaltedDetail,
} from '@/models/custom_event';
import DeviceManager from '@/utils/DeviceManager';
import { PlaybackSession } from './PlaybackSession';
import { RecentPlaybackService } from './RecentPlaybackService';
/** Owns boot, halt, sleep, and conditional-default ordering. Halt notifications remain synchronous and preserve last-command-wins behavior. */
export class PlaybackRecovery {
  // True until AppContext finishes restoring persisted cast state at boot
  // (initCastInfo spans several async DeviceManager reads while the CDP
  // entry point is already live). While pending, castInfo === null means
  // "unknown", not "empty screen", so `onlyIfNoPlaylist` requests defer to
  // completeBootCastHydration() instead of deciding against a null that a
  // restore is about to overwrite.
  private bootCastHydrationPending = true;

  private deferredConditionalDefaultRequest = false;

  // A deliberate stop (disconnect, setSleepMode(true), error-page
  // navigation) landed while hydration was still pending — latched from the
  // PlaybackHalted event in the constructor. initCastInfo's live-command
  // bail-out reads castInfo, but none of these stops leave one to see:
  // disconnect CLEARS castInfo and sleep/error never set it, so at the
  // decision point they are indistinguishable from "nothing happened".
  // Same ambiguity bootCastHydrationPending exists for (null means
  // "unknown", not "empty screen"), from the other direction: here null
  // must mean "a stop already decided the wall", so boot must not restore
  // persisted state or arm the fallback over it. Sticky for the page
  // lifetime — it is only consulted at the one boot decision.
  private haltedDuringBootHydration = false;

  // The mid-hydration halt CLEARED cast state (disconnect's
  // PlaybackHaltedDetail.clearedCast). Only this flavor makes boot skip the
  // persisted-playlist restore: the persisted state is exactly what the
  // controller cleared. A preserving halt (sleep, error navigation) leaves
  // this false, and boot still restores the playlist — suppressing only
  // navigation and fallback arming — so a wake after a mid-hydration sleep
  // finds the user's playlist instead of casting (and persisting) the
  // default over it.
  private haltClearedCastDuringBootHydration = false;

  // True between setSleepMode(true) and the wake that ends it. The wake
  // re-arm below must fire only for a wake that ends a REAL sleep: a wake
  // sent to a disconnected wall (castInfo cleared, never slept) must not
  // cast the default playlist over a deliberate clear. disconnect() resets
  // it for the same reason — a wall cleared DURING sleep stays dark on
  // wake.
  private sleepModeEntered = false;

  // Set only when initCastInfo itself threw (completeBootCastHydration's
  // `outcome` argument), never for an initialDisplaySettings failure that
  // shares the same try block in AppContext — see bootHydrationState(). Once
  // hydration is no longer pending, this is what turns a caught exception
  // into the CDP status probe's 'failed' outcome, which is the only
  // bootHydration value that drives boot recovery's navigate-away row.
  private bootHydrationFailed = false;

  constructor(
    private readonly session: PlaybackSession,
    private readonly history: RecentPlaybackService
  ) {
    // One subscription for the document-lifetime singleton. Tightening policy
    // invalidates queued old snapshots as well as the currently selected work.

    // Latch any deliberate-stop notification that lands before boot
    // hydration settles. The PlaybackHalted event is the one contract every
    // halt source already honors (disconnect and sleep in this class, error
    // navigation in utils — which must not import this service back), so
    // the latch subscribes to the bus instead of each source calling in: a
    // future halt source is covered by construction. dispatchEvent runs
    // listeners synchronously, so the latch is visible in the same task as
    // the halt itself. Never removed — the singleton lives for the page.
    // The window guard covers module import during prerender.
    if (typeof window !== 'undefined') {
      window.addEventListener(CustomEventName.PlaybackHalted, event => {
        // Every deliberate stop reaches this bus — disconnect, sleep, and the
        // error navigation in utils — so retiring here covers them all by
        // construction, including a future halt source. Only disconnect nulls
        // castInfo; sleep and error navigation keep it, which is why the
        // setCastInfo(null) path alone was not enough: the wall stops showing
        // the work while the cast is still the current one.
        this.history.retireActiveRecentlyPlayed();
        if (this.bootCastHydrationPending) {
          this.haltedDuringBootHydration = true;
          // detail is null at runtime for a bare CustomEvent (error
          // navigation dispatches without one), whatever the generic claims.
          const detail = (
            event as CustomEvent<PlaybackHaltedDetail | undefined>
          ).detail;
          if (detail?.clearedCast) {
            this.haltClearedCastDuringBootHydration = true;
            // This early, useCastInfo's React state is still at its
            // useState(null) initial value: this.session.setCastInfo(null) inside
            // disconnect() is a same-value bail-out, so React never
            // re-renders and the persistence effect (DeviceManager
            // .setDeviceInfo) that would normally clear the stored record
            // never runs. Without this direct write, the STALE persisted
            // castInfo survives to the next boot and initCastInfo resurrects
            // exactly the playlist this disconnect just cleared. Clear it
            // here at the service layer instead of depending on a React
            // re-render. Fire-and-forget, matching this class's other
            // storage writes off the event path.
            DeviceManager.setDeviceInfo(null).catch((error: unknown) => {
              console.error(
                '[CanvasService] Error clearing persisted castInfo after a mid-hydration disconnect:',
                error
              );
            });
          }
          // A deferred conditional default push predates this stop: cancel
          // it here, the same way the halt cancels AppContext's active
          // request. Cancelling at the halt rather than gating the settle
          // replay keeps last-command-wins in BOTH directions — a push
          // arriving AFTER the halt is deferred anew and still honored at
          // settle ("make sure something is playing" is then the newer
          // intent).
          this.deferredConditionalDefaultRequest = false;
        }
      });
    }
  }

  public connect(): ConnectReplyV2 {
    this.session.setCastInfo({
      ...(this.session.castInfo ?? {}),
      castCommand: CastCommand.connect,
    });

    console.log('[CAST] Connected device');
    return { ok: true };
  }

  public disconnect(): DisconnectReplyV2 {
    console.log('[CanvasService] Disconnect');
    this.session.setCastInfo(null);
    // A disconnect during sleep clears the wall; the wake that eventually
    // ends that sleep must find the marker down or it would re-arm the
    // fallback over the deliberate clear.
    this.sleepModeEntered = false;
    // The controller stopped playback: AppContext must stand its fallback
    // machinery down (and, mid-hydration, the constructor's listener
    // latches the halt for the boot decision). Without this, an armed
    // boot-fallback retry or the config-change supersede could later cast
    // the default playlist and relight a wall the controller just cleared.
    // Window guard: SSR safety, matching this file's other dispatches.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<PlaybackHaltedDetail>(
          CustomEventName.PlaybackHalted as string,
          // The one cast-CLEARING halt: boot must not restore the persisted
          // playlist this disconnect just cleared (see PlaybackHaltedDetail).
          { detail: { clearedCast: true } }
        )
      );
    }
    return { ok: true };
  }

  /**
   * True when a deliberate stop (disconnect, sleep, error navigation)
   * landed before boot hydration finished — latched from the PlaybackHalted
   * event in the constructor.
   * InitCastInfo consults this alongside getCastInfo(): a live command
   * already took authority over the wall, so boot must not navigate or arm
   * the fallback over it. Whether the persisted playlist may still be
   * RESTORED is a separate question — see didHydrationHaltClearCast.
   */
  public wasHaltedDuringBootHydration(): boolean {
    return this.haltedDuringBootHydration;
  }

  /**
   * True when the mid-hydration halt was cast-CLEARING (disconnect): the
   * persisted playlist is exactly the state the controller cleared, so boot
   * must skip the restore entirely. Preserving halts (sleep, error
   * navigation) return false and boot restores the playlist without
   * navigating, so a later wake finds the user's content.
   */
  public didHydrationHaltClearCast(): boolean {
    return this.haltClearedCastDuringBootHydration;
  }

  /**
   * Boot-hydration precondition for the CDP status probe
   * (`window.__ffosPlayerStatus`, cross-repo recovery design §4.1). Order
   * matters: hydration still in progress always reports 'pending' —
   * whatever a mid-hydration halt or failure latched only becomes
   * meaningful once completeBootCastHydration has actually run.
   */
  public bootHydrationState():
    | 'pending'
    | 'ok'
    | 'halted_cleared'
    | 'halted_preserving'
    | 'failed' {
    if (this.bootCastHydrationPending) {
      return 'pending';
    }
    if (this.bootHydrationFailed) {
      return 'failed';
    }
    if (this.haltedDuringBootHydration) {
      return this.haltClearedCastDuringBootHydration
        ? 'halted_cleared'
        : 'halted_preserving';
    }
    return 'ok';
  }

  public setSleepMode(request: SetSleepModeRequest): SetSleepModeReply {
    console.log('[CanvasService] Set sleep mode', request.sleepMode);
    const path = request.sleepMode ? '/sleep' : '/playlist';

    // Sleep also reaches the PlaybackHalted listener in the constructor, which
    // is the general rule. This direct call is what makes it hold with no
    // window to dispatch on (SSR, node tests): the wall state is a fact about
    // this service, not about the DOM.
    if (request.sleepMode) {
      this.history.retireActiveRecentlyPlayed();
    }

    if (typeof window !== 'undefined') {
      if (!request.sleepMode) {
        const endsRealSleep = this.sleepModeEntered;
        this.sleepModeEntered = false;
        if (this.session.castInfo?.playlist?.items?.length) {
          this.session.setCastInfo({
            ...this.session.castInfo,
            castCommand: CastCommand.displayPlaylist,
          });
        } else if (endsRealSleep) {
          // Wake ending a real sleep with nothing playable: entering sleep
          // stood the fallback machinery down (PlaybackHalted), so a device
          // that slept during its first-boot/offline fallback would
          // otherwise wake to an empty player until the next controller
          // command. Re-enter the fallback flow through the same event a
          // forced displayDefaultPlaylist uses; AppContext's nonce guard
          // makes a redundant re-arm harmless. Deliberately NO setCastInfo
          // on this path: committing a playlist-less castInfo would persist
          // through useCastInfo, and the next boot's restore branch would
          // take it as real content and never arm the fallback — a reboot
          // would trade this in-session recovery for a permanent black
          // wall.
          window.dispatchEvent(
            new CustomEvent(CustomEventName.DisplayDefaultPlaylist as string)
          );
        }
      } else {
        this.sleepModeEntered = true;
        // Sleep hides playback without clearing castInfo, but the fallback
        // machinery must stand down the same as for disconnect: a published
        // config landing after sleep would otherwise re-arm the fallback,
        // whose successful cast navigates to '/' and wakes the device.
        window.dispatchEvent(
          new CustomEvent(CustomEventName.PlaybackHalted as string)
        );
      }
      window.dispatchEvent(
        new CustomEvent<NavigateEventDetail>(
          CustomEventName.Navigate as string,
          {
            detail: { path },
          }
        )
      );
    }

    return { ok: true };
  }

  /**
   * Delegates to AppContext's fallback-playlist loop instead of resolving
   * `defaultPlaylistURL` here. This handler and the boot fallback previously
   * fetched remote config through two separate RemoteConfigService instances,
   * which could disagree (an offline boot caches the hardcoded fallback URL
   * while this handler's fresh fetch returns the published one), so a
   * controld-pushed default playlist could differ from the one the player
   * pulls on its own. One dispatch path means one playlist source, and the
   * loop's retry/backoff covers transient fetch failures for free.
   *
   * The `onlyIfNoPlaylist` flag gives callers "make sure something is
   * playing" semantics: if a playlist is already on screen (for example when
   * the boot fallback recovered before feral-controld's first-pair push
   * arrived), the request is a no-op instead of stomping playback. OOM
   * recovery omits the flag on purpose — it wants the default to replace
   * possibly-OOM-causing content.
   *
   * While boot cast hydration is still pending, an `onlyIfNoPlaylist`
   * request is DEFERRED instead of answered: `castInfo` is null until
   * AppContext finishes restoring persisted cast state, so answering "no
   * playlist" in that window would arm the fallback and later cast the
   * default over the user's restored playlist. The reply is still ok — the
   * command's "make sure something plays" contract is honored either way
   * once the deferred re-evaluation runs. Forced requests are NOT deferred:
   * they are newer intent than any persisted state and must win over a
   * restore, which is exactly what the undisturbed fallback loop does.
   */
  public displayDefaultPlaylist(
    request?: DisplayDefaultPlaylistRequest
  ): DisplayDefaultPlaylistReply {
    if (request?.onlyIfNoPlaylist) {
      if (this.bootCastHydrationPending) {
        console.log(
          '[CanvasService] Deferring conditional default playlist until boot hydration completes'
        );
        this.deferredConditionalDefaultRequest = true;
        return { ok: true };
      }
      if (this.session.castInfo?.playlist?.items?.length) {
        console.log(
          '[CanvasService] Playlist already displaying, skipping default playlist'
        );
        return { ok: true };
      }
    }

    window.dispatchEvent(
      new CustomEvent(CustomEventName.DisplayDefaultPlaylist as string)
    );
    return { ok: true };
  }

  /**
   * Called by AppContext once boot cast restoration has settled (restored,
   * fallen back, or failed — the caller invokes this in a finally). Ends the
   * hydration gate above and re-evaluates a deferred `onlyIfNoPlaylist`
   * request against the now-authoritative castInfo: a restored playlist
   * makes it a no-op; an empty screen dispatches it. One-way per page load —
   * hydration happens once, and a reload rebuilds this service.
   *
   * On boot paths that already armed the fallback themselves (no castInfo,
   * castDaily, critical-temp), the replay re-arms it once more via the same
   * event. That is intentional redundancy, not a bug: both requests resolve
   * to the same default playlist and AppContext's nonce guard makes the
   * extra re-arm harmless.
   *
   * A deferred request that PREDATES a mid-hydration halt never reaches
   * this replay — the halt listener in the constructor cancels it, the same
   * way the halt cancels AppContext's active request. One deferred after
   * the halt is honored here: it is the newer intent.
   *
   * `outcome` feeds bootHydrationState()'s 'failed' value. It must be
   * SCOPED to an initCastInfo failure only — AppContext's boot catch also
   * covers initialDisplaySettings, whose failure is not fatal to playback
   * and must report 'ok' (the caller is responsible for that scoping; this
   * method just records whatever it is told). Absent/'ok' leaves the failed
   * flag clear.
   */
  public completeBootCastHydration(outcome?: 'ok' | 'failed') {
    if (!this.bootCastHydrationPending) {
      return;
    }
    if (outcome === 'failed') {
      this.bootHydrationFailed = true;
    }
    this.bootCastHydrationPending = false;
    if (this.deferredConditionalDefaultRequest) {
      this.deferredConditionalDefaultRequest = false;
      this.displayDefaultPlaylist({ onlyIfNoPlaylist: true });
    }
  }
}
