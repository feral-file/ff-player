import { WORK_ORIGIN_MESSAGE, isWorkOriginURL } from '@/utils/workOrigin';
import { useEffect, useRef } from 'react';
import type { ArtworkLoadEvents } from './ArtworkLoadEvents';
import type { ArtworkTransition } from './ArtworkTransition';
import { SLOT_INDICES } from './artworkTypes';
import type { SlotMediaResources } from './SlotMediaResources';

/** One trusted private-channel completion per frame; public shell loads never commit playback. */
class WorkOriginFrames {
  private readonly completed = new WeakSet<HTMLIFrameElement>();
  private readonly opened = new WeakSet<HTMLIFrameElement>();
  constructor(
    private readonly media: SlotMediaResources,
    private readonly transition: ArtworkTransition,
    private readonly events: () => ArtworkLoadEvents
  ) {}
  private report(frame: HTMLIFrameElement, type: unknown) {
    const index = SLOT_INDICES.find(i => this.media.frame(i) === frame);
    const slot = index === undefined ? null : this.transition.slot(index);
    if (
      index === undefined ||
      !slot ||
      !isWorkOriginURL(slot.displaySoftwareURL) ||
      this.completed.has(frame)
    ) {
      return;
    }
    if (type === WORK_ORIGIN_MESSAGE.loaded) {
      this.completed.add(frame);
      this.events().iframeLoaded(index, slot);
    } else if (type === WORK_ORIGIN_MESSAGE.error) {
      this.completed.add(frame);
      this.events().iframeFailed(index, slot);
    }
  }
  message(event: MessageEvent) {
    const type = (event.data as { type?: unknown } | null)?.type;
    if (type !== WORK_ORIGIN_MESSAGE.ready) {
      return;
    }
    SLOT_INDICES.forEach(index => {
      const frame = this.media.frame(index);
      const slot = this.transition.slot(index);
      if (
        !frame ||
        !slot ||
        event.source !== frame.contentWindow ||
        !isWorkOriginURL(slot.displaySoftwareURL) ||
        event.origin !== new URL(slot.displaySoftwareURL).origin ||
        this.opened.has(frame)
      ) {
        return;
      }
      this.opened.add(frame);
      const channel = new MessageChannel();
      channel.port1.onmessage = report => {
        this.report(frame, (report.data as { type?: unknown } | null)?.type);
      };
      frame.contentWindow?.postMessage(
        {
          type: WORK_ORIGIN_MESSAGE.open,
          source: slot.displayPreviewURL.trim(),
        },
        event.origin,
        [channel.port2]
      );
    });
  }
}

/** Keeps shell authentication independent of ordinary iframe load/error handlers. */
export function useWorkOriginFrame(
  media: SlotMediaResources,
  transition: ArtworkTransition,
  events: ArtworkLoadEvents
) {
  const latestEvents = useRef(events);
  useEffect(() => {
    latestEvents.current = events;
  });
  useEffect(() => {
    const frames = new WorkOriginFrames(
      media,
      transition,
      () => latestEvents.current
    );
    const message = (event: MessageEvent) => {
      frames.message(event);
    };
    window.addEventListener('message', message);
    return () => {
      window.removeEventListener('message', message);
    };
  }, [media, transition]);
}
