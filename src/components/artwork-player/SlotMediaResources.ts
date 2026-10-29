import { CLIENT_BANDWIDTH_HINT } from '@/constants';
import { PreviewHTMLTag, RenderStatus } from '@/models';
import { BlobLoadedMediaType, createMediaLoader } from '@/utils/mediaLoader';
import Hls from 'hls.js';
import { createRef } from 'react';
import { SlotIndex, SlotLayer, isEmbeddedHeavy } from './artworkTypes';
export interface MediaEvents {
  isCurrent: (index: SlotIndex, layer?: SlotLayer) => boolean;
  loaded: (index: SlotIndex, layer?: SlotLayer, success?: boolean) => boolean;
  failed: (index?: SlotIndex, layer?: SlotLayer) => void;
  note: (url: string, failed: boolean) => void;
  targetSlot: () => SlotIndex;
  incomingSlot: () => SlotIndex | null;
  status: () => RenderStatus | undefined;
  matchesTarget: (url: string, identity: string) => boolean;
}
interface MediaAttempt {
  slotIndex: SlotIndex;
  layer: SlotLayer;
  events: MediaEvents;
  abortController: AbortController;
  mediaCleanupFns: (() => void)[];
  cancelled: boolean;
}
/** Owns both slots' browser resources. Pausing a fade preserves the outgoing frame; teardown releases that slot only. */
export class SlotMediaResources {
  private imageRefs = [
    createRef<HTMLImageElement>(),
    createRef<HTMLImageElement>(),
  ];
  private videoRefs = [
    createRef<HTMLVideoElement>(),
    createRef<HTMLVideoElement>(),
  ];
  private audioRefs = [
    createRef<HTMLAudioElement>(),
    createRef<HTMLAudioElement>(),
  ];
  private iframeRefs = [
    createRef<HTMLIFrameElement>(),
    createRef<HTMLIFrameElement>(),
  ];
  private mediaLoaders = {
    current: [createMediaLoader(), createMediaLoader()],
  };
  private hlsInstancesRef: { current: [Hls | null, Hls | null] } = {
    current: [null, null],
  };
  private hlsLoadedURLRef = { current: ['', ''] };
  private playedVideoURLRef = { current: ['', ''] };
  private mountFailedRef = { current: [false, false] };
  private mediaAbortControllerRef: {
    current: (AbortController | undefined)[];
  } = { current: [] };
  private artworkLoadWatchdogRef: { current: (NodeJS.Timeout | undefined)[] } =
    { current: [] };
  refs(index: SlotIndex) {
    return {
      image: this.imageRefs[index],
      video: this.videoRefs[index],
      audio: this.audioRefs[index],
      iframe: this.iframeRefs[index],
    };
  }
  frame(index: SlotIndex) {
    return this.iframeRefs[index].current;
  }
  video(index: SlotIndex) {
    return this.videoRefs[index].current;
  }
  resetMount(index: SlotIndex) {
    this.mountFailedRef.current[index] = false;
  }
  abort(index: SlotIndex) {
    this.mediaAbortControllerRef.current[index]?.abort();
    this.mediaAbortControllerRef.current[index] = undefined;
  }
  pauseAndTeardownSlot(slotIndex: SlotIndex) {
    this.hlsInstancesRef.current[slotIndex]?.destroy();
    this.hlsInstancesRef.current[slotIndex] = null;
    this.hlsLoadedURLRef.current[slotIndex] = '';
    this.videoRefs[slotIndex].current?.pause();
    this.audioRefs[slotIndex].current?.pause();
    this.playedVideoURLRef.current[slotIndex] = '';
  }
  pauseSlotPlayback(slotIndex: SlotIndex) {
    this.hlsInstancesRef.current[slotIndex]?.stopLoad();
    this.videoRefs[slotIndex].current?.pause();
    this.audioRefs[slotIndex].current?.pause();
    this.playedVideoURLRef.current[slotIndex] = '';
  }
  reTryToPlayVideo(slotIndex: SlotIndex) {
    const el = this.videoRefs[slotIndex].current;
    if (el) {
      el.muted = true;
      const playPromise = el.play() as Promise<void> | undefined;
      void playPromise?.catch((error: unknown) => {
        console.log('[ArtworkPlayer] Error play video', JSON.stringify(error));
      });
    }
  }
  playVideoForSlot(
    events: MediaEvents,
    slotIndex: SlotIndex,
    layer: SlotLayer,
    videoElement: HTMLVideoElement
  ) {
    const targetSlot = events.targetSlot();
    if (
      !events.isCurrent(slotIndex, layer) ||
      this.playedVideoURLRef.current[slotIndex] === layer.previewURL ||
      targetSlot !== slotIndex
    ) {
      return;
    }
    this.playedVideoURLRef.current[slotIndex] = layer.previewURL;
    const playPromise = videoElement.play() as Promise<void> | undefined;
    if (!playPromise) {
      events.loaded(slotIndex, layer);
      return;
    }
    void playPromise
      .catch((error: unknown) => {
        console.log('Error play video', error);
        this.reTryToPlayVideo(slotIndex);
      })
      .finally(() => {
        events.loaded(slotIndex, layer);
      });
  }
  setupStreamingVideoForSlot(
    slotIndex: SlotIndex,
    layer: SlotLayer | null,
    events: MediaEvents
  ) {
    const videoElement = this.videoRefs[slotIndex].current;
    if (!layer || layer.previewType !== PreviewHTMLTag.video || !videoElement) {
      return undefined;
    }
    let hlsInstance: Hls | null = null;
    if (
      layer.isStreaming &&
      Hls.isSupported() &&
      layer.displayPreviewURL.endsWith('.m3u8')
    ) {
      hlsInstance = new Hls({
        maxBufferSize: 60 * 1000 * 1000,
        maxBufferLength: 30,
        liveSyncDuration: 10,
      });
      this.hlsInstancesRef.current[slotIndex] = hlsInstance;
      hlsInstance.attachMedia(videoElement);
      hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (!events.isCurrent(slotIndex, layer)) {
          return;
        }
        const sourceURL = `${layer.displayPreviewURL}?clientBandwidthHint=${CLIENT_BANDWIDTH_HINT.toString()}`;
        if (this.hlsLoadedURLRef.current[slotIndex] !== sourceURL) {
          this.hlsLoadedURLRef.current[slotIndex] = sourceURL;
          hlsInstance?.loadSource(sourceURL);
        }
        this.playVideoForSlot(events, slotIndex, layer, videoElement);
      });
      const failSlotAndTeardownHls = () => {
        events.failed(slotIndex, layer);
        hlsInstance?.destroy();
        if (this.hlsInstancesRef.current[slotIndex] === hlsInstance) {
          this.hlsInstancesRef.current[slotIndex] = null;
        }
      };
      hlsInstance.on(Hls.Events.ERROR, function (_event, data) {
        if (
          data.type === Hls.ErrorTypes.MEDIA_ERROR &&
          data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL
        ) {
          if (events.isCurrent(slotIndex, layer)) {
            hlsInstance?.recoverMediaError();
          }
          return;
        }
        if (data.fatal) {
          failSlotAndTeardownHls();
        }
      });
    }
    return () => {
      hlsInstance?.destroy();
      if (this.hlsInstancesRef.current[slotIndex] === hlsInstance) {
        this.hlsInstancesRef.current[slotIndex] = null;
      }
      if (
        this.hlsLoadedURLRef.current[slotIndex].startsWith(
          layer.displayPreviewURL
        )
      ) {
        this.hlsLoadedURLRef.current[slotIndex] = '';
      }
    };
  }
  /** Media setup has its own key; an iframe-only GPU reload does not restart this attempt. */
  setupMediaForSlot(
    slotIndex: SlotIndex,
    layer: SlotLayer | null,
    events: MediaEvents
  ) {
    if (!layer?.displayPreviewURL || layer.isStreaming) {
      return undefined;
    }
    const attempt: MediaAttempt = {
      slotIndex,
      layer,
      events,
      abortController: new AbortController(),
      mediaCleanupFns: [],
      cancelled: false,
    };
    this.mediaAbortControllerRef.current[slotIndex] = attempt.abortController;
    this.startWatchdog(attempt);
    void this.loadMedia(attempt);
    return () => {
      this.cleanupAttempt(attempt);
    };
  }
  private startWatchdog(attempt: MediaAttempt) {
    const { slotIndex, layer, events } = attempt;
    clearTimeout(this.artworkLoadWatchdogRef.current[slotIndex]);
    const duration =
      isEmbeddedHeavy(layer.previewType) ||
      layer.previewType === PreviewHTMLTag.iframePDF
        ? 45000
        : 15000;
    this.artworkLoadWatchdogRef.current[slotIndex] = setTimeout(() => {
      this.artworkLoadWatchdogRef.current[slotIndex] = undefined;
      if (
        attempt.cancelled ||
        !events.matchesTarget(layer.previewURL, layer.itemIdentity) ||
        (events.status() !== RenderStatus.pending &&
          events.status() !== RenderStatus.loading)
      ) {
        return;
      }
      events.failed(slotIndex, layer);
    }, duration);
  }
  private handleMediaError(
    attempt: MediaAttempt,
    mediaType: BlobLoadedMediaType
  ) {
    const { slotIndex, layer, events } = attempt;
    return (error: Error) => {
      if (!events.isCurrent(slotIndex, layer)) {
        return;
      }
      console.error(`[ArtworkPlayer] ${mediaType} load failed:`, error);
      if (events.loaded(slotIndex, layer, false)) {
        events.failed(slotIndex, layer);
        if (mediaType === 'video' || mediaType === 'audio') {
          this.mountFailedRef.current[slotIndex] = true;
        }
        events.note(layer.previewURL, true);
      }
    };
  }
  private async loadMedia(attempt: MediaAttempt) {
    if (attempt.cancelled) {
      return;
    }
    const { slotIndex, layer } = attempt;
    if (
      layer.previewType === PreviewHTMLTag.image &&
      this.imageRefs[slotIndex].current
    ) {
      await this.loadImage(attempt);
    } else if (
      layer.previewType === PreviewHTMLTag.video &&
      !layer.isStreaming &&
      this.videoRefs[slotIndex].current
    ) {
      await this.loadVideo(attempt);
    } else if (
      layer.previewType === PreviewHTMLTag.audio &&
      this.audioRefs[slotIndex].current
    ) {
      await this.loadAudio(attempt);
    }
  }
  private async loadImage(attempt: MediaAttempt) {
    const { slotIndex, layer, events, abortController, mediaCleanupFns } =
      attempt;
    const el = this.imageRefs[slotIndex].current;
    if (!el) {
      return;
    }
    const markImageReady = () => {
      let decoded: Promise<unknown>;
      try {
        decoded =
          typeof el.decode === 'function' ? el.decode() : Promise.resolve();
      } catch {
        decoded = Promise.resolve();
      }
      void decoded
        .catch(() => undefined)
        .finally(() => {
          if (!attempt.cancelled && events.loaded(slotIndex, layer)) {
            events.note(layer.previewURL, false);
          }
        });
    };
    el.onload = markImageReady;
    el.onerror = () => {
      this.handleMediaError(attempt, 'image')(new Error('Image load failed'));
    };
    mediaCleanupFns.push(() => {
      el.onload = null;
      el.onerror = null;
    });
    await this.mediaLoaders.current[slotIndex].loadMedia({
      url: layer.displayPreviewURL,
      mediaType: 'image',
      element: el,
      onLoad: markImageReady,
      onError: this.handleMediaError(attempt, 'image'),
      signal: abortController.signal,
    });
    if (el.complete && el.naturalWidth > 0) {
      markImageReady();
    }
  }
  private async loadVideo(attempt: MediaAttempt) {
    const { slotIndex, layer, events, abortController, mediaCleanupFns } =
      attempt;
    const el = this.videoRefs[slotIndex].current;
    if (!el) {
      return;
    }
    const handleNonStreamingVideoReady = () => {
      const claimed = events.incomingSlot();
      if (
        (claimed === null || claimed === slotIndex) &&
        !this.mountFailedRef.current[slotIndex]
      ) {
        events.note(layer.previewURL, false);
      }
      this.playVideoForSlot(events, slotIndex, layer, el);
    };
    el.addEventListener('loadeddata', handleNonStreamingVideoReady);
    el.onerror = () => {
      this.handleMediaError(attempt, 'video')(new Error('Video load failed'));
    };
    mediaCleanupFns.push(() => {
      el.removeEventListener('loadeddata', handleNonStreamingVideoReady);
      el.onerror = null;
    });
    await this.mediaLoaders.current[slotIndex].loadMedia({
      url: layer.displayPreviewURL,
      mediaType: 'video',
      element: el,
      onLoad: () => {
        events.loaded(slotIndex, layer);
      },
      onError: this.handleMediaError(attempt, 'video'),
      signal: abortController.signal,
    });
  }
  private async loadAudio(attempt: MediaAttempt) {
    const { slotIndex, layer, events, abortController, mediaCleanupFns } =
      attempt;
    const el = this.audioRefs[slotIndex].current;
    if (!el) {
      return;
    }
    const handleAudioReady = () => {
      const claimed = events.loaded(slotIndex, layer);
      if (claimed && !this.mountFailedRef.current[slotIndex]) {
        events.note(layer.previewURL, false);
      }
    };
    el.addEventListener('loadeddata', handleAudioReady);
    el.onerror = () => {
      this.handleMediaError(attempt, 'audio')(new Error('Audio load failed'));
    };
    mediaCleanupFns.push(() => {
      el.removeEventListener('loadeddata', handleAudioReady);
      el.onerror = null;
    });
    await this.mediaLoaders.current[slotIndex].loadMedia({
      url: layer.displayPreviewURL,
      mediaType: 'audio',
      element: el,
      onLoad: () => {
        events.loaded(slotIndex, layer);
      },
      onError: this.handleMediaError(attempt, 'audio'),
      signal: abortController.signal,
    });
  }
  private cleanupAttempt(attempt: MediaAttempt) {
    const { slotIndex, abortController, mediaCleanupFns } = attempt;
    attempt.cancelled = true;
    abortController.abort();
    if (this.mediaAbortControllerRef.current[slotIndex] === abortController) {
      this.mediaAbortControllerRef.current[slotIndex] = undefined;
    }
    mediaCleanupFns.forEach(cleanup => {
      cleanup();
    });
    this.mediaLoaders.current[slotIndex].cleanup();
    clearTimeout(this.artworkLoadWatchdogRef.current[slotIndex]);
    this.artworkLoadWatchdogRef.current[slotIndex] = undefined;
  }
}
