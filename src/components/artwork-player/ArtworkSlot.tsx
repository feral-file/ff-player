import { PreviewHTMLTag } from '@/models';
import { DP1DisplayPreference } from '@/models/dp1.model';
import { artworkIframeSandbox } from '@/utils/dataDocument';
import { convertScalingToObjectFit } from '@/utils/helper';
import { isWorkOriginURL } from '@/utils/workOrigin';
import ModelViewerScreen from '../model-viewer/ModelViewerScreen';
import type { ArtworkLoadEvents } from './ArtworkLoadEvents';
import type { ArtworkTransition } from './ArtworkTransition';
import { FADE_IN_OUT_DURATION_MS, SlotIndex, SlotLayer } from './artworkTypes';
import type { SlotMediaResources } from './SlotMediaResources';
import styles from './styles.module.scss';

export interface ArtworkSlotProps {
  index: SlotIndex;
  slot: SlotLayer;
  opacity: number;
  top: boolean;
  resources: SlotMediaResources;
  transition: ArtworkTransition;
  events: ArtworkLoadEvents;
  settings: DP1DisplayPreference | undefined;
  committedSettings: DP1DisplayPreference | undefined;
  isCustomView?: boolean;
  showModelLoading: boolean;
  onSourceEnded?: (identity: string) => void;
}

function ImageSlot({
  index,
  resources,
  committedSettings,
  isCustomView,
}: ArtworkSlotProps) {
  return (
    <div
      style={{ width: '100%', height: '100%' }}
      className={isCustomView ? styles.customRendering : ''}>
      <img
        ref={resources.refs(index).image}
        style={{
          width: '100%',
          height: '100%',
          objectFit: convertScalingToObjectFit(committedSettings?.scaling),
        }}
        className={styles.image}
        alt="Preview"
      />
    </div>
  );
}

function VideoSlot({
  index,
  slot,
  resources,
  transition,
  committedSettings,
  settings,
  onSourceEnded,
}: ArtworkSlotProps) {
  return (
    <video
      key={`v-${String(slot.iframeKey)}`}
      ref={resources.refs(index).video}
      style={{
        width: '100%',
        height: '100%',
        objectFit: convertScalingToObjectFit(committedSettings?.scaling),
      }}
      autoPlay={false}
      loop={settings?.loop ?? true}
      playsInline
      crossOrigin="anonymous"
      onEnded={() => {
        transition.sourceEnded(index, onSourceEnded);
      }}
    />
  );
}

function AudioSlot({
  index,
  slot,
  resources,
  transition,
  settings,
  onSourceEnded,
}: ArtworkSlotProps) {
  return (
    <audio
      key={`a-${String(slot.iframeKey)}`}
      ref={resources.refs(index).audio}
      autoPlay={settings?.autoPlay ?? true}
      loop={settings?.loop ?? true}
      onEnded={() => {
        transition.sourceEnded(index, onSourceEnded);
      }}
    />
  );
}

function FrameSlot({ index, slot, resources, events }: ArtworkSlotProps) {
  if (!slot.displaySoftwareURL) {
    return null;
  }
  if (slot.previewType === PreviewHTMLTag.iframePDF) {
    return (
      <iframe
        className={styles.iframe}
        src={slot.displaySoftwareURL}
        onLoad={() => {
          events.iframeLoaded(index, slot);
        }}
        onError={() => {
          events.iframeFailed(index, slot);
        }}
        tabIndex={0}
      />
    );
  }
  // A sandbox change must mount a new element before its source can navigate.
  return (
    <iframe
      key={`${String(slot.iframeKey)}-${artworkIframeSandbox(slot.displaySoftwareURL)}`}
      ref={resources.refs(index).iframe}
      className={styles.iframe}
      src={slot.displaySoftwareURL}
      onLoad={() => {
        if (!isWorkOriginURL(slot.displaySoftwareURL)) {
          events.iframeLoaded(index, slot);
        }
      }}
      onError={() => {
        if (!isWorkOriginURL(slot.displaySoftwareURL)) {
          events.iframeFailed(index, slot);
        }
      }}
      sandbox={artworkIframeSandbox(slot.displaySoftwareURL)}
      tabIndex={0}
    />
  );
}

function SlotContent(props: ArtworkSlotProps) {
  const { index, slot, transition, events, showModelLoading } = props;
  switch (slot.previewType) {
    case PreviewHTMLTag.image:
      return <ImageSlot {...props} />;
    case PreviewHTMLTag.video:
      return <VideoSlot {...props} />;
    case PreviewHTMLTag.audio:
      return <AudioSlot {...props} />;
    case PreviewHTMLTag.iframe:
    case PreviewHTMLTag.iframePDF:
      return <FrameSlot {...props} />;
    case PreviewHTMLTag.object:
      return (
        <object
          style={{ width: '100%', height: '100%' }}
          data={slot.displayPreviewURL}
          type={slot.mimeType ?? undefined}
          onLoad={() => {
            transition.loadedSource(index, slot);
          }}
          onError={() => {
            events.iframeFailed(index, slot);
          }}>
          Not supported
        </object>
      );
    case PreviewHTMLTag.model:
      return (
        <div style={{ width: '100%', height: '100%' }}>
          <ModelViewerScreen
            key={slot.iframeKey}
            src={slot.displayPreviewURL}
            onLoad={() => {
              events.modelLoaded(index, slot);
            }}
            onError={() => {
              events.modelFailed(index, slot);
            }}
            showLoadingOverlay={showModelLoading}
          />
        </div>
      );
    default:
      return null;
  }
}

/** Renders a slot without taking ownership of its load or transition lifecycle. */
export function ArtworkSlot(props: ArtworkSlotProps) {
  const { slot, opacity, top } = props;
  if (!slot.displayPreviewURL || !slot.previewType) {
    return null;
  }
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        opacity,
        transition: `opacity ${FADE_IN_OUT_DURATION_MS.toString()}ms ease`,
        zIndex: top ? 3 : opacity > 0 ? 2 : 0,
        pointerEvents: opacity < 0.05 ? 'none' : 'auto',
      }}>
      <SlotContent {...props} />
    </div>
  );
}
