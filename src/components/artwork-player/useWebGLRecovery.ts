import { useEffect, useState } from 'react';
import type { ArtworkRecovery } from './ArtworkRecovery';
import type { ArtworkTransition } from './ArtworkTransition';

/** Owns the GPU probe and recovery interval; item retries remain in ArtworkRecovery. */
export class WebGLRecovery {
  private canvas: HTMLCanvasElement | null = null;
  private interval: NodeJS.Timeout | undefined;
  constructor(
    private readonly recovery: ArtworkRecovery,
    private readonly transition: ArtworkTransition
  ) {}
  private getCanvas() {
    this.canvas ??= document.createElement('canvas');
    return this.canvas;
  }
  available() {
    try {
      const canvas = this.getCanvas();
      const options = { antialias: true, failIfMajorPerformanceCaveat: true };
      const gl =
        canvas.getContext('webgl2', options) ??
        canvas.getContext('webgl', options);
      if (gl) {
        console.log(
          `[ArtworkPlayer] WebGL ${gl instanceof WebGL2RenderingContext ? '2' : gl instanceof WebGLRenderingContext ? '1' : 'null'} is available`
        );
        return true;
      }
      console.warn('[ArtworkPlayer] Both WebGL and WebGL2 is not available');
      return false;
    } catch (error) {
      console.error('[ArtworkPlayer] Error checking WebGL:', error);
      return false;
    }
  }
  lost() {
    if (!this.recovery.beginWebGLRecovery()) {
      return;
    }
    console.log('[ArtworkPlayer] WebGL context lost!');
    this.transition.hideSlots();
    this.start();
  }
  private start() {
    console.log('[ArtworkPlayer] startWebGLRecovery');
    clearInterval(this.interval);
    const startTime = Date.now();
    this.interval = setInterval(() => {
      if (Date.now() - startTime > 60000 * 10) {
        clearInterval(this.interval);
        console.log('[ArtworkPlayer] WebGL recovery timed out');
        this.recovery.finishWebGLRecovery(true);
        return;
      }
      if (!this.available()) {
        return;
      }
      clearInterval(this.interval);
      this.recovery.finishWebGLRecovery(false);
      setTimeout(() => {
        this.recovery.markArtworkPending();
        this.recovery.armLoadingDelay();
        this.transition.reloadIframe(this.transition.activeSlot);
      }, 2000);
    }, 5000);
  }
  listen() {
    const canvas = this.getCanvas();
    const lost = (event: Event) => {
      console.log('[ArtworkPlayer] webGLContextLostListener');
      event.preventDefault();
      this.lost();
    };
    const restored = () => {
      console.log('[ArtworkPlayer] WebGL context restored!');
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }
  dispose() {
    clearInterval(this.interval);
  }
}

/** Keeps the probe's listener lifecycle aligned with artwork requests. */
export function useWebGLRecovery(
  url: string,
  recovery: ArtworkRecovery,
  transition: ArtworkTransition
) {
  const [webGL] = useState(() => new WebGLRecovery(recovery, transition));
  useEffect(() => webGL.listen(), [webGL, url]);
  useEffect(
    () => () => {
      webGL.dispose();
    },
    [webGL]
  );
  return webGL;
}
