import { LocalStorageItem } from '@/constants';
import {
  CustomEventName,
  NavigateEventDetail,
} from '@/models/custom_event';
import { ErrorType } from '@/models/error.model';
import DeviceManager from './DeviceManager';

/**
 * Routes the wall to `/error?error=<type>` and stands the fallback machinery
 * down first (PlaybackHalted): the error page deliberately takes the wall off
 * playback, and an armed boot-fallback retry completing later would
 * `router.push('/')` and resume playback over the error the daemon chose to
 * display. Recovery re-arms through the criticalTemp boot path after the
 * watchdog reboot, not by out-waiting the error page.
 */
export function navigateToErrorPageAction(errorType: string) {
  const params = new URLSearchParams({
    error: errorType,
  });

  if (typeof window !== 'undefined') {
    // The error page deliberately takes the wall off playback (overheating,
    // service failure), so the fallback machinery must stand down exactly as
    // for disconnect/sleep: an armed boot-fallback retry completing later
    // would `router.push('/')` — its pathname guard fires precisely when
    // parked off '/' — and resume playback over the error the daemon chose
    // to display. Recovery re-arms through the criticalTemp boot path after
    // the watchdog reboot, not by out-waiting the error page.
    window.dispatchEvent(
      new CustomEvent(CustomEventName.PlaybackHalted as string)
    );
    window.dispatchEvent(
      new CustomEvent<NavigateEventDetail>(
        CustomEventName.Navigate,
        {
          detail: { path: `/error?${params.toString()}` },
        }
      )
    );
  }
}

/**
 * Critical-temperature watchdog path: persists the one-shot criticalTemp
 * marker (so the next boot re-arms the fallback playlist) and parks the wall
 * on the error page. Navigation proceeds even if the marker write fails —
 * an overheating device must stop rendering either way.
 */
export function handleOverheatingError() {
  DeviceManager.setItem(LocalStorageItem.criticalTemp, 'true')
    .then(() => {
      navigateToErrorPageAction(ErrorType.Overheating);
    })
    .catch((error: unknown) => {
      console.error('[ErrorNavigation] Error setting critical temp:', error);
      // Still navigate to error page even if storage fails
      navigateToErrorPageAction(ErrorType.Overheating);
    });
}

/**
 * Watchdog service-failure path: parks the wall on the error page (no boot
 * marker — unlike overheating, there is no reboot-time recovery contract).
 */
export function handleServiceFailedError() {
  navigateToErrorPageAction(ErrorType.ServiceFailed);
}
