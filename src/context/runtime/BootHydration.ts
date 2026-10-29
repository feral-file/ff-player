import { LocalStorageItem } from '@/constants';
import { CastCommand, CastInfo } from '@/models';
import { canvasService } from '@/services/CanvasService';
import { contentPolicyStore } from '@/services/ContentPolicyStore';
import { stripEphemeralCastInfoFields } from '@/utils/castInfo';
import DeviceManager from '@/utils/DeviceManager';
import { normalizePlaylistIndex } from '@/utils/playlist';
interface BootPorts {
  initializeDisplaySettings: () => Promise<void>;
  setInitialized: (value: boolean) => void;
  requestFallbackPlaylist: () => void;
  setCastInfo: (cast: CastInfo | null) => void;
  navigateToHomePage: () => void;
}
/** Restores a persisted snapshot only after rechecking the authority of commands received during its reads. */
export class BootHydration {
  constructor(private readonly ports: BootPorts) {}
  async initialize() {
    try {
      await this.initializeDevice();
      this.ports.setInitialized(true);
    } catch (error) {
      console.log('Error init context', error);
    }
  }
  private async initializeDevice() {
    // Tracks which of the two awaited calls threw, so the CDP status
    // probe's bootHydration can distinguish them: only an initCastInfo
    // failure means the page is genuinely wedged (§4.1 of the cross-repo
    // recovery design — that value feeds boot recovery's only destructive
    // row). An initialDisplaySettings failure is not fatal to playback and
    // must still report 'ok'.
    let bootHydrationOutcome: 'ok' | 'failed' = 'ok';
    try {
      console.log('[AppContext] initDeviceConfigService');
      // Isolated in its own try/catch: a settings-read failure must not
      // short-circuit initCastInfo below. Letting it propagate into the
      // outer try would skip the cast restore entirely while still
      // reporting bootHydrationOutcome 'ok' (only the inner catch below
      // sets 'failed') — controld would then classify a wall that never
      // restored its cast as a succeeded boot.
      try {
        await this.ports.initializeDisplaySettings();
      } catch (error) {
        console.log('Error init display settings', error);
      }
      try {
        await contentPolicyStore.initialize();
        // Fire and forget: History is not a boot precondition, but reading it
        // now is what makes the app's first request an answer instead of
        // "still loading".
        void canvasService.primeRecentlyPlayed();
        await this.restoreCast();
      } catch (error) {
        bootHydrationOutcome = 'failed';
        throw error;
      }
    } catch (error) {
      console.log('Error init device manager', error);
    } finally {
      // Ends CanvasService's hydration gate on EVERY path (restored, fallen
      // back, castDaily/critical-temp, or thrown): a deferred
      // onlyIfNoPlaylist push re-evaluates now that castInfo is
      // authoritative. A stuck-open gate would silently drop claim-time
      // pushes forever, so this must not depend on initCastInfo succeeding.
      canvasService.completeBootCastHydration(bootHydrationOutcome);
    }
  }
  private async readSnapshot() {
    console.log('[AppContext] initCastInfo');

    let castInfo: CastInfo | null = null;

    // Check if this is a version update reload
    const versionUpdateReloadValue = await DeviceManager.getItem(
      LocalStorageItem.versionUpdateReload
    );
    const isVersionUpdateReload = versionUpdateReloadValue === 'true';

    if (isVersionUpdateReload) {
      console.log(
        '[AppContext] Version update reload detected, skipping boot playlist'
      );
      await DeviceManager.removeItem(LocalStorageItem.versionUpdateReload);
    }

    if (!isVersionUpdateReload) {
      const bootPlaylist = await DeviceManager.getBootPlaylist();
      if (bootPlaylist?.items?.length) {
        // Persisted playlists are recovery snapshots, not incoming cast
        // commands: keep legacy state playable across upgrades and avoid
        // revalidating snapshots already accepted by newer versions. Source
        // validation belongs exclusively at CanvasService's live cast boundary.
        console.log('[AppContext] Boot playlist found, casting boot playlist');
        castInfo = {
          castCommand: CastCommand.displayPlaylist,
          playlist: bootPlaylist,
          index: 0,
          isPaused: false,
          playlistId: bootPlaylist.id,
          // Restore the origin the cast was accepted under. A record written
          // before this key existed reads as curated, so an upgrade cannot
          // turn an old boot cast into an unfiltered personal one.
          contentContext: await DeviceManager.getBootPlaylistContentContext(),
        };
      }
    }

    // CastInfo follows the same recovery contract as bootPlaylist above. A
    // stored snapshot must retain its original playback semantics; validating
    // again here would make an upgrade reject content that was already active.
    castInfo ??= await DeviceManager.getCastInfo();

    const criticalTempValue = castInfo
      ? await DeviceManager.getItem(LocalStorageItem.criticalTemp)
      : null;

    return { castInfo, criticalTempValue };
  }
  private async restoreCast() {
    const snapshot = await this.readSnapshot();
    let { castInfo } = snapshot;
    const { criticalTempValue } = snapshot;
    // A live command can take authority while the storage reads above are in
    // flight: the CDP entry point is up before hydration finishes, so a
    // forced displayDefaultPlaylist (OOM-recovery reload), an explicit
    // cast — or a disconnect — can already have decided the wall by now.
    // Everything read from storage is by definition staler than a live
    // command, so acting on it — restoring castInfo over a just-cast forced
    // default, or arming the fallback from a stale castDaily/critical-temp
    // marker — would overwrite what the controller just chose. A committed
    // cast shows in getCastInfo(); a deliberate stop (disconnect, sleep,
    // error navigation) leaves castInfo null and is visible only through
    // the hydration-halt flags (null alone cannot distinguish "stopped"
    // from "nothing happened").
    //
    // The halts are NOT all alike, though. Only a cast-CLEARING halt
    // (disconnect) may skip the restore entirely: the persisted playlist is
    // exactly the state the controller cleared. A preserving halt (sleep,
    // error navigation) leaves the persisted playlist valid — it is what a
    // later wake must find — so boot still restores it below, but ONLY into
    // CanvasService (the copy setSleepMode(false) reads on wake), never into
    // React state, and suppresses every fallback-arming branch (a successful
    // fallback cast navigates to '/' and would relight the stopped wall; a
    // wake with nothing playable re-arms via CanvasService's own
    // DisplayDefaultPlaylist re-entry instead). React state must stay
    // untouched because the halt's Navigate('/sleep' | '/error') was
    // dispatched while isInitialized was still false — the only Navigate
    // listener mounts inside InitializedAppWrapper, so the event was DROPPED
    // and the route is still '/'; a restored React castInfo would then drive
    // AppWrapper's cast effect to push('/playlist') the moment
    // isInitialized flips, relighting the wall the halt deliberately
    // stopped. Without the service-side restore, a sleep landing
    // mid-hydration would make the wake path find no playlist and cast —
    // and persist — the default over the user's content.
    //
    // One-shot markers need no cleanup on the cast branch: any live
    // displayPlaylist/displayDefaultPlaylist command already cleared
    // criticalTemp in CanvasService's commandHandler. A mid-hydration halt
    // leaves the marker set, benignly — the next boot re-evaluates it and
    // the ordinary removeItem self-clears when it fires. Everything below
    // this check is synchronous, so no further command can interleave
    // before the boot decision applies.
    const halted = canvasService.wasHaltedDuringBootHydration();
    if (
      canvasService.getCastInfo() ||
      (halted && canvasService.didHydrationHaltClearCast())
    ) {
      console.log(
        '[AppContext] Live command decided the wall during hydration, skipping boot cast state'
      );
      return;
    }

    if (castInfo) {
      if (criticalTempValue === 'true') {
        if (halted) {
          // Marker left in place: it is gated on persisted castInfo and
          // self-clears when it eventually fires.
          return;
        }
        // Fetch and cast default playlist after critical temp reset.
        this.ports.requestFallbackPlaylist();
        // Fire-and-forget (same idiom as CanvasService's commandHandler):
        // awaiting here would reopen an interleaving window after the
        // live-cast check above.
        DeviceManager.removeItem(LocalStorageItem.criticalTemp).catch(
          (error: unknown) => {
            console.error('[AppContext] Error removing criticalTemp:', error);
          }
        );
        return;
      }

      if (castInfo.castCommand?.toString() === 'castDaily') {
        if (halted) {
          // Nothing restorable behind the marker; a wake with nothing
          // playable re-enters the fallback via DisplayDefaultPlaylist.
          return;
        }
        this.ports.requestFallbackPlaylist();
        return;
      }

      if (castInfo.playlist?.items?.length && castInfo.index !== undefined) {
        const normalizedIndex = normalizePlaylistIndex(
          castInfo.index,
          castInfo.playlist.items.length
        );
        if (normalizedIndex !== castInfo.index) {
          castInfo = {
            ...castInfo,
            index: normalizedIndex,
          };
        }
      }

      // Ephemeral strip, not just the legacy timeline one: boot recovery must
      // not restore a stored renderStatus for an artwork that has not mounted.
      const cleanCastInfo = stripEphemeralCastInfoFields(castInfo);
      canvasService.setCastInfo(cleanCastInfo, false);
      if (!halted) {
        // The service reapplies current policy to old recovery snapshots.
        // Publishing the pre-filter copy would bypass that boot boundary.
        this.ports.setCastInfo(canvasService.getCastInfo());
        this.ports.navigateToHomePage();
      }
    } else if (!halted) {
      // Cast default playlist
      console.log('[AppContext] No castInfo found, fetching default playlist');
      this.ports.requestFallbackPlaylist();
    }
  }
}
