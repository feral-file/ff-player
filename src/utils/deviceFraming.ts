import { Scaling, type DP1DisplayPreference } from '@/models/dp1.model';

/** A saved owner choice, distinct from the current artwork's effective scaling. */
export type DeviceFraming = 'artwork' | 'fit' | 'fill';

/** Unknown or absent saved values follow the authored presentation. */
export function deviceFraming(value: unknown): DeviceFraming {
  return value === 'fit' || value === 'fill' ? value : 'artwork';
}

/** Apply only the owner's framing; never copy device settings into signed art. */
export function applyDeviceFraming(
  display: DP1DisplayPreference,
  preference: unknown
): DP1DisplayPreference {
  const framing = deviceFraming(preference);
  if (framing === 'artwork' || display.userOverrides === false) {return display;}
  return { ...display, scaling: framing === 'fill' ? Scaling.Fill : Scaling.Fit };
}
