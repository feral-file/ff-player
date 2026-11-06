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

/** An absent or empty authored MIME type uses the existing network detector. */
async function detectPreview(url: string, suppliedType: string | undefined) {
  const resolvedType =
    suppliedType !== undefined && suppliedType !== ''
      ? suppliedType
      : await getContentTypeFromURL(url);
  const mimeType = resolvedType.toLowerCase();
  return { mimeType, ...getPreviewTypeConfig(mimeType) };
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
  }
): boolean {
  const { noteRef, recovery } = failureOwners;
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
  }
  if (error.isNetworkFailure) {
    noteRef.current(url, true);
    recovery.markArtworkFailed();
    return true;
  }
  if (confirmedUnreachable.has(url)) {
    recovery.fail();
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
    void detectPreview(url, suppliedType)
      .then(config => {
        if (cancelled || !transition.matchesTarget(url, itemIdentity ?? '')) {
          return;
        }
        confirmedUnreachableRef.current.delete(url);
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
          })
        ) {
          return;
        }
        transition.resolveSource(url, {
          previewType: PreviewHTMLTag.iframe,
          isStreaming: false,
          displayPreviewURL: url,
          displaySoftwareURL: usesWorkOrigin(url) ? '' : url,
          mimeType: null,
        });
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
