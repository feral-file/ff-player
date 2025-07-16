import { LocalStorageItem } from '@/constants';
import {
  CustomEventName,
  NavigateToErrorEventDetail,
} from '@/models/custom_event';
import { ErrorType } from '@/models/error.model';

export function navigateToErrorPageAction(errorType: string) {
  const params = new URLSearchParams({
    error: errorType,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<NavigateToErrorEventDetail>(
        CustomEventName.NavigateToError,
        {
          detail: { path: `/error?${params.toString()}` },
        }
      )
    );
  }
}

export function handleOverheatingError() {
  console.error('Overheating detected, redirecting to error page');
  localStorage.setItem(LocalStorageItem.criticalTemp, 'true');
  navigateToErrorPageAction(ErrorType.Overheating);
}
