import { PreviewHTMLTag } from '@/models';
import type {
  PlaybackOutcomeKind,
  PlaybackOutcomeStage,
} from '@/models/media_health.model';
import { canvasService } from '@/services/CanvasService';

/**
 * Reports one mount attempt's outcomes to the status ring (mediaHealth
 * contract v1). ArtworkRecovery owns the attempt — when it starts, which
 * number it is, when it fails or succeeds — and this owner only carries the
 * wire shape: the source as pushed, the resolved renderer, and the time since
 * the mount. It has no state of its own worth recovering and is never
 * consulted for a playback decision.
 */
export class ArtworkOutcomeReporter {
  private source = '';
  private mountedAt = 0;
  private mediaType: string | undefined;

  /** A new mount of `source` starts the clock and forgets the previous renderer. */
  beginAttempt(source: string) {
    this.source = source;
    this.mountedAt = Date.now();
    this.mediaType = undefined;
  }

  /** The renderer chosen for this mount, once MIME detection settles. */
  noteMediaType(previewType: PreviewHTMLTag | null) {
    this.mediaType = outcomeMediaType(previewType);
  }

  /** Append an entry for the current mount. A mount without a source (nothing selected) reports nothing. */
  report(input: {
    kind: PlaybackOutcomeKind;
    stage: PlaybackOutcomeStage;
    attempt: number;
    code?: string;
  }) {
    if (!this.source) {
      return;
    }
    canvasService.recordPlaybackOutcome({
      ...input,
      source: this.source,
      mediaType: this.mediaType,
      elapsedMs: Math.max(Date.now() - this.mountedAt, 0),
    });
  }
}

/** The stable renderer token controld sees; a PDF is its own kind, a stream is still video. */
export function outcomeMediaType(
  previewType: PreviewHTMLTag | null
): string | undefined {
  switch (previewType) {
    case null:
      return undefined;
    case PreviewHTMLTag.iframePDF:
      return 'pdf';
    case PreviewHTMLTag.stream:
      return 'video';
    default:
      return previewType;
  }
}

/**
 * Translate a media element's `MediaError` into the `decode` stage the
 * contract asks for, or fall back to the `load` stage with the element kind
 * when the browser gave no code (a fetch that never produced a response, a
 * blob the element refused before decoding).
 */
export function mediaElementFailure(
  element: HTMLMediaElement | null,
  kind: 'video' | 'audio'
): { stage: 'decode' | 'load'; code: string } {
  const code = element?.error?.code;
  switch (code) {
    case MEDIA_ERR_ABORTED:
      return { stage: 'decode', code: 'aborted' };
    case MEDIA_ERR_NETWORK:
      return { stage: 'decode', code: 'network' };
    case MEDIA_ERR_DECODE:
      return { stage: 'decode', code: 'decode' };
    case MEDIA_ERR_SRC_NOT_SUPPORTED:
      return { stage: 'decode', code: 'src_not_supported' };
    default:
      return { stage: 'load', code: kind };
  }
}

// MediaError constants, spelled out because jsdom and the typed global do not
// always expose them as statics.
const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;
