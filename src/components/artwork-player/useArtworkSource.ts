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
    void detectPreview(url, suppliedType)
      .then(config => {
        if (cancelled || !transition.matchesTarget(url, itemIdentity ?? '')) {
          return;
        }
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
          error instanceof ContentTypeDetectionError &&
          error.isNetworkFailure
        ) {
          noteRef.current(url, true);
          recovery.markArtworkFailed();
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
