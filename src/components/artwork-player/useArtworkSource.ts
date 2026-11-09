import { PreviewHTMLTag } from '@/models';
import { DP1DisplayPreference, Scaling } from '@/models/dp1.model';
import { dataDocumentURL, releaseDataDocumentURLs } from '@/utils/dataDocument';
import {
  ContentTypeDetectionError,
  appendDisplayModeParam,
  getContentTypeFromURL,
  resolveArtworkSourceURL,
} from '@/utils/helper';
import {
  forgetWorkOrigins,
  resolveWorkOrigin,
  subscribeWorkOrigins,
  usesWorkOrigin,
} from '@/utils/workOrigin';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ArtworkRecovery } from './ArtworkRecovery';
import type { ArtworkTransition, Slots } from './ArtworkTransition';
import {
  ArtworkPlayerProps,
  SlotLayer,
  getPreviewTypeConfig,
  isModelMimeType,
} from './artworkTypes';

interface SourceOwners {
  transition: ArtworkTransition;
  recovery: ArtworkRecovery;
  note: (url: string, failed: boolean) => void;
}

/** An absent or empty authored MIME type uses the existing network detector; a probe that answered non-2xx or not at all is reported to the recovery owner even when inference carries on. */
async function detectPreview(
  url: string,
  suppliedType: string | undefined,
  onHeadFailure: (code: string) => void
) {
  const resolvedType =
    suppliedType !== undefined && suppliedType !== ''
      ? suppliedType
      : await getContentTypeFromURL(url, onHeadFailure);
  const mimeType = resolvedType.toLowerCase();
  return { mimeType, ...getPreviewTypeConfig(mimeType) };
}

/** The untyped fallback: an iframe, or the work-origin shell when the source uses one. */
function fallbackIframeSource(url: string): Partial<SlotLayer> {
  return {
    previewType: PreviewHTMLTag.iframe,
    isStreaming: false,
    displayPreviewURL: url,
    displaySoftwareURL: usesWorkOrigin(url) ? '' : url,
    mimeType: null,
  };
}

/**
 * Classifies a detection failure and applies the matching recovery action.
 * Returns true when it fully handled the failure (the device-wide offline
 * backdrop, or a declared per-item failure for a source proven — now or
 * previously — unreachable); false means the caller falls back to the
 * iframe render.
 *
 * feral-file#3583, live-verified on an FF1: after enough consecutive
 * timeouts against the same dead host, Chromium stops waiting out the
 * probe's own AbortController and starts rejecting `fetch` natively and fast
 * instead (a bare `TypeError`, indistinguishable from a CORS block by shape
 * alone) — a device-level connection-failure cache/backoff, not a change in
 * the underlying source. So `timedOut` alone is remembered per URL in
 * `confirmedUnreachable`: once ANY attempt proves a source out via a genuine
 * timeout, every later attempt against that same URL is treated as failed
 * too, regardless of how that later attempt's own rejection happened to
 * shape up. Declaring it failed — instead of rendering an iframe at a source
 * proven dead, which would just show Chromium's own in-frame net-error page
 * indefinitely — uses the normal per-item path: the "cannot be displayed"
 * message and the existing retry/skip budget.
 */
function handleDetectionFailure(
  error: unknown,
  url: string,
  confirmedUnreachable: Set<string>,
  failureOwners: {
    noteRef: { current: (url: string, failed: boolean) => void };
    recovery: ArtworkRecovery;
    transition: ArtworkTransition;
  }
): boolean {
  const { noteRef, recovery, transition } = failureOwners;
  if (!(error instanceof ContentTypeDetectionError)) {
    return false;
  }
  // Recorded before branching on isNetworkFailure: the two flags are
  // independent (see the class doc on ContentTypeDetectionError) and can
  // both be true at once — e.g. a transient offline blip corroborates
  // isNetworkFailure for the very attempt whose AbortController also timed
  // out. Checking timedOut only in an isNetworkFailure-false branch would
  // drop that attempt's unreachability evidence, so a later attempt against
  // the same URL (once the device is back online and failing fast instead)
  // would wrongly fall through to the iframe render again.
  if (error.timedOut) {
    confirmedUnreachable.add(url);
  } else if (error.reachedServer) {
    // The source answered this attempt — even unhelpfully (feral-file#3583
    // review F2: a gateway that timed out once can start answering, e.g.
    // with a 405, on a later attempt). That disproves any earlier `timedOut`
    // verdict remembered for this URL, so the reached-but-unhelpful-HTTP
    // classification below stays genuinely unchanged instead of being
    // overridden by stale memory.
    confirmedUnreachable.delete(url);
  }
  if (error.isNetworkFailure) {
    // Corroborated offline. The `detect/network` ring entry was already
    // recorded by the probe observer when no response arrived, so this
    // path only raises the offline signal and fails the mount.
    noteRef.current(url, true);
    recovery.markArtworkFailed();
    return true;
  }
  if (confirmedUnreachable.has(url)) {
    // Unlike the isNetworkFailure branch above (pre-existing, unchanged),
    // this declared failure must settle the incoming slot through the
    // transition owner itself: `transition.fail()` commits the failed slot
    // (releasing the settings latch so a later item can still commit) before
    // calling `recovery.fail()`, instead of leaving the slot wedged at
    // `loading: true` forever (feral-file#3583 review F1). Its source URLs
    // stay empty — `resolveSource` was never reached on this path — so no
    // fallback iframe mounts for the failed slot either.
    // Ring (mediaHealth v1): the probe observer already recorded this
    // attempt's `detect/network` (device-local, never counted). The
    // attempt's own verdict is `detect/unreachable`: the probe's 10 s budget
    // proved the host silent, now or on an earlier attempt for this URL, so
    // it counts like a watchdog expiry, not like an offline blip.
    transition.fail(
      { stage: 'detect', code: 'unreachable' },
      transition.incomingSlot ?? undefined
    );
    return true;
  }
  return false;
}

/** MIME detection owns only this request; a superseded result cannot patch the next slot. */
export function useArtworkSource(
  props: ArtworkPlayerProps,
  showingKey: string,
  reloadTick: number,
  owners: SourceOwners
) {
  const { transition, recovery, note } = owners;
  const noteRef = useRef(note);
  useLayoutEffect(() => {
    noteRef.current = note;
  }, [note]);
  /** Per-URL memory for `handleDetectionFailure` — see its doc comment. */
  const confirmedUnreachableRef = useRef<Set<string>>(new Set());
  const {
    previewURL: url,
    artworkPreviewMIMEType: suppliedType,
    itemIdentity,
  } = props;
  useEffect(() => {
    let cancelled = false;
    if (!url) {
      return;
    }
    transition.prepareMount();
    recovery.beginMount();
    transition.mountIncoming(url, showingKey);
    const onHeadFailure = (code: string) => {
      if (!cancelled && transition.matchesTarget(url, itemIdentity ?? '')) {
        recovery.noteDetectFailure(code);
      }
    };
    void detectPreview(url, suppliedType, onHeadFailure)
      .then(config => {
        if (cancelled || !transition.matchesTarget(url, itemIdentity ?? '')) {
          return;
        }
        confirmedUnreachableRef.current.delete(url);
        recovery.noteMediaType(config.previewType);
        transition.resolveSource(url, {
          ...config,
          displayPreviewURL: url,
          displaySoftwareURL:
            config.previewType === PreviewHTMLTag.iframe &&
            !isModelMimeType(config.mimeType) &&
            usesWorkOrigin(url)
              ? ''
              : url,
        });
      })
      .catch((error: unknown) => {
        if (cancelled || !transition.matchesTarget(url, itemIdentity ?? '')) {
          return;
        }
        console.error('[ArtworkPlayer] Failed to detect preview type:', error);
        if (
          handleDetectionFailure(error, url, confirmedUnreachableRef.current, {
            noteRef,
            recovery,
            transition,
          })
        ) {
          return;
        }
        recovery.noteMediaType(PreviewHTMLTag.iframe);
        transition.resolveSource(url, fallbackIframeSource(url));
      });
    return () => {
      cancelled = true;
      recovery.clearLoadingDelay();
    };
  }, [
    url,
    suppliedType,
    reloadTick,
    itemIdentity,
    showingKey,
    transition,
    recovery,
  ]);
}

/** A slot chooses its data-document path once; later probe answers cannot reroute a playing work. */
function softwareURL(
  slot: SlotLayer,
  settings: DP1DisplayPreference | undefined
): string {
  if (
    slot.previewType !== PreviewHTMLTag.iframe ||
    isModelMimeType(slot.mimeType ?? '')
  ) {
    return slot.displayPreviewURL;
  }
  const resolved = resolveArtworkSourceURL(slot.displayPreviewURL);
  if (resolved.protocol !== 'data:') {
    return appendDisplayModeParam(
      resolved,
      settings?.scaling === Scaling.Fill ? 'crop' : 'fit'
    );
  }
  if (
    slot.displaySoftwareURL !== '' &&
    slot.displaySoftwareURL !== slot.displayPreviewURL
  ) {
    return slot.displaySoftwareURL;
  }
  const origin = resolveWorkOrigin(slot.displayPreviewURL);
  return origin.kind === 'ready'
    ? origin.url
    : origin.kind === 'pending'
      ? ''
      : dataDocumentURL(slot.displayPreviewURL);
}

/** Resolves iframe presentation URLs and retains blob resources for both fade layers. */
export function useArtworkSoftwareURLs(input: {
  slots: Slots;
  transition: ArtworkTransition;
  settings: DP1DisplayPreference | undefined;
  committedSettings: DP1DisplayPreference | undefined;
  viewMode: string | undefined;
}) {
  const { slots, transition, settings, committedSettings, viewMode } = input;
  const [originsReady, setOriginsReady] = useState(0);
  useEffect(
    () =>
      subscribeWorkOrigins(() => {
        setOriginsReady(n => n + 1);
      }),
    []
  );
  useEffect(() => {
    if (!settings || !viewMode) {
      return;
    }
    transition.updateSoftwareURLs((slot, index) =>
      softwareURL(
        slot,
        transition.incomingSlot === index
          ? settings
          : (committedSettings ?? settings)
      )
    );
  }, [transition, settings, committedSettings, viewMode, slots, originsReady]);
  useEffect(() => {
    const shown = slots.flatMap(slot => (slot ? [slot.displayPreviewURL] : []));
    releaseDataDocumentURLs(shown);
    forgetWorkOrigins(shown);
  }, [slots]);
  useEffect(
    () => () => {
      releaseDataDocumentURLs([]);
    },
    []
  );
}
