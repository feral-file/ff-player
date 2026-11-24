'use client';

import type { CardContent } from '@/components/tombstone/ExhibitionCard';
import type { DP1Call, DP1Entity, DP1Item } from '@/models/dp1.model';
import { useTombstoneInfo } from '@/services/custom-hooks/useTombstoneInfo';
import { TombstoneMode } from '@/models/display_settings.model';
import { useLabelTuning, type LabelTuning } from '@/utils/labelTuning';
import { itemIdentityFor, normalizePlaylistIndex } from '@/utils/playlist';
import { useEffect, useMemo, useState } from 'react';

/**
 * How long a card may wait, past its own time, for the work behind it to be
 * on screen. A work that never loads must not leave the card up for good:
 * the player's own failure handling has to be visible.
 */
const WAIT_FOR_WORK_MS = 15000;

type CardKind = CardContent['kind'];
interface Step {
  kind: CardKind;
  seconds: number;
}

/** "Ada", "Ada and Bo", "Ada, Bo and Cy"; partners are not curators. */
export function curatorNames(playlist: DP1Call | undefined): string | undefined {
  const names = (playlist?.curators ?? [])
    .filter((entity: DP1Entity) => entity.role !== 'partner')
    .map(entity => entity.name?.trim() ?? '')
    .filter(name => name !== '');
  if (names.length === 0) {
    return playlist?.curator ?? undefined;
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/**
 * The exhibition's name for the label and cards: the playlist's title, when
 * the playlist is more than one work shown on its own. A single work sent by
 * address has a title that only repeats the work's.
 */
export function exhibitionName(
  playlist: DP1Call | undefined,
  itemCount: number
): string | undefined {
  const title = playlist?.title.trim();
  if (!title) {
    return undefined;
  }
  const curated = Boolean(playlist?.note) || Boolean(curatorNames(playlist));
  return itemCount > 1 || curated ? title : undefined;
}

function noteSeconds(duration: number | undefined, tuning: LabelTuning): number {
  return typeof duration === 'number' && duration > 0
    ? duration
    : tuning.noteSeconds;
}

/** The cards owed before the work at `index`, in order. */
export function stepsFor(
  call: DP1Call | undefined,
  item: DP1Item | undefined,
  index: number,
  tuning: LabelTuning
): Step[] {
  const steps: Step[] = [];
  if (index === 0 && call?.note?.text) {
    steps.push({
      kind: 'opening',
      seconds: noteSeconds(call.note.duration, tuning),
    });
  }
  if (item?.note?.text) {
    steps.push({ kind: 'note', seconds: noteSeconds(item.note.duration, tuning) });
  } else if (item && tuning.form !== 'label') {
    steps.push({ kind: 'work', seconds: tuning.cardSeconds });
  }
  return steps;
}

/**
 * Walks the steps for one showing: each card for its seconds, then the last
 * one held until the work is on screen (or WAIT_FOR_WORK_MS passes).
 * Returns the current step index and whether a card covers the screen.
 */
function useCardClock(showingKey: string, steps: Step[], workIsUp: boolean) {
  const [state, setState] = useState({ key: '', step: 0, timeUp: false });
  const current = state.key === showingKey ? state : null;
  const stepCount = steps.length;
  const seconds = steps[current?.step ?? 0]?.seconds ?? 0;

  useEffect(() => {
    setState({ key: showingKey, step: 0, timeUp: false });
  }, [showingKey, stepCount]);

  useEffect(() => {
    if (!current || current.timeUp || stepCount === 0) {
      return;
    }
    const isLast = current.step >= stepCount - 1;
    const timer = setTimeout(() => {
      setState(previous =>
        isLast
          ? { ...previous, timeUp: true }
          : { ...previous, step: previous.step + 1 }
      );
    }, seconds * 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [current, stepCount, seconds]);

  const [waitedOut, setWaitedOut] = useState(false);
  const waiting = Boolean(current?.timeUp) && !workIsUp;
  useEffect(() => {
    setWaitedOut(false);
    if (!waiting) {
      return;
    }
    const timer = setTimeout(() => {
      setWaitedOut(true);
    }, WAIT_FOR_WORK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [waiting, showingKey]);

  const covering =
    stepCount > 0 &&
    showingKey !== '' &&
    (!current || !current.timeUp || (waiting && !waitedOut));
  return { step: Math.min(current?.step ?? 0, stepCount - 1), covering };
}

interface CardInputs {
  call: DP1Call | undefined;
  playlist: DP1Item[];
  currentIndex: number;
  showingKey: string;
  committedIdentity: string;
  enabled: boolean;
  tuning: LabelTuning;
}

/**
 * Decides the full-screen card for the selected work (feral-file#3615).
 *
 * Cards follow SELECTION, not the committed work: a card comes up as soon as
 * the player turns to the next work and stays while that work loads behind
 * it, so the note is read before the work is seen (playlists extension
 * §3.4). The label over the work keeps following the committed work
 * (`useTombstone`); `covering` tells the route to hold the label until the
 * card has left.
 *
 * The item's own duration clock is not paused while a card is up, so a card
 * takes its seconds out of the work's time on screen.
 */
export function useExhibitionCards(inputs: CardInputs) {
  const { call, playlist, currentIndex, showingKey, tuning } = inputs;
  const count = playlist.length;
  const index = count > 0 ? normalizePlaylistIndex(currentIndex, count) : 0;
  const item = currentIndex >= 0 && count > 0 ? playlist[index] : undefined;
  // A withheld work is never looked up: no manifest request names it.
  const { artistName, title } = useTombstoneInfo(
    inputs.enabled ? item : undefined
  );
  const steps = useMemo(
    () => (inputs.enabled ? stepsFor(call, item, index, tuning) : []),
    [inputs.enabled, call, item, index, tuning]
  );
  const workIsUp =
    item !== undefined &&
    itemIdentityFor(playlist, index) === inputs.committedIdentity;
  const { step, covering } = useCardClock(showingKey, steps, workIsUp);
  const exhibition = tuning.exhibitionLine
    ? exhibitionName(call, count)
    : undefined;
  const position =
    tuning.position && count > 1
      ? `${String(index + 1)} / ${String(count)}`
      : undefined;

  const card = useMemo((): CardContent | null => {
    const current = steps.at(step);
    if (!current) {
      return null;
    }
    const note = current.kind === 'opening' ? call?.note : item?.note;
    return {
      kind: current.kind,
      key: `${showingKey}:${String(step)}`,
      seconds: current.seconds,
      exhibition: current.kind === 'opening' ? call?.title : exhibition,
      position,
      curators: curatorNames(call),
      artist: artistName,
      title,
      noteTitle: note?.title,
      text: note?.text,
      credit: note?.author?.name,
    };
  }, [steps, step, call, item, showingKey, exhibition, position, artistName, title]);

  // A work card with nothing to name says nothing; skip it.
  const usable = card && (card.kind !== 'work' || card.title) ? card : null;
  return {
    card: usable,
    covering: covering && usable !== null,
    exhibitionLine: [exhibition, position].filter(Boolean).join(' · '),
  };
}

/**
 * The route's one call for everything this adds to the label: the tuning,
 * the current card, the exhibition line, and the label mode with the card's
 * hold applied. `mode` is the owner's label setting, already `Off` when the
 * work is withheld; `Off` means no text over the art, cards included.
 */
export function useExhibitionLabel(
  inputs: Omit<CardInputs, 'enabled' | 'tuning'> & { mode: TombstoneMode }
) {
  const { mode, ...rest } = inputs;
  const labelTuning = useLabelTuning();
  const cards = useExhibitionCards({
    ...rest,
    enabled: mode !== TombstoneMode.Off,
    tuning: labelTuning,
  });
  // The label waits for the card to leave. When the form is card-only and a
  // card named the work, the label does not follow it.
  const held =
    cards.covering ||
    (labelTuning.form === 'card' && cards.card?.kind === 'work');
  return {
    tombstoneMode: held ? TombstoneMode.Off : mode,
    labelTuning,
    card: cards.card,
    cardVisible: cards.covering,
    exhibitionLine: cards.exhibitionLine,
  };
}
