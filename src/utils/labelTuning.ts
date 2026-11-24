'use client';

import { useEffect, useState } from 'react';

/**
 * Prototype knobs for the label and the cards (feral-file#3615): the values
 * Sean and Casey are settling by looking at a real screen. The player reads
 * them from `/label-tuning.json`, a static file beside the bundle, and
 * re-reads it every few seconds, so editing that file on a device changes the
 * label without a rebuild or a new display command.
 *
 * This file exists for the design session. Once the values are decided they
 * become constants and the polling goes away; nothing else may read tuning
 * from the network.
 */
export interface LabelTuning {
  /**
   * What names a work that has no curator's note: `label` is the label over
   * the work, `card` is a full-screen card before it, `both` is the card and
   * then the label.
   */
  form: 'label' | 'card' | 'both';
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
  form: 'label',
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

const TUNING_URL = '/label-tuning.json';
const POLL_MS = 3000;

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

/** Current tuning; the defaults until the file is read, and whenever it is missing or malformed. */
export function useLabelTuning(): LabelTuning {
  const [tuning, setTuning] = useState<LabelTuning>(DEFAULT_LABEL_TUNING);
  useEffect(() => {
    let stopped = false;
    let lastText = '';
    const read = () => {
      // Inside a promise so a fetch that throws outright cannot break the route.
      Promise.resolve()
        .then(() => fetch(TUNING_URL, { cache: 'no-store' }))
        .then(response => (response.ok ? response.text() : ''))
        .then(text => {
          if (stopped || text === lastText) {
            return;
          }
          lastText = text;
          setTuning(mergeLabelTuning(text ? JSON.parse(text) : null));
        })
        .catch(() => undefined);
    };
    read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  return tuning;
}
