import {
  FileUseAudio,
  FileUseIframePDF,
  FileUseImage,
  FileUseObject,
  FileUseVideo,
  MIMETypeAudio,
  MIMETypeImage,
  MIMETypeObject,
  MIMETypePdf,
  MIMETypeUseStream as MIMETypeStreamVideo,
  MIMETypeSvg,
  MIMETypeVideo,
  MITETypeIframe,
  PreviewHTMLTag,
} from '@/models';
import { DP1DisplayPreference } from '@/models/dp1.model';

export interface ArtworkPlayerProps {
  previewURL: string;
  isCustomView?: boolean;
  keyboardCode?: number;
  artworkPreviewMIMEType?: string;
  displayPreferences: DP1DisplayPreference;
  // Stable identity of the current playlist item. When adjacent items share
  // the same URL, this discriminates them so the player can (a) restart
  // playback on transition and (b) reject `ended` events from the previous
  // item once the next one has become current.
  itemIdentity?: string;
  /**
   * Key of the current showing (useShowingKey); scopes the viewer's session
   * Fit/Fill adjustment. Falls back to itemIdentity when absent.
   */
  sessionKey?: string;
  onRegisterArtworkReload?: (reload: (() => void) | null) => void;
  // Fired when a time-based source (video/audio) reaches end-of-stream.
  // The HTML5 media element only emits `ended` when its `loop` attribute is
  // false, so this callback is naturally gated by display.loop. Per DP-1
  // §4.1, the consumer (PlaylistClient) advances to the next item.
  // The argument is the firing slot's itemIdentity so the consumer can
  // drop events that arrive after the playlist has already moved past them.
  onSourceEnded?: (itemIdentity: string) => void;
  // Fired once a work has failed to render ARTWORK_FAILURE_RETRY_LIMIT times
  // in a row (feral-file/ff-player#307): the player gave up retrying this
  // item in place, and the consumer (PlaylistClient) should move on to the
  // next item the same way it does for onSourceEnded. The argument is the
  // failing slot's itemIdentity, gated the same way onSourceEnded's is.
  onArtworkExhausted?: (itemIdentity: string) => void;
  // Fired when an incoming slot actually becomes the visible artwork — at
  // first paint of an initial slot, at crossfade start, or at the sequential
  // handoff's fade-in. Selection state (currentIndex) moves ahead of this on
  // slow loads because the outgoing artwork deliberately stays on screen
  // until incoming media is ready; consumers that describe "what is on the
  // wall" (the tombstone label, feral-file#3452) must key off this commit,
  // never off selection.
  onItemCommitted?: (itemIdentity: string) => void;
  // Unlike onItemCommitted, this is never called for a failed transition.
  // Playback history uses it; tombstone keeps the established transition hook.
  onItemPlayed?: (itemIdentity: string) => void;
}
export type SlotIndex = 0 | 1;
export interface SlotLayer {
  previewURL: string;
  displayPreviewURL: string;
  displaySoftwareURL: string;
  mimeType: string | null;
  previewType: PreviewHTMLTag | null;
  isStreaming: boolean;
  loading: boolean;
  iframeKey: number;
  itemIdentity: string;
  showingKey: string;
}
export function createSlotLayer(
  previewURL: string,
  iframeKey: number,
  identity: Pick<SlotLayer, 'itemIdentity' | 'showingKey'>
): SlotLayer {
  return {
    previewURL,
    displayPreviewURL: '',
    displaySoftwareURL: '',
    mimeType: null,
    previewType: null,
    isStreaming: false,
    loading: true,
    iframeKey,
    ...identity,
  };
}
export function isEmbeddedHeavy(t: PreviewHTMLTag | null): boolean {
  return (
    t === PreviewHTMLTag.iframe ||
    t === PreviewHTMLTag.object ||
    t === PreviewHTMLTag.model
  );
}
export function isModelMimeType(type: string): boolean {
  const mediaType = type.split(';')[0].trim().toLowerCase();
  return mediaType === 'model/gltf-binary' || mediaType === 'model/gltf+json';
}
export const FADE_IN_OUT_DURATION_MS = 650;
export const SLOT_INDICES = [0, 1] as const;
export function getPreviewTypeConfig(type: string): {
  previewType: PreviewHTMLTag;
  isStreaming: boolean;
} {
  if (!type) {
    return { previewType: PreviewHTMLTag.iframe, isStreaming: false };
  }
  type = type.toLowerCase();
  if (MIMETypeStreamVideo.includes(type)) {
    return { previewType: PreviewHTMLTag.video, isStreaming: true };
  }
  if (MITETypeIframe.includes(type)) {
    return { previewType: PreviewHTMLTag.iframe, isStreaming: false };
  }
  if (type.match(MIMETypeSvg)) {
    return { previewType: PreviewHTMLTag.object, isStreaming: false };
  }
  if (isModelMimeType(type)) {
    return { previewType: PreviewHTMLTag.model, isStreaming: false };
  }
  if (FileUseObject.includes(type) || type.match(MIMETypeObject)) {
    return { previewType: PreviewHTMLTag.object, isStreaming: false };
  }
  if (FileUseVideo.includes(type) || type.match(MIMETypeVideo)) {
    return { previewType: PreviewHTMLTag.video, isStreaming: false };
  }
  if (FileUseAudio.includes(type) || type.match(MIMETypeAudio)) {
    return { previewType: PreviewHTMLTag.audio, isStreaming: false };
  }
  if (FileUseImage.includes(type) || type.match(MIMETypeImage)) {
    return { previewType: PreviewHTMLTag.image, isStreaming: false };
  }
  if (FileUseIframePDF.includes(type) || type.match(MIMETypePdf)) {
    return { previewType: PreviewHTMLTag.iframePDF, isStreaming: false };
  }
  return { previewType: PreviewHTMLTag.iframe, isStreaming: false };
}
