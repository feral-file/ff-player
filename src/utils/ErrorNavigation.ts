import { LocalStorageItem } from '@/constants';
import {
  CustomEventName,
  NavigateEventDetail,
} from '@/models/custom_event';
import { ErrorType } from '@/models/error.model';
import DeviceManager from './DeviceManager';

export function navigateToErrorPageAction(errorType: string) {
  const params = new URLSearchParams({
    error: errorType,
  });

  if (typeof window !== 'undefined') {
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

export function handleServiceFailedError() {
  navigateToErrorPageAction(ErrorType.ServiceFailed);
}
