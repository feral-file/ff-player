import { LocalStorageItem } from '@/constants';
import {
  CustomEventName,
  NavigateToErrorEventDetail,
} from '@/models/custom_event';
import { ErrorType } from '@/models/error.model';
import { canvasService } from '@/services/CanvasService';

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
  localStorage.setItem(LocalStorageItem.criticalTemp, 'true');
  canvasService.disconnect();
  navigateToErrorPageAction(ErrorType.Overheating);
}
