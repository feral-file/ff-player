import { useEffect, useState } from 'react';
import { BootHydration } from './BootHydration';
/** Captures the initial boot ports once, matching the provider's one-shot hydration lifetime. */
export function useBootHydration(
  ports: Omit<ConstructorParameters<typeof BootHydration>[0], 'setInitialized'>
) {
  const [isInitialized, setInitialized] = useState(false);
  const [hydration] = useState(
    () => new BootHydration({ ...ports, setInitialized })
  );
  useEffect(() => {
    hydration.initialize().catch((error: unknown) => {
      console.error('[AppContext] Error initializing context:', error);
    });
  }, [hydration]);
  return isInitialized;
}
