import { PreviewHTMLTag } from '@/models';
import { DP1DisplayPreference } from '@/models/dp1.model';
import { artworkIframeSandbox } from '@/utils/dataDocument';
import { convertScalingToObjectFit } from '@/utils/helper';
import { isWorkOriginURL } from '@/utils/workOrigin';
import ModelViewerScreen from '../model-viewer/ModelViewerScreen';
import type { ArtworkLoadEvents } from './ArtworkLoadEvents';
import type { ArtworkTransition } from './ArtworkTransition';
import { FADE_IN_OUT_DURATION_MS, SlotIndex, SlotLayer } from './artworkTypes';
import { useImageRendering } from './imageRendering';
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
  showModelLoading: boolean;
  onSourceEnded?: (identity: string) => void;
}

/** Draws a still; its resampling follows the work's `imageRendering` or, absent that, how far it is enlarged. */
function ImageSlot({ index, resources, committedSettings }: ArtworkSlotProps) {
  const imageRef = resources.refs(index).image;
  const objectFit = convertScalingToObjectFit(committedSettings?.scaling);
  const imageRendering = useImageRendering(
    imageRef,
    committedSettings?.imageRendering,
    objectFit
  );
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <img
        ref={imageRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit,
          imageRendering,
        }}
        className={styles.image}
        alt="Preview"
      />
    </div>
  );
}

/** Draws a video; its resampling follows the same rule as a still's. */
function VideoSlot({
  index,
  slot,
  resources,
  transition,
  committedSettings,
  settings,
  onSourceEnded,
}: ArtworkSlotProps) {
  const videoRef = resources.refs(index).video;
  const objectFit = convertScalingToObjectFit(committedSettings?.scaling);
  const imageRendering = useImageRendering(
    videoRef,
    committedSettings?.imageRendering,
    objectFit
  );
  return (
    <video
      key={`v-${String(slot.iframeKey)}`}
      ref={videoRef}
      style={{
        width: '100%',
        height: '100%',
        objectFit,
        imageRendering,
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
  // Always: the FF1 has no play control (see DP1DisplayPreference.autoplay).
  return (
    <audio
      key={`a-${String(slot.iframeKey)}`}
      ref={resources.refs(index).audio}
      autoPlay
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
