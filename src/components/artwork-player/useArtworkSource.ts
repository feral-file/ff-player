import { PreviewHTMLTag } from '@/models';
import { DP1DisplayPreference, Scaling } from '@/models/dp1.model';
import { dataDocumentURL, releaseDataDocumentURLs } from '@/utils/dataDocument';
import { loadsAsImage } from '@/utils/imageProbe';
import { daemonConnectivity } from '@/services/DaemonConnectivity';
import { isUnresolvableHost, probeGet } from '@/utils/sourceProbe';
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
 * The source for a slot whose Content-Type probe failed: an image when the
 * browser can decode the URL as one, otherwise the untyped iframe;
 * 'unreachable' when the source is proven not to answer.
 *
 * The iframe is a guess for "probably a web page". It is the wrong guess for
 * an image, which draws there at its natural size, unscaled (see
 * loadsAsImage). A source proven to be an image is typed `image/*`, so it
 * takes the image slot, follows the display's scaling, and reports its load
 * outcome like any typed image. Everything else keeps the untyped iframe and
 * its rule of reporting no outcome.
 *
 * It is also the wrong guess for a source that answers nothing: the iframe
 * shows Chromium's own error page and reports it `ready`. So when the `HEAD`
 * got no response ([headUnanswered]), a plain GET decides first (see
 * probeGet). The `HEAD` alone never fails a work: a host may refuse it and
 * still serve the page. The GET fails it only on evidence a browser policy
 * block cannot produce: silence for the whole bound, or a rejection from a
 * host no resolver answers (isUnresolvableHost, e.g. an onchfs work the
 * device has not read from chain yet). Any other rejection keeps the
 * fallback iframe, because CORP can block the fetch of a page the iframe
 * still shows (ff-player#337 review F1). Any GET without an answer while the
 * device is offline by then is the device's failure, not the source's:
 * 'offline' (review F2; a dropped link usually rejects the GET at once).
 */
async function untypedSource(
  url: string,
  headUnanswered: boolean
): Promise<
  | { previewType: PreviewHTMLTag; source: Partial<SlotLayer> }
  | 'unreachable'
  | 'offline'
> {
  const resolved = resolveArtworkSourceURL(url);
  const isHTTP = resolved.protocol === 'http:' || resolved.protocol === 'https:';
  if (isHTTP && headUnanswered) {
    const get = await probeGet(resolved.toString());
    if (get !== 'answered' && deviceOffline()) {
      return 'offline';
    }
    if (
      get === 'silent' ||
      (get === 'rejected' && isUnresolvableHost(resolved.toString()))
    ) {
      return 'unreachable';
    }
  }
  const isImage = isHTTP && (await loadsAsImage(resolved.toString()));
  if (!isImage) {
    return {
      previewType: PreviewHTMLTag.iframe,
      source: fallbackIframeSource(url),
    };
  }
  return {
    previewType: PreviewHTMLTag.image,
    source: {
      previewType: PreviewHTMLTag.image,
      isStreaming: false,
      displayPreviewURL: url,
      displaySoftwareURL: url,
      mimeType: 'image/*',
    },
  };
}

/**
 * Resolves an untyped source (see untypedSource) and mounts it, unless the
 * mount that asked was superseded while the probes ran. The probes are
 * async where the old iframe guess was not, so a newer mount for the slot can
 * have started in between; [stillWanted] is the same cancelled-or-retargeted
 * check the typed path makes.
 *
 * A GET that failed while the device went offline takes the offline path
 * (failOffline), which raises degraded and spends none of the work's retry
 * budget (ff-player#337 review F2). A source proven not to answer (see
 * untypedSource) is declared failed as `detect/unreachable`: `transition.fail()`
 * commits the failed slot (releasing the settings latch so a later item can
 * still commit) before calling `recovery.fail()`, and the slot's source URLs
 * stay empty, so no iframe mounts and no error page reaches the wall. The
 * "cannot be displayed" message and the ordinary retry/advance budget follow.
 * Ring (mediaHealth v1): the probe observer already recorded this attempt's
 * `detect/network` (device-local, never counted); `detect/unreachable` is the
 * attempt's countable verdict, like a watchdog expiry. controld drops both
 * for an onchfs source, whose bytes come only from the device.
 */
function mountUntyped(
  url: string,
  headUnanswered: boolean,
  owners: {
    recovery: ArtworkRecovery;
    transition: ArtworkTransition;
    noteRef: { current: (url: string, failed: boolean) => void };
  },
  stillWanted: () => boolean
): void {
  // The probes end by themselves (SOURCE_GET_TIMEOUT_MS,
  // IMAGE_PROBE_TIMEOUT_MS), so the load is bounded while they run. Without
  // this the playlist treats the wait as an unbounded load and advances an
  // expired slot: a five-second item with a one-second-plus probe was
  // skipped before any renderer mounted. The renderer that mounts next sets
  // the flag for its own watchdog.
  owners.recovery.markLoadBounded(true);
  void untypedSource(url, headUnanswered).then(untyped => {
    if (!stillWanted()) {
      return;
    }
    if (untyped === 'offline') {
      failOffline(url, owners);
      return;
    }
    if (untyped === 'unreachable') {
      owners.transition.fail(
        { stage: 'detect', code: 'unreachable' },
        owners.transition.incomingSlot ?? undefined
      );
      return;
    }
    owners.recovery.noteMediaType(untyped.previewType);
    owners.transition.resolveSource(url, untyped.source);
  });
}

/**
 * The offline corroboration getContentTypeFromURL applies, read now without
 * waiting: the browser's interface is down, or the daemon's last verdict is
 * offline.
 */
function deviceOffline(): boolean {
  return (
    (typeof navigator !== 'undefined' && !navigator.onLine) ||
    daemonConnectivity() === false
  );
}

/**
 * Raises the offline signal for [url] and fails the mount without a
 * per-item verdict: offline recovery owns the remount.
 */
function failOffline(
  url: string,
  owners: {
    noteRef: { current: (url: string, failed: boolean) => void };
    recovery: ArtworkRecovery;
  }
): void {
  owners.noteRef.current(url, true);
  owners.recovery.markArtworkFailed();
}

/**
 * Applies the device-wide offline case of a detection failure: the `HEAD`
 * got no response and the device is corroborated offline. Returns true when
 * it handled the failure; false means the caller mounts the source untyped.
 */
function handleOfflineDetection(
  error: unknown,
  url: string,
  owners: {
    noteRef: { current: (url: string, failed: boolean) => void };
    recovery: ArtworkRecovery;
  }
): boolean {
  if (!(error instanceof ContentTypeDetectionError) || !error.isNetworkFailure) {
    return false;
  }
  // The `detect/network` ring entry was already recorded by the probe
  // observer when no response arrived, so this path only raises the offline
  // signal and fails the mount.
  failOffline(url, owners);
  return true;
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
    const isCurrent = () =>
      !cancelled && transition.matchesTarget(url, itemIdentity ?? '');
    const onHeadFailure = (code: string) => {
      if (isCurrent()) {
        recovery.noteDetectFailure(code);
      }
    };
    void detectPreview(url, suppliedType, onHeadFailure)
      .then(config => {
        if (!isCurrent()) {
          return;
        }
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
        if (!isCurrent()) {
          return;
        }
        console.error('[ArtworkPlayer] Failed to detect preview type:', error);
        if (handleOfflineDetection(error, url, { noteRef, recovery })) {
          return;
        }
        const headUnanswered =
          error instanceof ContentTypeDetectionError && !error.reachedServer;
        mountUntyped(
          url,
          headUnanswered,
          { recovery, transition, noteRef },
          isCurrent
        );
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
