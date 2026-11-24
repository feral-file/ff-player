/**
 * How the player names a work (feral-file#3615). Sean and Casey settled the
 * form on an FF1 on 2026-11-24: no label over the work; a full-black title
 * card when a playlist starts and once an hour after, for ten seconds. These
 * are constants of the build. The design sessions read them from a file
 * beside the bundle and polled it; that is gone, and nothing reads tuning
 * from the network.
 *
 * The other forms (`label`, `card`, `both`) and their knobs remain so the
 * earlier forms can be looked at again by changing `DEFAULT_LABEL_TUNING`.
 */
export interface LabelTuning {
  /**
   * What names a work that has no curator's note: `label` is the label over
   * the work, `card` is a full-screen card before it, `both` is the card and
   * then the label. `off` names no work at all: no label and no work or note
   * cards, only the title card every `episodeMinutes`.
   */
  form: 'label' | 'card' | 'both' | 'off';
  /**
   * With form `off`: minutes between showings of the title card (season and
   * episode, the work on screen, its description, a QR code). It shows when
   * the playlist starts, then on this timer for `titleSeconds`. 0 shows it
   * only at the start.
   */
  episodeMinutes: number;
  /** With form `off`: show the title card before every work instead of on the timer. */
  titleEveryWork: boolean;
  /** Seconds the title card stays. */
  titleSeconds: number;
  /** When above 0, every other title card stays this long instead, to compare two lengths. */
  titleSecondsAlt: number;
  /** Where the title card's QR code leads; empty draws no code. */
  qrUrl: string;
  /** Show the work's description on the title card; off leaves it to the page behind the QR code. */
  titleDescription: boolean;
  /** The line under the QR code; empty draws none. */
  qrCaption: string;
  /** Seconds the full-screen card for a work stays. */
  cardSeconds: number;
  /** Seconds a note stays when the note sets no duration (spec default 20). */
  noteSeconds: number;
  /** Seconds the label over the work stays in timed mode. */
  labelSeconds: number;
  /** Seconds after the label hides until it returns; 0 means it stays hidden. */
  labelReturnSeconds: number;
  /** Show the exhibition's name on the label and the cards. */
  exhibitionLine: boolean;
  /** Show the work's place in the exhibition ("2 / 18"). */
  position: boolean;
  /** Multiplier on the label's size. */
  labelScale: number;
  /** Multiplier on the cards' type. */
  cardScale: number;
  /** Where the card's text block sits. */
  cardAlign: 'bottom' | 'center';
  /** Card colors. */
  cardBackground: string;
  cardColor: string;
  cardMuted: string;
}

export const DEFAULT_LABEL_TUNING: LabelTuning = {
  form: 'off',
  episodeMinutes: 60,
  titleEveryWork: false,
  titleSeconds: 10,
  titleSecondsAlt: 0,
  qrUrl: '',
  qrCaption: '',
  titleDescription: false,
  cardSeconds: 6,
  noteSeconds: 20,
  labelSeconds: 30,
  labelReturnSeconds: 0,
  exhibitionLine: true,
  position: true,
  labelScale: 1,
  cardScale: 1,
  cardAlign: 'bottom',
  cardBackground: '#000000',
  cardColor: '#EDEDED',
  cardMuted: '#8A8A8A',
};

/** Keeps only keys whose value has the default's type, so a typo cannot break the label. */
export function mergeLabelTuning(raw: unknown): LabelTuning {
  const merged: Record<string, unknown> = { ...DEFAULT_LABEL_TUNING };
  if (raw === null || typeof raw !== 'object') {
    return DEFAULT_LABEL_TUNING;
  }
  for (const [key, fallback] of Object.entries(DEFAULT_LABEL_TUNING)) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === typeof fallback) {
      merged[key] = value;
    }
  }
  return merged as unknown as LabelTuning;
}

/** The build's tuning. A hook so its callers need not change if it ever varies by device. */
export function useLabelTuning(): LabelTuning {
  return DEFAULT_LABEL_TUNING;
}
