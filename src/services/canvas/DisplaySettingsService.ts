import {
  ArtFraming,
  TokenDisplaySettings,
  UpdateArtFramingRequest,
  UpdateDisplaySettingsReply,
  UpdateDisplaySettingsRequest,
} from '@/models';
import { Reply } from '@/models/cast_request_reply.model';
import { DP1DisplayPreference, Scaling } from '@/models/dp1.model';
import { v4 as uuidv4 } from 'uuid';

/** Owns committed composition identity, revision ordering, and settings-command acceptance. */
export class DisplaySettingsService {
  private compositionRevision = 0;

  private committedShowing?: { identity: string; id: string; owner: object };

  private displaySettingsReporter?: () => {
    showingKey: string;
    settings: DP1DisplayPreference | undefined;
    acceptsUpdates?: boolean;
  };

  // End cursor positions Service Update Listener

  // Display settings
  private displaySettingsChangedListeners: ((
    isSaveToDevice: boolean,
    displaySettings: DP1DisplayPreference
  ) => void)[] = [];

  public addDisplaySettingsChangedListener(
    callback: (
      isSaveToDevice: boolean,
      displaySettings: DP1DisplayPreference
    ) => void
  ) {
    this.displaySettingsChangedListeners.push(callback);
  }

  public removeDisplaySettingsChangedListener(
    callback: (
      isSaveToDevice: boolean,
      displaySettings: DP1DisplayPreference
    ) => void
  ) {
    this.displaySettingsChangedListeners =
      this.displaySettingsChangedListeners.filter(
        listener => listener !== callback
      );
  }

  public notifyDisplaySettingsChanged(
    isSaveToDevice: boolean,
    displaySettings: TokenDisplaySettings
  ) {
    this.displaySettingsChangedListeners.forEach(listener => {
      try {
        listener(isSaveToDevice, displaySettings);
      } catch (error) {
        console.error('Error in display settings listener:', error);
      }
    });
  }

  /** The mounted stage owns composition truth; never persist this snapshot. */
  public registerDisplaySettingsReporter(
    reporter: NonNullable<DisplaySettingsService['displaySettingsReporter']>,
    owner: object
  ): () => void {
    const { showingKey } = reporter();
    // The renderer's identity contains the source URL, which can carry signed
    // credentials. Export only a random ID. Keep it through effect cleanup and
    // settings-only commits so controllers do not discard their pending writes.
    // The owner marks one mounted stage. Waking/remounting the same source is
    // a new showing, while replacing that stage's layout effect is not.
    if (
      this.committedShowing?.identity !== showingKey ||
      this.committedShowing.owner !== owner
    ) {
      this.committedShowing = { identity: showingKey, id: uuidv4(), owner };
    }
    this.displaySettingsReporter = reporter;
    this.compositionRevision++;
    return () => {
      // A retiring stage must not clear its replacement's report.
      if (this.displaySettingsReporter === reporter) {
        this.displaySettingsReporter = undefined;
      }
    };
  }

  // Settings
  public updateArtFraming(request: UpdateArtFramingRequest): Reply {
    console.log('Update ArtFraming: ', JSON.stringify(request));

    const artFraming = Object.values(ArtFraming)[request.frameConfig];

    this.notifyDisplaySettingsChanged(true, {
      scaling:
        artFraming === ArtFraming.CropToFill ? Scaling.Fill : Scaling.Fit,
    });

    return { ok: true };
  }

  public updateDisplaySettings(
    request: UpdateDisplaySettingsRequest
  ): UpdateDisplaySettingsReply {
    if (
      request.framing !== undefined &&
      (!request.isSaved ||
        !['artwork', 'fit', 'fill'].includes(request.framing))
    ) {
      return {
        ok: false,
        error: 'Framing must be a saved artwork, fit, or fill preference.',
      };
    }
    const { showingKey, ...settings } = request;
    const composition = this.displaySettingsReporter?.();
    // Ephemeral writes belong to the showing the controller observed. During
    // a transition the hook follows the incoming selection before it is visible;
    // do not apply an outgoing or delayed command to that different showing.
    //
    // A request with no showingKey at all comes from a controller that predates
    // composition status (app builds through 1.8.6 send ephemeral Fit/Fill and
    // matting writes without one). Firmware reaches every wall before those
    // phones update, so a keyless write keeps the earlier contract and applies
    // unconditionally; the stale-target check only exists once a key is sent.
    const legacyClient = showingKey === undefined;
    if (
      !request.isSaved &&
      !legacyClient &&
      (!composition ||
        composition.acceptsUpdates === false ||
        showingKey !== this.committedShowing?.id)
    ) {
      return { ok: false, error: 'The showing changed or is still loading.' };
    }
    console.log(
      '[CanvasService] updateDisplaySettings: ',
      JSON.stringify(request)
    );

    // Capture before notifying React. This is the causal floor for the command:
    // a status at or below it was already committed before this write and
    // cannot confirm the requested field, even if the controller saw it later.
    const acceptedCompositionRevision = request.isSaved
      ? undefined
      : this.compositionRevision;
    this.notifyDisplaySettingsChanged(request.isSaved, settings);
    return {
      ok: true,
      ...(acceptedCompositionRevision === undefined
        ? {}
        : { acceptedCompositionRevision }),
    };
  }
  getComposition() {
    return this.displaySettingsReporter?.();
  }
  get revision() {
    return this.compositionRevision;
  }
  get showingId() {
    return this.committedShowing?.id;
  }
}
